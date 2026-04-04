import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { ensureDirectory, slugify, truncateText } from '../../core/utils.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import { LabelStateMachine } from '../../state/label-state-machine.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface ReviewAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

type ReviewCheckSeverity = 'quality' | 'security';

interface ReviewCheck {
  label: string;
  command: string;
  args: string[];
  weight?: number;
  required?: boolean;
  severity?: ReviewCheckSeverity;
}

interface ResolvedReviewCheck {
  label: string;
  command: string;
  args: string[];
  weight: number;
  required: boolean;
  severity: ReviewCheckSeverity;
}

interface ReviewCheckAttempt {
  attempt: number;
  passed: boolean;
  exitCode: number | null;
  summary: string;
}

interface ReviewCheckResult extends ResolvedReviewCheck {
  passed: boolean;
  exitCode: number | null;
  summary: string;
  attemptsUsed: number;
  attemptHistory: ReviewCheckAttempt[];
}

interface ReviewEscalation {
  required: boolean;
  target?: 'TechLead' | 'CISO';
  reason?: string;
}

interface ReviewCoverageSummary {
  required: boolean;
  threshold?: number;
  actual?: number;
  sourceLabel?: string;
  passed?: boolean;
  note: string;
}

interface ReviewSecuritySummary {
  totalChecks: number;
  passedChecks: string[];
  failedChecks: string[];
  note: string;
}

interface ReviewArtifactPayload {
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  score: number;
  minScore: number;
  maxRetries: number;
  reviewCwd: string;
  worktreePath?: string;
  escalation: ReviewEscalation;
  coverage?: ReviewCoverageSummary;
  security: ReviewSecuritySummary;
  checks: ReviewCheckResult[];
  generatedAt: string;
}

const DEFAULT_REVIEW_CHECKS: ResolvedReviewCheck[] = [
  {
    label: 'typecheck',
    command: 'npm',
    args: ['run', 'typecheck'],
    weight: 60,
    required: true,
    severity: 'quality',
  },
  {
    label: 'tests',
    command: 'npm',
    args: ['test'],
    weight: 40,
    required: true,
    severity: 'quality',
  },
];

const DEFAULT_REVIEW_MIN_SCORE = 100;
const DEFAULT_REVIEW_MAX_RETRIES = 0;

export function createReviewAgentHandler(options: ReviewAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'review-local-checks',
    mode: 'connected',
    description:
      'Runs repo-local validation commands, records score/retry/escalation artifacts, and optionally syncs the issue into reviewing.',
    execute: async ({ task, definition, context }) => {
      const rootDir = context.rootDir || options.rootDir;
      const reviewCwd = resolveReviewWorkingDirectory(rootDir, context.env);
      const checks = resolveReviewChecks(context.env);
      const maxRetries = resolveReviewMaxRetries(context.env);
      const minScore = resolveReviewMinScore(context.env);
      const results = checks.map((check) =>
        runReviewCheckWithRetries({
          check,
          cwd: reviewCwd,
          env: context.env,
          maxRetries,
          logRetry: (message) => context.logger.warn(message),
        }),
      );
      const score = calculateQualityScore(results);
      const coverage = resolveCoverageSummary(results, context.env);
      const security = summarizeSecurityResults(results);
      const escalation = determineEscalation(results, score, minScore, coverage);
      const artifact = writeReviewArtifacts({
        rootDir,
        reviewCwd,
        worktreePath: context.worktree?.worktreePath,
        issueNumber: context.issueNumber,
        sessionId: context.sessionId,
        taskId: task.id,
        taskTitle: task.title,
        score,
        minScore,
        maxRetries,
        results,
        escalation,
        coverage,
        security,
      });

      const syncNote = await syncIssueState({
        env: context.env,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
      });

      const failedChecks = results.filter((result) => !result.passed);
      const requiredFailures = failedChecks.filter((result) => result.required);
      const coverageGateFailed = coverage?.required && coverage.passed !== true;
      const notes = [
        `${definition.name} ran ${results.length} configured checks in ${describeReviewCwd(
          rootDir,
          reviewCwd,
          context.env,
        )}.`,
        context.worktree?.worktreePath
          ? `Task staging area remains ${relativeOrSelf(rootDir, context.worktree.worktreePath)}.`
          : '',
        `Quality score: ${score}/100 (threshold: ${minScore}, retries: ${maxRetries}).`,
        coverage?.note,
        security.note,
        `Review artifacts were written to ${relativeOrSelf(rootDir, artifact.markdownPath)}, ${relativeOrSelf(
          rootDir,
          artifact.jsonPath,
        )}, and ${relativeOrSelf(rootDir, artifact.commentPath)}.`,
        ...results.map((result) => formatCheckSummary(result)),
        escalation.required
          ? `Escalation recommended: ${escalation.target} (${escalation.reason}).`
          : 'No escalation was required by the configured review gate.',
        syncNote,
      ].filter(Boolean);

      if (requiredFailures.length > 0 || score < minScore || coverageGateFailed) {
        throw new Error(
          [
            `Review gate failed with score ${score}/100 (threshold: ${minScore}).`,
            coverageGateFailed ? coverage?.note : '',
            ...failedChecks.map((result) => formatCheckSummary(result)),
            escalation.required && escalation.target && escalation.reason
              ? `Escalation: ${escalation.target} (${escalation.reason}).`
              : '',
            `Artifacts: ${artifact.markdownPath}, ${artifact.jsonPath}, ${artifact.commentPath}`,
          ]
            .filter(Boolean)
            .join(' '),
        );
      }

      return {
        status: 'completed',
        notes: notes.join(' '),
        output: {
          score,
          minScore,
          maxRetries,
          checks: results,
          escalation,
          coverage,
          security,
          artifact,
        },
      };
    },
  };
}

