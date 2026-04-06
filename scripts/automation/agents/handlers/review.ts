import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { ensureDirectory, slugify, truncateText } from '../../core/utils.js';
import { renderGitNexusBindingNote, requireGitNexusTaskBinding } from '../../gitnexus/runtime-contract.js';
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

interface ReviewSecuritySummary {
  totalChecks: number;
  passedChecks: string[];
  failedChecks: string[];
  note: string;
}

interface ReviewLoopAttempt {
  iteration: number;
  passed: boolean;
  score: number;
  failedChecks: string[];
  appliedFixCommand: boolean;
  note: string;
}

interface ReviewTestHandoffSummary {
  required: boolean;
  found: boolean;
  artifactPath?: string;
  taskId?: string;
  taskTitle?: string;
  passed?: boolean;
  coverage?: number;
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
  gitnexusArtifactPath?: string;
  gitnexusNote: string;
  escalation: ReviewEscalation;
  testHandoff: ReviewTestHandoffSummary;
  security: ReviewSecuritySummary;
  checks: ReviewCheckResult[];
  loop: {
    maxIterations: number;
    fixCommandConfigured: boolean;
    attempts: ReviewLoopAttempt[];
  };
  generatedAt: string;
}

interface TestArtifactPayload {
  taskId: string;
  taskTitle: string;
  coverage?: {
    actual?: number;
    passed?: boolean;
  };
  checks?: Array<{
    label: string;
    passed: boolean;
  }>;
  summary?: {
    requiredFailures?: number;
  };
}

const DEFAULT_REVIEW_CHECKS: ResolvedReviewCheck[] = [
  {
    label: 'typecheck',
    command: 'npm',
    args: ['run', 'typecheck'],
    weight: 100,
    required: true,
    severity: 'quality',
  },
];

const DEFAULT_REVIEW_MIN_SCORE = 100;
const DEFAULT_REVIEW_MAX_RETRIES = 0;
const DEFAULT_REVIEW_LOOP_MAX_ITERATIONS = 1;

