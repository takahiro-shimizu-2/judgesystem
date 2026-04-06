import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { ensureDirectory, slugify, truncateText } from '../../core/utils.js';
import { renderGitNexusBindingNote, requireGitNexusTaskBinding } from '../../gitnexus/runtime-contract.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import { LabelStateMachine } from '../../state/label-state-machine.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface TestAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

type TestCheckSeverity = 'test' | 'coverage';

interface TestCheck {
  label: string;
  command: string;
  args: string[];
  weight?: number;
  required?: boolean;
  severity?: TestCheckSeverity;
}

interface ResolvedTestCheck {
  label: string;
  command: string;
  args: string[];
  weight: number;
  required: boolean;
  severity: TestCheckSeverity;
}

interface TestCheckAttempt {
  attempt: number;
  passed: boolean;
  exitCode: number | null;
  summary: string;
}

interface TestCheckResult extends ResolvedTestCheck {
  passed: boolean;
  exitCode: number | null;
  summary: string;
  attemptsUsed: number;
  attemptHistory: TestCheckAttempt[];
}

interface TestCoverageSummary {
  required: boolean;
  threshold?: number;
  actual?: number;
  sourceLabel?: string;
  passed?: boolean;
  note: string;
}

interface TestArtifactPayload {
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  testCwd: string;
  worktreePath?: string;
  gitnexusArtifactPath?: string;
  gitnexusNote: string;
  maxRetries: number;
  coverage?: TestCoverageSummary;
  checks: TestCheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    requiredFailures: number;
  };
  generatedAt: string;
}

const DEFAULT_TEST_CHECKS: ResolvedTestCheck[] = [
  {
    label: 'tests',
    command: 'npm',
    args: ['test'],
    weight: 100,
    required: true,
    severity: 'test',
  },
];

const DEFAULT_TEST_MAX_RETRIES = 0;

export function createTestAgentHandler(options: TestAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'test-local-checks',
    mode: 'connected',
    description:
      'Runs repo-local test and coverage commands, writes dedicated test artifacts, and optionally syncs the issue into testing.',
    execute: async ({ task, definition, context }) => {
      const gitnexusBinding = requireGitNexusTaskBinding(task, context);
      const gitnexusNote = renderGitNexusBindingNote(gitnexusBinding, context.gitnexusArtifactPath);
      const rootDir = context.rootDir || options.rootDir;
      const testCwd = resolveTestWorkingDirectory(rootDir, context.env, context.worktree?.worktreePath);
      const checks = resolveTestChecks(context.env);
      const maxRetries = resolveTestMaxRetries(context.env);
      const results = checks.map((check) =>
        runTestCheckWithRetries({
          check,
          cwd: testCwd,
          env: context.env,
          maxRetries,
          logRetry: (message) => context.logger.warn(message),
        }),
      );
      const coverage = resolveCoverageSummary(results, context.env);
      const artifact = writeTestArtifacts({
        rootDir,
        testCwd,
        worktreePath: context.worktree?.worktreePath,
        issueNumber: context.issueNumber,
        sessionId: context.sessionId,
        taskId: task.id,
        taskTitle: task.title,
        gitnexusArtifactPath: context.gitnexusArtifactPath,
        gitnexusNote,
        maxRetries,
        results,
        coverage,
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
        `${definition.name} ran ${results.length} configured test checks in ${describeTestCwd(rootDir, testCwd, context.env)}.`,
        gitnexusNote,
        context.worktree?.worktreePath
          ? `Pipeline worktree: ${relativeOrSelf(rootDir, context.worktree.worktreePath)}.`
          : '',
        coverage?.note,
        `Test artifacts were written to ${relativeOrSelf(rootDir, artifact.markdownPath)}, ${relativeOrSelf(
          rootDir,
          artifact.jsonPath,
        )}, and ${relativeOrSelf(rootDir, artifact.commentPath)}.`,
        ...results.map((result) => formatCheckSummary(result)),
        syncNote,
      ].filter(Boolean);

      if (requiredFailures.length > 0 || coverageGateFailed) {
        throw new Error(
          [
            'Test gate failed.',
            coverageGateFailed ? coverage?.note : '',
            ...failedChecks.map((result) => formatCheckSummary(result)),
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
          checks: results,
          coverage,
          artifact,
          summary: {
            total: results.length,
            passed: results.filter((result) => result.passed).length,
            failed: failedChecks.length,
            requiredFailures: requiredFailures.length,
          },
        },
      };
    },
  };
}

function resolveTestWorkingDirectory(rootDir: string, env: NodeJS.ProcessEnv, worktreePath?: string) {
  const configured = env.AUTOMATION_TEST_CWD;
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
  }

  if (worktreePath) {
    return worktreePath;
  }

  return rootDir;
}