function resolveReviewChecks(env: NodeJS.ProcessEnv): ResolvedReviewCheck[] {
  const configured = env.AUTOMATION_REVIEW_CHECKS_JSON;
  if (!configured) {
    return DEFAULT_REVIEW_CHECKS;
  }

  const parsed = JSON.parse(configured) as ReviewCheck[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AUTOMATION_REVIEW_CHECKS_JSON must be a non-empty JSON array.');
  }

  return parsed.map((check, index) => {
    if (!check?.label || !check.command || !Array.isArray(check.args)) {
      throw new Error(
        `AUTOMATION_REVIEW_CHECKS_JSON entry #${index + 1} must include label, command, and args[].`,
      );
    }

    return {
      label: check.label,
      command: check.command,
      args: check.args,
      weight: Number.isFinite(check.weight) ? Math.max(0, Number(check.weight)) : 1,
      required: check.required ?? true,
      severity: check.severity === 'security' ? 'security' : 'quality',
    };
  });
}

function resolveReviewWorkingDirectory(rootDir: string, env: NodeJS.ProcessEnv) {
  const configured = env.AUTOMATION_REVIEW_CWD;
  if (!configured) {
    return rootDir;
  }

  return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
}

function resolveReviewMinScore(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.AUTOMATION_REVIEW_MIN_SCORE || '', 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_REVIEW_MIN_SCORE;
  }

  return Math.max(0, Math.min(100, parsed));
}

function resolveReviewMaxRetries(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.AUTOMATION_REVIEW_MAX_RETRIES || '', 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_REVIEW_MAX_RETRIES;
  }

  return Math.max(0, Math.min(5, parsed));
}

function runReviewCheckWithRetries(params: {
  check: ResolvedReviewCheck;
  cwd: string;
  env: NodeJS.ProcessEnv;
  maxRetries: number;
  logRetry?: (message: string) => void;
}): ReviewCheckResult {
  const attemptHistory: ReviewCheckAttempt[] = [];
  const maxAttempts = Math.max(1, params.maxRetries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptResult = runReviewCheckOnce(params.check, params.cwd, params.env, attempt);
    attemptHistory.push(attemptResult);

    if (attemptResult.passed || attempt === maxAttempts) {
      return {
        ...params.check,
        passed: attemptResult.passed,
        exitCode: attemptResult.exitCode,
        summary: attemptResult.summary,
        attemptsUsed: attemptHistory.length,
        attemptHistory,
      };
    }

    params.logRetry?.(
      `Review check ${params.check.label} failed on attempt ${attempt}/${maxAttempts}. Retrying.`,
    );
  }

  return {
    ...params.check,
    passed: false,
    exitCode: null,
    summary: 'Review check failed without producing a terminal attempt.',
    attemptsUsed: attemptHistory.length,
    attemptHistory,
  };
}