export function createReviewAgentHandler(options: ReviewAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'review-quality-loop',
    mode: 'connected',
    description:
      'Runs repo-local review commands, consumes TestAgent artifacts as an explicit handoff, and can iterate with an optional fix command before escalating.',
    execute: async ({ task, definition, context }) => {
      const gitnexusBinding = requireGitNexusTaskBinding(task, context);
      const gitnexusNote = renderGitNexusBindingNote(gitnexusBinding, context.gitnexusArtifactPath);
      const rootDir = context.rootDir || options.rootDir;
      const reviewCwd = resolveReviewWorkingDirectory(rootDir, context.env, context.worktree?.worktreePath);
      const checks = resolveReviewChecks(context.env);
      const maxRetries = resolveReviewMaxRetries(context.env);
      const minScore = resolveReviewMinScore(context.env);
      const maxIterations = resolveReviewLoopMaxIterations(context.env);
      const fixCommand = resolveReviewFixCommand(context.env);
      const testHandoff = resolveTestHandoff({
        rootDir,
        sessionId: context.sessionId,
        dependencyIds: task.dependencies,
        env: context.env,
      });

      let results: ReviewCheckResult[] = [];
      let score = 0;
      let security = summarizeSecurityResults(results);
      let escalation: ReviewEscalation = { required: false };
      const attempts: ReviewLoopAttempt[] = [];
      const loopLimit = Math.max(1, maxIterations);

      for (let iteration = 1; iteration <= loopLimit; iteration += 1) {
        results = checks.map((check) =>
          runReviewCheckWithRetries({
            check,
            cwd: reviewCwd,
            env: context.env,
            maxRetries,
            logRetry: (message) => context.logger.warn(message),
          }),
        );
        score = calculateQualityScore(results);
        security = summarizeSecurityResults(results);
        escalation = determineEscalation({
          results,
          score,
          minScore,
          testHandoff,
        });

        const failedChecks = results.filter((result) => !result.passed).map((result) => result.label);
        const passed = reviewGatePassed(results, score, minScore, testHandoff);
        const canRetry = !passed && iteration < loopLimit && Boolean(fixCommand);
        attempts.push({
          iteration,
          passed,
          score,
          failedChecks,
          appliedFixCommand: false,
          note: passed
            ? `Review gate passed on iteration ${iteration}.`
            : `Review gate failed on iteration ${iteration} with ${failedChecks.length} failed review checks.`,
        });

        if (passed) {
          break;
        }

        if (!canRetry || !fixCommand) {
          break;
        }

        const fixSummary = applyReviewFixCommand(fixCommand, reviewCwd, context.env);
        attempts[attempts.length - 1].appliedFixCommand = true;
        attempts[attempts.length - 1].note = `${attempts[attempts.length - 1].note} Applied fix command: ${fixSummary}`;
      }

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
        gitnexusArtifactPath: context.gitnexusArtifactPath,
        gitnexusNote,
        results,
        escalation,
        security,
        testHandoff,
        loop: {
          maxIterations: loopLimit,
          fixCommandConfigured: Boolean(fixCommand),
          attempts,
        },
      });

      const syncNote = await syncIssueState({
        env: context.env,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
      });

      const failedChecks = results.filter((result) => !result.passed);
      const requiredFailures = failedChecks.filter((result) => result.required);

      const notes = [
        `${definition.name} ran ${results.length} configured review checks in ${describeReviewCwd(
          rootDir,
          reviewCwd,
          context.env,
        )}.`,
        gitnexusNote,
        context.worktree?.worktreePath
          ? `Pipeline worktree: ${relativeOrSelf(rootDir, context.worktree.worktreePath)}.`
          : '',
        `Quality score: ${score}/100 (threshold: ${minScore}, retries: ${maxRetries}, review iterations: ${attempts.length}/${loopLimit}).`,
        testHandoff.note,
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

      if (requiredFailures.length > 0 || score < minScore || testHandoff.passed === false) {
        throw new Error(
          [
            `Review gate failed with score ${score}/100 (threshold: ${minScore}).`,
            testHandoff.note,
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
          security,
          testHandoff,
          loop: {
            maxIterations: loopLimit,
            attempts,
            fixCommandConfigured: Boolean(fixCommand),
          },
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

function resolveReviewWorkingDirectory(rootDir: string, env: NodeJS.ProcessEnv, worktreePath?: string) {
  const configured = env.AUTOMATION_REVIEW_CWD;
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
  }

  if (worktreePath) {
    return worktreePath;
  }

  return rootDir;
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

function resolveReviewLoopMaxIterations(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.AUTOMATION_REVIEW_LOOP_MAX_ITERATIONS || '', 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_REVIEW_LOOP_MAX_ITERATIONS;
  }

  return Math.max(1, Math.min(10, parsed));
}

function resolveReviewFixCommand(env: NodeJS.ProcessEnv) {
  const value = (env.AUTOMATION_REVIEW_FIX_COMMAND || '').trim();
  return value.length > 0 ? value : undefined;
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

function determineEscalation(params: {
  results: ReviewCheckResult[];
  score: number;
  minScore: number;
  testHandoff: ReviewTestHandoffSummary;
}): ReviewEscalation {
  const securityFailures = params.results.filter((result) => !result.passed && result.severity === 'security');
  if (securityFailures.length > 0) {
    return {
      required: true,
      target: 'CISO',
      reason: `Security review checks failed: ${securityFailures.map((result) => result.label).join(', ')}`,
    };
  }

  const requiredFailures = params.results.filter((result) => !result.passed && result.required);
  if (requiredFailures.length > 0) {
    return {
      required: true,
      target: 'TechLead',
      reason: `Required review checks failed: ${requiredFailures.map((result) => result.label).join(', ')}`,
    };
  }

  if (params.testHandoff.passed === false) {
    return {
      required: true,
      target: 'TechLead',
      reason: params.testHandoff.note,
    };
  }

  if (params.score < params.minScore) {
    return {
      required: true,
      target: 'TechLead',
      reason: `Quality score ${params.score}/100 is below the configured threshold ${params.minScore}/100.`,
    };
  }

  return { required: false };
}

function resolveTestHandoff(params: {
  rootDir: string;
  sessionId: string;
  dependencyIds: string[];
  env: NodeJS.ProcessEnv;
}): ReviewTestHandoffSummary {
  const required = resolveRequireTestHandoff(params.dependencyIds, params.env);
  const reportsDir = path.join(params.rootDir, '.ai', 'parallel-reports');

  if (!fs.existsSync(reportsDir)) {
    return {
      required,
      found: false,
      passed: required ? false : undefined,
      failedChecks: [],
      note: required
        ? 'Review gate expected a prior TestAgent artifact, but .ai/parallel-reports does not exist yet.'
        : 'No TestAgent artifact was found for this review task.',
    };
  }

  const testDependencyIds = new Set(
    params.dependencyIds.filter((dependencyId) => dependencyId.endsWith('-test') || dependencyId.includes('quality-test')),
  );

  const candidates = fs
    .readdirSync(reportsDir)
    .filter((entry) => entry.startsWith(`test-summary-${params.sessionId}-`) && entry.endsWith('.json'))
    .map((entry) => path.join(reportsDir, entry))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  const resolvedCandidate = candidates
    .map((artifactPath) => ({
      artifactPath,
      payload: JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as TestArtifactPayload,
    }))
    .find((candidate) => testDependencyIds.size > 0 && testDependencyIds.has(candidate.payload.taskId));

  const artifactPath = resolvedCandidate?.artifactPath ?? candidates[0];
  if (!artifactPath) {
    return {
      required,
      found: false,
      passed: required ? false : undefined,
      failedChecks: [],
      note: required
        ? 'Review gate expected a prior TestAgent artifact, but none was found for this session.'
        : 'No TestAgent artifact was found for this review task.',
    };
  }

  const payload =
    resolvedCandidate?.artifactPath === artifactPath
      ? resolvedCandidate.payload
      : (JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as TestArtifactPayload);
  const failedChecks = (payload.checks || []).filter((check) => check.passed === false).map((check) => check.label);
  const coveragePassed = payload.coverage?.passed;
  const requiredFailures = payload.summary?.requiredFailures ?? 0;
  const passed = required ? requiredFailures === 0 && coveragePassed !== false : undefined;

  return {
    required,
    found: true,
    artifactPath,
    taskId: payload.taskId,
    taskTitle: payload.taskTitle,
    passed,
    coverage: payload.coverage?.actual,
    failedChecks,
    note:
      passed === false
        ? `TestAgent handoff failed in ${path.basename(artifactPath)}: ${
            failedChecks.length > 0 ? failedChecks.join(', ') : 'coverage gate'
          }.`
        : `Consumed TestAgent artifact ${path.basename(artifactPath)}${
            payload.coverage?.actual !== undefined ? ` (coverage ${payload.coverage.actual}%)` : ''
          }.`,
  };
}

function resolveRequireTestHandoff(dependencyIds: string[], env: NodeJS.ProcessEnv) {
  const configured = (env.AUTOMATION_REVIEW_REQUIRE_TEST_ARTIFACT || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'required', 'always'].includes(configured)) {
    return true;
  }

  if (['false', '0', 'no', 'never'].includes(configured)) {
    return false;
  }

  return dependencyIds.some((dependencyId) => dependencyId.endsWith('-test') || dependencyId.includes('quality-test'));
}

function reviewGatePassed(
  results: ReviewCheckResult[],
  score: number,
  minScore: number,
  testHandoff: ReviewTestHandoffSummary,
) {
  const requiredFailures = results.filter((result) => !result.passed && result.required);
  if (requiredFailures.length > 0) {
    return false;
  }

  if (score < minScore) {
    return false;
  }

  if (testHandoff.passed === false) {
    return false;
  }

  return true;
}

function applyReviewFixCommand(command: string, cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync('bash', ['-lc', command], {
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

  if (result.status !== 0) {
    return `fix command exited with ${result.status}: ${summary || 'no output'}`;
  }

  return summary || 'fix command completed successfully';
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
  gitnexusArtifactPath?: string;
  gitnexusNote: string;
  results: ReviewCheckResult[];
  escalation: ReviewEscalation;
  security: ReviewSecuritySummary;
  testHandoff: ReviewTestHandoffSummary;
  loop: ReviewArtifactPayload['loop'];
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
    gitnexusArtifactPath: params.gitnexusArtifactPath,
    gitnexusNote: params.gitnexusNote,
    escalation: params.escalation,
    testHandoff: params.testHandoff,
    security: params.security,
    checks: params.results,
    loop: params.loop,
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
- GitNexus artifact: ${payload.gitnexusArtifactPath || 'n/a'}
- GitNexus note: ${payload.gitnexusNote}

## Gate
- Score: ${payload.score}/100
- Threshold: ${payload.minScore}/100
- Max retries: ${payload.maxRetries}
- Review cwd: ${payload.reviewCwd}
${payload.worktreePath ? `- Pipeline worktree: ${payload.worktreePath}` : ''}

## Test Handoff
- Required: ${payload.testHandoff.required ? 'yes' : 'no'}
- Found: ${payload.testHandoff.found ? 'yes' : 'no'}
${payload.testHandoff.artifactPath ? `- Artifact: ${payload.testHandoff.artifactPath}` : ''}
${payload.testHandoff.taskId ? `- Source task: ${payload.testHandoff.taskId}` : ''}
${payload.testHandoff.coverage !== undefined ? `- Coverage: ${payload.testHandoff.coverage}%` : ''}
- Passed: ${payload.testHandoff.passed === undefined ? 'n/a' : payload.testHandoff.passed ? 'yes' : 'no'}
- Note: ${payload.testHandoff.note}

## Review Loop
- Max iterations: ${payload.loop.maxIterations}
- Fix command configured: ${payload.loop.fixCommandConfigured ? 'yes' : 'no'}
${payload.loop.attempts
  .map(
    (attempt) =>
      `- Iteration ${attempt.iteration}: ${attempt.passed ? 'passed' : 'failed'} (score ${attempt.score}/100, fix command ${
        attempt.appliedFixCommand ? 'applied' : 'not applied'
      }) — ${attempt.note}`,
  )
  .join('\n')}

## Escalation
- Required: ${payload.escalation.required ? 'yes' : 'no'}
${payload.escalation.target ? `- Target: ${payload.escalation.target}` : ''}
${payload.escalation.reason ? `- Reason: ${payload.escalation.reason}` : ''}

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
- Test handoff: ${
    payload.testHandoff.passed === undefined ? 'not required' : payload.testHandoff.passed ? 'passed' : 'failed'
  }
- Security checks: ${payload.security.failedChecks.length > 0 ? `${payload.security.failedChecks.length} failed` : 'all passed or not configured'}
- Escalation: ${
    payload.escalation.required ? `${payload.escalation.target} (${payload.escalation.reason})` : 'none'
  }

## Review Loop
${payload.loop.attempts
  .map((attempt) => `- Iteration ${attempt.iteration}: ${attempt.passed ? 'passed' : 'failed'} — ${attempt.note}`)
  .join('\n')}

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
  if (env.AUTOMATION_REVIEW_CWD) {
    return path.resolve(rootDir) === path.resolve(reviewCwd) ? '.' : relativeOrSelf(rootDir, reviewCwd);
  }

  return path.resolve(rootDir) === path.resolve(reviewCwd) ? 'repo root' : relativeOrSelf(rootDir, reviewCwd);
}

function resolveGitHubToken(env: NodeJS.ProcessEnv) {
  return env.GITHUB_TOKEN || env.GH_PROJECT_TOKEN || env.GH_TOKEN || null;
}
