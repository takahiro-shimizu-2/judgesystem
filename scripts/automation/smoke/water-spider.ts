import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runWaterSpiderContinuityController, writeWaterSpiderArtifacts } from '../water-spider/continuity-controller.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'judgesystem-water-spider-smoke-'));

  try {
    await runHealthySmoke(rootDir);
    await runRetrySmoke(rootDir);
    await runBudgetExceededSmoke(rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

async function runHealthySmoke(rootDir: string) {
  const reportsDir = path.join(rootDir, '.ai', 'parallel-reports');
  const sessionId = 'session-healthy';
  const summaryJsonPath = writeFixtures({
    rootDir,
    reportsDir,
    sessionId,
    issueNumber: 901,
    workflowStatus: 'success',
    executionMode: 'execute',
    report: {
      sessionId,
      issueNumber: 901,
      deviceIdentifier: 'smoke',
      executionMode: 'execute',
      startTime: 1,
      endTime: 2,
      totalDurationMs: 1,
      summary: {
        total: 4,
        completed: 4,
        failed: 0,
        skipped: 0,
        planned: 0,
        successRate: 100,
      },
      graph: {
        nodes: 4,
        edges: 3,
        levels: 4,
      },
      tasks: [],
      warnings: [],
    },
    planWorktrees: [
      {
        taskId: 'task-1',
        branchName: 'agent/issue-901/task-1',
        worktreePath: path.join(rootDir, '.ai', 'worktrees', 'issue-901', 'task-1'),
        mode: 'git-worktree',
        lifecycle: 'cleaned',
      },
    ],
  });

  const decision = await runWaterSpiderContinuityController({
    issueNumber: 901,
    rootDir,
    summaryJsonPath,
    runUrl: 'https://example.invalid/runs/901',
    triggerSource: 'smoke',
    env: {
      GITHUB_REPOSITORY: 'takahiro-shimizu-2/judgesystem',
      AUTOMATION_WATER_SPIDER_AUTO_RETRY: 'true',
      AUTOMATION_WATER_SPIDER_MAX_ATTEMPTS: '2',
    },
  });

  assert(decision.continuityStatus === 'healthy', `Expected healthy status, got ${decision.continuityStatus}.`);
  assert(decision.action === 'noop', `Expected noop action, got ${decision.action}.`);

  const artifacts = writeWaterSpiderArtifacts({
    rootDir,
    decision,
  });
  assert(existsSync(artifacts.markdownPath), 'Healthy smoke markdown artifact was not created.');
  assert(existsSync(artifacts.jsonPath), 'Healthy smoke JSON artifact was not created.');
  console.log('[passed] water-spider-healthy');
  console.log(`  - action=${decision.action}`);
  console.log(`  - artifact=${path.basename(artifacts.markdownPath)}`);
}

async function runRetrySmoke(rootDir: string) {
  const reportsDir = path.join(rootDir, '.ai', 'parallel-reports');
  const sessionId = 'session-retry';
  const summaryJsonPath = writeFixtures({
    rootDir,
    reportsDir,
    sessionId,
    issueNumber: 902,
    workflowStatus: 'failure',
    executionMode: 'execute',
    report: {
      sessionId,
      issueNumber: 902,
      deviceIdentifier: 'smoke',
      executionMode: 'execute',
      startTime: 1,
      endTime: 2,
      totalDurationMs: 1,
      summary: {
        total: 4,
        completed: 1,
        failed: 1,
        skipped: 2,
        planned: 0,
        successRate: 25,
      },
      graph: {
        nodes: 4,
        edges: 3,
        levels: 4,
      },
      tasks: [],
      warnings: ['review failed'],
    },
    planWorktrees: [
      {
        taskId: 'task-1',
        branchName: 'agent/issue-902/task-1',
        worktreePath: path.join(rootDir, '.ai', 'worktrees', 'issue-902', 'task-1'),
        mode: 'git-worktree',
        lifecycle: 'created',
      },
    ],
  });

  let dispatchCount = 0;
  const decision = await runWaterSpiderContinuityController({
    issueNumber: 902,
    rootDir,
    summaryJsonPath,
    runUrl: 'https://example.invalid/runs/902',
    triggerSource: 'smoke',
    env: {
      GITHUB_REPOSITORY: 'takahiro-shimizu-2/judgesystem',
      GITHUB_TOKEN: 'smoke-token',
      AUTOMATION_WATER_SPIDER_AUTO_RETRY: 'true',
      AUTOMATION_WATER_SPIDER_MAX_ATTEMPTS: '2',
    },
    octokitFactory: () => ({
      request: async (route: string) => {
        if (route.startsWith('GET /repos/{owner}/{repo}/issues/{issue_number}/comments')) {
          return { data: [] };
        }
        if (route.startsWith('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches')) {
          dispatchCount += 1;
          return { data: {} };
        }
        throw new Error(`Unexpected route: ${route}`);
      },
    }),
  });

  assert(decision.continuityStatus === 'retryable_failure', `Expected retryable_failure, got ${decision.continuityStatus}.`);
  assert(decision.recommendedAction === 'retry-execute', `Expected retry-execute recommendation, got ${decision.recommendedAction}.`);
  assert(decision.action === 'retry-execute', `Expected retry-execute final action, got ${decision.action}.`);
  assert(decision.dispatched === true, 'Expected Water Spider to dispatch a retry.');
  assert(decision.attempt === 1, `Expected attempt 1, got ${decision.attempt}.`);
  assert(dispatchCount === 1, `Expected one workflow dispatch, got ${dispatchCount}.`);
  console.log('[passed] water-spider-retry');
  console.log(`  - action=${decision.action}`);
  console.log(`  - attempts=${decision.attempt}/${decision.maxAttempts}`);
}

async function runBudgetExceededSmoke(rootDir: string) {
  const reportsDir = path.join(rootDir, '.ai', 'parallel-reports');
  const sessionId = 'session-budget';
  const summaryJsonPath = writeFixtures({
    rootDir,
    reportsDir,
    sessionId,
    issueNumber: 903,
    workflowStatus: 'failure',
    executionMode: 'execute',
    report: {
      sessionId,
      issueNumber: 903,
      deviceIdentifier: 'smoke',
      executionMode: 'execute',
      startTime: 1,
      endTime: 2,
      totalDurationMs: 1,
      summary: {
        total: 3,
        completed: 1,
        failed: 0,
        skipped: 2,
        planned: 0,
        successRate: 33.3,
      },
      graph: {
        nodes: 3,
        edges: 2,
        levels: 3,
      },
      tasks: [],
      warnings: ['stalled'],
    },
    planWorktrees: [
      {
        taskId: 'task-1',
        branchName: 'agent/issue-903/task-1',
        worktreePath: path.join(rootDir, '.ai', 'worktrees', 'issue-903', 'task-1'),
        mode: 'git-worktree',
        lifecycle: 'created',
      },
    ],
  });

  const previousMarker =
    '<!-- miyabi-water-spider-state {"issueNumber":903,"sessionId":"previous-session","continuityStatus":"retryable_failure","recommendedAction":"retry-execute","action":"retry-execute","attempt":2,"maxAttempts":2,"autoRetryEnabled":true,"dispatched":true,"recordedAt":"2026-04-05T00:00:00.000Z"} -->';
  const decision = await runWaterSpiderContinuityController({
    issueNumber: 903,
    rootDir,
    summaryJsonPath,
    runUrl: 'https://example.invalid/runs/903',
    triggerSource: 'smoke',
    env: {
      GITHUB_REPOSITORY: 'takahiro-shimizu-2/judgesystem',
      GITHUB_TOKEN: 'smoke-token',
      AUTOMATION_WATER_SPIDER_AUTO_RETRY: 'true',
      AUTOMATION_WATER_SPIDER_MAX_ATTEMPTS: '2',
    },
    octokitFactory: () => ({
      request: async (route: string) => {
        if (route.startsWith('GET /repos/{owner}/{repo}/issues/{issue_number}/comments')) {
          return {
            data: [{ body: previousMarker }],
          };
        }
        throw new Error(`Unexpected route: ${route}`);
      },
    }),
  });

  assert(decision.continuityStatus === 'stalled', `Expected stalled status, got ${decision.continuityStatus}.`);
  assert(decision.recommendedAction === 'resume-execute', `Expected resume-execute recommendation, got ${decision.recommendedAction}.`);
  assert(decision.action === 'escalate', `Expected escalate final action, got ${decision.action}.`);
  assert(decision.previousAttempts === 2, `Expected previous attempts 2, got ${decision.previousAttempts}.`);
  console.log('[passed] water-spider-budget');
  console.log(`  - recommended=${decision.recommendedAction}`);
  console.log(`  - final=${decision.action}`);
}

function writeFixtures(params: {
  rootDir: string;
  reportsDir: string;
  sessionId: string;
  issueNumber: number;
  workflowStatus: 'success' | 'failure';
  executionMode: 'planning' | 'execute' | 'unknown';
  report: Record<string, unknown>;
  planWorktrees: Array<Record<string, unknown>>;
}) {
  const planPath = path.join(params.reportsDir, `execution-plan-${params.sessionId}.json`);
  const reportPath = path.join(params.reportsDir, `agents-parallel-${params.sessionId}.json`);
  const plansMarkdownPath = path.join(params.reportsDir, `plans-${params.sessionId}.md`);
  const summaryJsonPath = path.join(params.rootDir, `${params.sessionId}-summary.json`);

  mkdirSync(params.reportsDir, { recursive: true });

  writeFileSync(
    planPath,
    JSON.stringify(
      {
        sessionId: params.sessionId,
        createdAt: '2026-04-05T00:00:00.000Z',
        worktrees: params.planWorktrees,
      },
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(reportPath, JSON.stringify(params.report, null, 2), 'utf8');
  writeFileSync(plansMarkdownPath, '# living plan\n', 'utf8');
  writeFileSync(
    summaryJsonPath,
    JSON.stringify(
      {
        status: params.workflowStatus,
        issueNumber: params.issueNumber,
        executionMode: params.executionMode,
        sessionId: params.sessionId,
        reportPath,
        planPath,
        plansMarkdownPath,
        totals: (params.report as { summary: Record<string, unknown> }).summary,
        warnings: [],
        markdown: 'summary',
      },
      null,
      2,
    ),
    'utf8',
  );

  assert(existsSync(readFilePath(summaryJsonPath)), 'Summary fixture was not written.');
  return summaryJsonPath;
}

function readFilePath(filePath: string) {
  readFileSync(filePath, 'utf8');
  return filePath;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