function runReviewCheckOnce(
  check: ResolvedReviewCheck,
  cwd: string,
  env: NodeJS.ProcessEnv,
  attempt: number,
): ReviewCheckAttempt {
  const result = spawnSync(check.command, check.args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  });
  const summary = truncateText(
    [result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .trim()
      .replace(/\s+/g, ' '),
    240,
  );

  return {
    attempt,
    passed: result.status === 0,
    exitCode: result.status,
    summary: summary || 'Command completed without additional output.',
  };
}

function calculateQualityScore(results: ReviewCheckResult[]) {
  const totalWeight = results.reduce((sum, result) => sum + Math.max(0, result.weight), 0);
  if (totalWeight <= 0) {
    return 100;
  }

  const passedWeight = results
    .filter((result) => result.passed)
    .reduce((sum, result) => sum + Math.max(0, result.weight), 0);

  return Math.round((passedWeight / totalWeight) * 100);
}

function determineEscalation(
  results: ReviewCheckResult[],
  score: number,
  minScore: number,
  coverage?: ReviewCoverageSummary,
): ReviewEscalation {
  const securityFailures = results.filter((result) => !result.passed && result.severity === 'security');
  if (securityFailures.length > 0) {
    return {
      required: true,
      target: 'CISO',
      reason: `Security review checks failed: ${securityFailures.map((result) => result.label).join(', ')}`,
    };
  }

  const requiredFailures = results.filter((result) => !result.passed && result.required);
  if (requiredFailures.length > 0) {
    return {
      required: true,
      target: 'TechLead',
      reason: `Required review checks failed: ${requiredFailures.map((result) => result.label).join(', ')}`,
    };
  }

  if (coverage?.required && coverage.passed === false) {
    return {
      required: true,
      target: 'TechLead',
      reason: coverage.note,
    };
  }

  if (score < minScore) {
    return {
      required: true,
      target: 'TechLead',
      reason: `Quality score ${score}/100 is below the configured threshold ${minScore}/100.`,
    };
  }

  return { required: false };
}