function resolveTestChecks(env: NodeJS.ProcessEnv): ResolvedTestCheck[] {
  const configured = env.AUTOMATION_TEST_CHECKS_JSON;
  if (!configured) {
    return DEFAULT_TEST_CHECKS;
  }

  const parsed = JSON.parse(configured) as TestCheck[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AUTOMATION_TEST_CHECKS_JSON must be a non-empty JSON array.');
  }

  return parsed.map((check, index) => {
    if (!check?.label || !check.command || !Array.isArray(check.args)) {
      throw new Error(`AUTOMATION_TEST_CHECKS_JSON entry #${index + 1} must include label, command, and args[].`);
    }

    return {
      label: check.label,
      command: check.command,
      args: check.args,
      weight: Number.isFinite(check.weight) ? Math.max(0, Number(check.weight)) : 1,
      required: check.required ?? true,
      severity: check.severity === 'coverage' ? 'coverage' : 'test',
    };
  });
}

function resolveTestMaxRetries(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.AUTOMATION_TEST_MAX_RETRIES || '', 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_TEST_MAX_RETRIES;
  }

  return Math.max(0, Math.min(5, parsed));
}

function runTestCheckWithRetries(params: {
  check: ResolvedTestCheck;
  cwd: string;
  env: NodeJS.ProcessEnv;
  maxRetries: number;
  logRetry?: (message: string) => void;
}): TestCheckResult {
  const attemptHistory: TestCheckAttempt[] = [];
  const maxAttempts = Math.max(1, params.maxRetries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptResult = runTestCheckOnce(params.check, params.cwd, params.env, attempt);
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

    params.logRetry?.(`Test check ${params.check.label} failed on attempt ${attempt}/${maxAttempts}. Retrying.`);
  }

  return {
    ...params.check,
    passed: false,
    exitCode: null,
    summary: 'Test check failed without producing a terminal attempt.',
    attemptsUsed: attemptHistory.length,
    attemptHistory,
  };
}