function writeReviewArtifacts(params: {
  rootDir: string;
  reviewCwd: string;
  worktreePath?: string;
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  score: number;
  minScore: number;
  maxRetries: number;
  results: ReviewCheckResult[];
  escalation: ReviewEscalation;
  coverage?: ReviewCoverageSummary;
  security: ReviewSecuritySummary;
}) {
  const reportsDir = ensureDirectory(path.join(params.rootDir, '.ai', 'parallel-reports'));
  const baseName = `review-summary-${params.sessionId}-${slugify(params.taskId)}`;
  const markdownPath = path.join(reportsDir, `${baseName}.md`);
  const jsonPath = path.join(reportsDir, `${baseName}.json`);
  const commentPath = path.join(reportsDir, `review-comment-${params.sessionId}-${slugify(params.taskId)}.md`);
  const payload: ReviewArtifactPayload = {
    issueNumber: params.issueNumber,
    sessionId: params.sessionId,
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    score: params.score,
    minScore: params.minScore,
    maxRetries: params.maxRetries,
    reviewCwd: params.reviewCwd,
    worktreePath: params.worktreePath,
    escalation: params.escalation,
    coverage: params.coverage,
    security: params.security,
    checks: params.results,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(markdownPath, buildReviewMarkdown(payload), 'utf8');
  fs.writeFileSync(commentPath, buildReviewCommentMarkdown(payload), 'utf8');

  return {
    markdownPath,
    jsonPath,
    commentPath,
  };
}

function buildReviewMarkdown(payload: ReviewArtifactPayload) {
  return `# Review Summary

## Task
- Issue: #${payload.issueNumber}
- Session: ${payload.sessionId}
- Task: ${payload.taskId}
- Title: ${payload.taskTitle}

## Gate
- Score: ${payload.score}/100
- Threshold: ${payload.minScore}/100
- Max retries: ${payload.maxRetries}
- Review cwd: ${payload.reviewCwd}
${payload.worktreePath ? `- Staging area: ${payload.worktreePath}` : ''}

## Escalation
- Required: ${payload.escalation.required ? 'yes' : 'no'}
${payload.escalation.target ? `- Target: ${payload.escalation.target}` : ''}
${payload.escalation.reason ? `- Reason: ${payload.escalation.reason}` : ''}

## Coverage
${payload.coverage ? `- Required: ${payload.coverage.required ? 'yes' : 'no'}
- Threshold: ${payload.coverage.threshold ?? 'n/a'}
- Actual: ${payload.coverage.actual ?? 'n/a'}
- Source: ${payload.coverage.sourceLabel || 'n/a'}
- Passed: ${
  payload.coverage.passed === undefined ? 'n/a' : payload.coverage.passed ? 'yes' : 'no'
}
- Note: ${payload.coverage.note}` : '- Coverage contract not configured.'}

## Security
- Total security checks: ${payload.security.totalChecks}
- Passed checks: ${payload.security.passedChecks.length > 0 ? payload.security.passedChecks.join(', ') : 'none'}
- Failed checks: ${payload.security.failedChecks.length > 0 ? payload.security.failedChecks.join(', ') : 'none'}
- Note: ${payload.security.note}

## Checks
${payload.checks
  .map(
    (result) =>
      `- ${result.label}: ${result.passed ? 'passed' : 'failed'} (${result.attemptsUsed} attempt${result.attemptsUsed === 1 ? '' : 's'}, weight ${result.weight}, ${
        result.required ? 'required' : 'optional'
      }, severity ${result.severity}) — ${result.summary}`,
  )
  .join('\n')}

## Generated
- ${payload.generatedAt}
`;
}

function buildReviewCommentMarkdown(payload: ReviewArtifactPayload) {
  const failedChecks = payload.checks.filter((result) => !result.passed);
  return `## Review Gate
- Score: ${payload.score}/100 (threshold: ${payload.minScore}/100)
${payload.coverage ? `- Coverage: ${payload.coverage.actual ?? 'n/a'}${payload.coverage.actual !== undefined ? '%' : ''} (threshold: ${
    payload.coverage.threshold ?? 'n/a'
  }${payload.coverage.threshold !== undefined ? '%' : ''})` : ''}
- Security checks: ${payload.security.failedChecks.length > 0 ? `${payload.security.failedChecks.length} failed` : 'all passed or not configured'}
- Escalation: ${
    payload.escalation.required ? `${payload.escalation.target} (${payload.escalation.reason})` : 'none'
  }

## Check Results
${payload.checks.map((result) => `- ${result.label}: ${result.passed ? 'passed' : 'failed'} — ${result.summary}`).join('\n')}

${failedChecks.length > 0 ? `## Fix Next\n${failedChecks.map((result) => `- ${result.label}`).join('\n')}\n` : ''}`;
}

function summarizeSecurityResults(results: ReviewCheckResult[]): ReviewSecuritySummary {
  const securityChecks = results.filter((result) => result.severity === 'security');
  const passedChecks = securityChecks.filter((result) => result.passed).map((result) => result.label);
  const failedChecks = securityChecks.filter((result) => !result.passed).map((result) => result.label);

  return {
    totalChecks: securityChecks.length,
    passedChecks,
    failedChecks,
    note:
      securityChecks.length === 0
        ? 'No security-specific review checks were configured.'
        : failedChecks.length > 0
          ? `Security review checks failed: ${failedChecks.join(', ')}.`
          : `All configured security review checks passed: ${passedChecks.join(', ')}.`,
  };
}

function resolveCoverageSummary(results: ReviewCheckResult[], env: NodeJS.ProcessEnv): ReviewCoverageSummary | undefined {
  const threshold = resolveCoverageThreshold(env);
  const labels = resolveCoverageLabels(env);
  const candidates = results.filter((result) => {
    if (labels.length > 0) {
      return labels.includes(result.label);
    }

    return result.label.toLowerCase().includes('coverage');
  });

  const match = candidates
    .map((candidate) => ({ candidate, coverage: extractCoveragePercent(candidate.summary) }))
    .find((entry) => entry.coverage !== undefined);

  if (!match && threshold === undefined && candidates.length === 0) {
    return undefined;
  }

  if (!match && threshold !== undefined) {
    return {
      required: true,
      threshold,
      passed: false,
      note: `Coverage gate failed because no coverage percentage could be extracted from the configured review checks (threshold: ${threshold}%).`,
    };
  }

  if (!match) {
    return {
      required: false,
      note: 'Coverage-related checks were configured, but no coverage percentage could be extracted from their output.',
    };
  }

  if (match.coverage === undefined) {
    return {
      required: threshold !== undefined,
      threshold,
      passed: threshold === undefined ? undefined : false,
      sourceLabel: match.candidate.label,
      note:
        threshold === undefined
          ? `Coverage-related check ${match.candidate.label} ran, but no coverage percentage could be extracted from its output.`
          : `Coverage gate failed because ${match.candidate.label} did not produce a parseable coverage percentage (threshold: ${threshold}%).`,
    };
  }

  const actualCoverage = match.coverage;
  const passed = threshold === undefined ? undefined : actualCoverage >= threshold;
  return {
    required: threshold !== undefined,
    threshold,
    actual: actualCoverage,
    sourceLabel: match.candidate.label,
    passed,
    note:
      threshold === undefined
        ? `Observed coverage ${actualCoverage}% from ${match.candidate.label}.`
        : passed
          ? `Coverage gate passed: ${actualCoverage}% from ${match.candidate.label} (threshold: ${threshold}%).`
          : `Coverage gate failed: ${actualCoverage}% from ${match.candidate.label} (threshold: ${threshold}%).`,
  };
}

function extractCoveragePercent(summary: string) {
  const matches = [...summary.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  if (matches.length === 0) {
    return undefined;
  }

  return Number.parseFloat(matches[matches.length - 1][1]);
}

function resolveCoverageThreshold(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseFloat(env.AUTOMATION_REVIEW_COVERAGE_THRESHOLD || '');
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, parsed));
}

function resolveCoverageLabels(env: NodeJS.ProcessEnv) {
  return (env.AUTOMATION_REVIEW_COVERAGE_LABELS || '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function syncIssueState(params: {
  env: NodeJS.ProcessEnv;
  issueNumber: number;
  taskId: string;
  taskTitle: string;
}) {
  const token = resolveGitHubToken(params.env);
  if (!token) {
    return 'GitHub label sync was skipped because no token is available.';
  }

  try {
    const repository = resolveRepositoryContext(
      params.env.GITHUB_REPOSITORY || params.env.REPOSITORY || process.env.GITHUB_REPOSITORY,
    );
    const stateMachine = new LabelStateMachine(token, repository.owner, repository.repo);
    await stateMachine.assignAgent(params.issueNumber, 'review');
    await stateMachine.transitionState(
      params.issueNumber,
      'reviewing',
      `Triggered by ${params.taskId}: ${params.taskTitle}`,
    );

    return `Issue #${params.issueNumber} labels were updated to agent:review and state:reviewing.`;
  } catch (error) {
    return `Review artifacts were generated, but GitHub label sync could not move issue #${params.issueNumber} into reviewing: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function formatCheckSummary(result: ReviewCheckResult) {
  const retryNote = result.attemptsUsed > 1 ? ` after ${result.attemptsUsed} attempts` : '';
  return `${result.label}: ${result.passed ? 'passed' : 'failed'}${retryNote} (${result.required ? 'required' : 'optional'}, ${
    result.severity
  }, weight ${result.weight}) — ${result.summary}`;
}

function relativeOrSelf(rootDir: string, targetPath: string) {
  const relative = path.relative(rootDir, targetPath);
  if (!relative) {
    return '.';
  }

  return relative.startsWith('..') ? targetPath : relative;
}

function describeReviewCwd(rootDir: string, reviewCwd: string, env: NodeJS.ProcessEnv) {
  if (!env.AUTOMATION_REVIEW_CWD) {
    return 'repo root';
  }

  return path.resolve(rootDir) === path.resolve(reviewCwd) ? '.' : relativeOrSelf(rootDir, reviewCwd);
}

function resolveGitHubToken(env: NodeJS.ProcessEnv) {
  return env.GITHUB_TOKEN || env.GH_PROJECT_TOKEN || env.GH_TOKEN || null;
}