function runTestCheckOnce(
  check: ResolvedTestCheck,
  cwd: string,
  env: NodeJS.ProcessEnv,
  attempt: number,
): TestCheckAttempt {
  const result = spawnSync(check.command, check.args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
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

function resolveCoverageSummary(results: TestCheckResult[], env: NodeJS.ProcessEnv): TestCoverageSummary | undefined {
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
      note: `Coverage gate failed because no coverage percentage could be extracted from the configured test checks (threshold: ${threshold}%).`,
    };
  }

  if (!match) {
    return {
      required: false,
      note: 'Coverage-related test checks were configured, but no coverage percentage could be extracted from their output.',
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
          ? `Coverage-related test check ${match.candidate.label} ran, but no coverage percentage could be extracted from its output.`
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

function writeTestArtifacts(params: {
  rootDir: string;
  testCwd: string;
  worktreePath?: string;
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  gitnexusArtifactPath?: string;
  gitnexusNote: string;
  maxRetries: number;
  results: TestCheckResult[];
  coverage?: TestCoverageSummary;
}) {
  const reportsDir = ensureDirectory(path.join(params.rootDir, '.ai', 'parallel-reports'));
  const baseName = `test-summary-${params.sessionId}-${slugify(params.taskId)}`;
  const markdownPath = path.join(reportsDir, `${baseName}.md`);
  const jsonPath = path.join(reportsDir, `${baseName}.json`);
  const commentPath = path.join(reportsDir, `test-comment-${params.sessionId}-${slugify(params.taskId)}.md`);
  const payload: TestArtifactPayload = {
    issueNumber: params.issueNumber,
    sessionId: params.sessionId,
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    testCwd: params.testCwd,
    worktreePath: params.worktreePath,
    gitnexusArtifactPath: params.gitnexusArtifactPath,
    gitnexusNote: params.gitnexusNote,
    maxRetries: params.maxRetries,
    coverage: params.coverage,
    checks: params.results,
    summary: {
      total: params.results.length,
      passed: params.results.filter((result) => result.passed).length,
      failed: params.results.filter((result) => !result.passed).length,
      requiredFailures: params.results.filter((result) => !result.passed && result.required).length,
    },
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(markdownPath, buildTestMarkdown(payload), 'utf8');
  fs.writeFileSync(commentPath, buildTestCommentMarkdown(payload), 'utf8');

  return {
    markdownPath,
    jsonPath,
    commentPath,
  };
}

function buildTestMarkdown(payload: TestArtifactPayload) {
  return `# Test Summary

## Task
- Issue: #${payload.issueNumber}
- Session: ${payload.sessionId}
- Task: ${payload.taskId}
- Title: ${payload.taskTitle}
- GitNexus artifact: ${payload.gitnexusArtifactPath || 'n/a'}
- GitNexus note: ${payload.gitnexusNote}

## Execution
- Test cwd: ${payload.testCwd}
${payload.worktreePath ? `- Pipeline worktree: ${payload.worktreePath}` : ''}
- Max retries: ${payload.maxRetries}

## Summary
- Total checks: ${payload.summary.total}
- Passed checks: ${payload.summary.passed}
- Failed checks: ${payload.summary.failed}
- Required failures: ${payload.summary.requiredFailures}

## Coverage
${payload.coverage ? `- Required: ${payload.coverage.required ? 'yes' : 'no'}
- Threshold: ${payload.coverage.threshold ?? 'n/a'}
- Actual: ${payload.coverage.actual ?? 'n/a'}
- Source: ${payload.coverage.sourceLabel || 'n/a'}
- Passed: ${
    payload.coverage.passed === undefined ? 'n/a' : payload.coverage.passed ? 'yes' : 'no'
  }
- Note: ${payload.coverage.note}` : '- Coverage contract not configured.'}

## Checks
${payload.checks
  .map(
    (result) =>
      `- ${result.label}: ${result.passed ? 'passed' : 'failed'} (${result.attemptsUsed} attempt${result.attemptsUsed === 1 ? '' : 's'}, ${
        result.required ? 'required' : 'optional'
      }, severity ${result.severity}) — ${result.summary}`,
  )
  .join('\n')}

## Generated
- ${payload.generatedAt}
`;
}

function buildTestCommentMarkdown(payload: TestArtifactPayload) {
  const failedChecks = payload.checks.filter((result) => !result.passed);
  return `## Test Gate
- Checks: ${payload.summary.passed}/${payload.summary.total} passed
${payload.coverage ? `- Coverage: ${payload.coverage.actual ?? 'n/a'}${payload.coverage.actual !== undefined ? '%' : ''} (threshold: ${
    payload.coverage.threshold ?? 'n/a'
  }${payload.coverage.threshold !== undefined ? '%' : ''})` : ''}
- Required failures: ${payload.summary.requiredFailures}

## Check Results
${payload.checks.map((result) => `- ${result.label}: ${result.passed ? 'passed' : 'failed'} — ${result.summary}`).join('\n')}

${failedChecks.length > 0 ? `## Fix Next\n${failedChecks.map((result) => `- ${result.label}`).join('\n')}\n` : ''}`;
}

function extractCoveragePercent(summary: string) {
  const matches = [...summary.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  if (matches.length === 0) {
    return undefined;
  }

  return Number.parseFloat(matches[matches.length - 1][1]);
}

function resolveCoverageThreshold(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseFloat(env.AUTOMATION_TEST_COVERAGE_THRESHOLD || '');
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, parsed));
}

function resolveCoverageLabels(env: NodeJS.ProcessEnv) {
  return (env.AUTOMATION_TEST_COVERAGE_LABELS || '')
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
    await stateMachine.assignAgent(params.issueNumber, 'test');
    await stateMachine.transitionState(
      params.issueNumber,
      'testing',
      `Triggered by ${params.taskId}: ${params.taskTitle}`,
    );

    return `Issue #${params.issueNumber} labels were updated to agent:test and state:testing.`;
  } catch (error) {
    return `Test artifacts were generated, but GitHub label sync could not move issue #${params.issueNumber} into testing: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function formatCheckSummary(result: TestCheckResult) {
  const retryNote = result.attemptsUsed > 1 ? ` after ${result.attemptsUsed} attempts` : '';
  return `${result.label}: ${result.passed ? 'passed' : 'failed'}${retryNote} (${result.required ? 'required' : 'optional'}, ${
    result.severity
  }, weight ${result.weight}) — ${result.summary}`;
}

function describeTestCwd(rootDir: string, testCwd: string, env: NodeJS.ProcessEnv) {
  if (env.AUTOMATION_TEST_CWD) {
    return path.resolve(rootDir) === path.resolve(testCwd) ? '.' : relativeOrSelf(rootDir, testCwd);
  }

  return path.resolve(rootDir) === path.resolve(testCwd) ? 'repo root' : relativeOrSelf(rootDir, testCwd);
}

function relativeOrSelf(rootDir: string, targetPath: string) {
  const relative = path.relative(rootDir, targetPath);
  if (!relative) {
    return '.';
  }

  return relative.startsWith('..') ? targetPath : relative;
}

function resolveGitHubToken(env: NodeJS.ProcessEnv) {
  return env.GITHUB_TOKEN || env.GH_PROJECT_TOKEN || env.GH_TOKEN || null;
}
