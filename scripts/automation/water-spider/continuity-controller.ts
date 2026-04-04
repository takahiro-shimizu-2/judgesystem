import * as fs from 'node:fs';
import * as path from 'node:path';

import { Octokit } from '@octokit/rest';

import type { ExecutionReport } from '../orchestration/task-executor.js';
import { resolveRepositoryContext, resolveGitHubToken } from '../reporting/repository-metrics.js';

type WorkflowExecutionStatus = 'success' | 'failure';
type WorkflowExecutionMode = ExecutionReport['executionMode'] | 'unknown';
type WorktreeAssignmentLifecycle = 'planned' | 'created' | 'reused' | 'cleaned';
type WorktreeAssignmentMode = 'reuse-current-tree' | 'git-worktree';
type DispatchableContinuityAction = 'retry-execute' | 'resume-execute';

export type WaterSpiderContinuityStatus = 'healthy' | 'idle' | 'stalled' | 'retryable_failure' | 'blocked';
export type WaterSpiderContinuityAction =
  | 'noop'
  | DispatchableContinuityAction
  | 'replay-planning'
  | 'escalate';

interface StoredExecutionArtifactSummary {
  status: WorkflowExecutionStatus;
  issueNumber: number;
  executionMode: WorkflowExecutionMode;
  sessionId?: string;
  reportPath?: string;
  planPath?: string;
  plansMarkdownPath?: string;
  totals: {
    total: number;
    completed: number;
    skipped: number;
    planned: number;
    failed: number;
  };
  warnings: string[];
  markdown: string;
}

interface StoredExecutionPlan {
  sessionId: string;
  createdAt: string;
  worktrees?: Array<{
    taskId: string;
    branchName: string;
    worktreePath: string;
    mode: WorktreeAssignmentMode;
    lifecycle: WorktreeAssignmentLifecycle;
  }>;
}

interface WaterSpiderStoredState {
  issueNumber: number;
  sessionId?: string;
  continuityStatus: WaterSpiderContinuityStatus;
  recommendedAction: WaterSpiderContinuityAction;
  action: WaterSpiderContinuityAction;
  attempt: number;
  maxAttempts: number;
  autoRetryEnabled: boolean;
  dispatched: boolean;
  recordedAt: string;
}

interface WaterSpiderWorktreeSummary {
  total: number;
  persistent: number;
  uncleaned: number;
  lifecycles: Record<WorktreeAssignmentLifecycle, number>;
  modes: Record<WorktreeAssignmentMode, number>;
}

export interface WaterSpiderDecision {
  issueNumber: number;
  sessionId?: string;
  continuityStatus: WaterSpiderContinuityStatus;
  recommendedAction: WaterSpiderContinuityAction;
  action: WaterSpiderContinuityAction;
  executionMode: WorkflowExecutionMode;
  workflowStatus: WorkflowExecutionStatus;
  triggerSource: string;
  runUrl: string;
  summaryJsonPath: string;
  reportPath?: string;
  planPath?: string;
  plansMarkdownPath?: string;
  totals: StoredExecutionArtifactSummary['totals'];
  warnings: string[];
  previousAttempts: number;
  attempt: number;
  maxAttempts: number;
  autoRetryEnabled: boolean;
  dispatched: boolean;
  dispatchWorkflowId?: string;
  dispatchRef?: string;
  dispatchError?: string;
  worktrees: WaterSpiderWorktreeSummary;
  notes: string[];
  reason: string;
  recordedAt: string;
  marker: string;
}

export interface WaterSpiderControllerOptions {
  issueNumber: number;
  rootDir: string;
  summaryJsonPath: string;
  runUrl: string;
  triggerSource: string;
  env?: NodeJS.ProcessEnv;
  octokitFactory?: (token: string) => WaterSpiderOctokitLike;
  now?: () => Date;
}

interface WaterSpiderConfig {
  autoRetryEnabled: boolean;
  maxAttempts: number;
  workflowId: string;
  ref: string;
}

interface WaterSpiderGitHubContext {
  owner: string;
  repo: string;
  octokit?: WaterSpiderOctokitLike;
}

interface WaterSpiderOctokitLike {
  request: (...args: any[]) => Promise<any>;
}

const WATER_SPIDER_MARKER_PREFIX = 'miyabi-water-spider-state';
const DEFAULT_MAX_ATTEMPTS = 2;
const WATER_SPIDER_DISPATCHABLE_ACTIONS = new Set<WaterSpiderContinuityAction>(['retry-execute', 'resume-execute']);

export async function runWaterSpiderContinuityController(
  options: WaterSpiderControllerOptions,
): Promise<WaterSpiderDecision> {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;
  const summary = readSummary(options.summaryJsonPath);
  const report = readJsonIfPresent<ExecutionReport>(summary.reportPath);
  const plan = readJsonIfPresent<StoredExecutionPlan>(summary.planPath);
  const config = resolveWaterSpiderConfig(env);
  const token = env.GITHUB_TOKEN || env.GH_PROJECT_TOKEN || env.GH_TOKEN || resolveGitHubToken();
  const repository = resolveRepositoryContext(
    env.GITHUB_REPOSITORY || env.REPOSITORY || process.env.GITHUB_REPOSITORY,
  );
  const octokit = token ? (options.octokitFactory ? options.octokitFactory(token) : new Octokit({ auth: token })) : undefined;
  const github: WaterSpiderGitHubContext = {
    owner: repository.owner,
    repo: repository.repo,
    octokit,
  };
  const previousStates = octokit
    ? await loadStoredStates({
        octokit,
        owner: repository.owner,
        repo: repository.repo,
        issueNumber: options.issueNumber,
      })
    : [];
  const previousAttempts = previousStates.reduce((max, state) => Math.max(max, state.attempt || 0), 0);
  const worktrees = summarizeWorktrees(plan?.worktrees);
  const recordedAt = now().toISOString();

  const evaluation = evaluateContinuity({
    summary,
    report,
    worktrees,
  });

  let action = evaluation.recommendedAction;
  let attempt = previousAttempts;
  let dispatched = false;
  let dispatchError: string | undefined;

  const notes = [...evaluation.notes];
  if (!octokit && WATER_SPIDER_DISPATCHABLE_ACTIONS.has(action)) {
    notes.push('GitHub token was not available, so Water Spider could not auto-dispatch a follow-up run.');
    action = 'escalate';
    dispatchError = 'GitHub token is required to auto-dispatch continuity retries.';
  } else if (WATER_SPIDER_DISPATCHABLE_ACTIONS.has(action)) {
    if (!config.autoRetryEnabled) {
      notes.push('Water Spider auto-retry is disabled, so the controller recorded the recommendation without dispatching a new run.');
      action = 'noop';
    } else if (previousAttempts >= config.maxAttempts) {
      notes.push(`Water Spider retry budget is exhausted (${previousAttempts}/${config.maxAttempts}).`);
      action = 'escalate';
    } else {
      attempt = previousAttempts + 1;
      const dispatchResult = await dispatchWaterSpiderFollowUp({
        octokit: octokit!,
        owner: github.owner,
        repo: github.repo,
        workflowId: config.workflowId,
        ref: config.ref,
        issueNumber: options.issueNumber,
      });
      if (dispatchResult.ok) {
        dispatched = true;
        notes.push(
          `Water Spider dispatched ${config.workflowId} on ref=${config.ref} for issue #${options.issueNumber} (attempt ${attempt}/${config.maxAttempts}).`,
        );
      } else {
        action = 'escalate';
        dispatchError = dispatchResult.error;
        notes.push(dispatchResult.error);
      }
    }
  }

  if (!WATER_SPIDER_DISPATCHABLE_ACTIONS.has(action)) {
    attempt = previousAttempts;
  }

  const decision: WaterSpiderDecision = {
    issueNumber: options.issueNumber,
    sessionId: summary.sessionId,
    continuityStatus: evaluation.status,
    recommendedAction: evaluation.recommendedAction,
    action,
    executionMode: summary.executionMode,
    workflowStatus: summary.status,
    triggerSource: options.triggerSource,
    runUrl: options.runUrl,
    summaryJsonPath: options.summaryJsonPath,
    reportPath: summary.reportPath,
    planPath: summary.planPath,
    plansMarkdownPath: summary.plansMarkdownPath,
    totals: summary.totals,
    warnings: summary.warnings,
    previousAttempts,
    attempt,
    maxAttempts: config.maxAttempts,
    autoRetryEnabled: config.autoRetryEnabled,
    dispatched,
    dispatchWorkflowId: WATER_SPIDER_DISPATCHABLE_ACTIONS.has(evaluation.recommendedAction) ? config.workflowId : undefined,
    dispatchRef: WATER_SPIDER_DISPATCHABLE_ACTIONS.has(evaluation.recommendedAction) ? config.ref : undefined,
    dispatchError,
    worktrees,
    notes,
    reason: evaluation.reason,
    recordedAt,
    marker: '',
  };

  decision.marker = buildStoredStateMarker(decision);
  return decision;
}

export function renderWaterSpiderMarkdown(decision: WaterSpiderDecision, rootDir: string) {
  const paths = [
    decision.summaryJsonPath ? `- Summary JSON: \`${toRelativePath(rootDir, decision.summaryJsonPath)}\`` : null,
    decision.reportPath ? `- Execution Report: \`${toRelativePath(rootDir, decision.reportPath)}\`` : null,
    decision.planPath ? `- Execution Plan: \`${toRelativePath(rootDir, decision.planPath)}\`` : null,
    decision.plansMarkdownPath ? `- Living Plan: \`${toRelativePath(rootDir, decision.plansMarkdownPath)}\`` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const notes = decision.notes.length > 0 ? decision.notes.map((note) => `- ${note}`).join('\n') : '- No additional continuity notes.';
  const worktreeNotes = [
    `- Total assignments: ${decision.worktrees.total}`,
    `- Persistent worktrees: ${decision.worktrees.persistent}`,
    `- Uncleaned worktrees: ${decision.worktrees.uncleaned}`,
  ].join('\n');

  return `## 🕷️ Water Spider Continuity

**Continuity Status**: \`${decision.continuityStatus}\`
**Recommended Action**: \`${decision.recommendedAction}\`
**Final Action**: \`${decision.action}\`
**Execution Mode**: \`${decision.executionMode}\`
**Attempts**: ${decision.attempt}/${decision.maxAttempts}
**Auto Retry**: ${decision.autoRetryEnabled ? 'enabled' : 'disabled'}
**Trigger Source**: \`${decision.triggerSource || 'unknown'}\`

### Reason

${decision.reason}

### Artifact Links

${paths}

### Worktree State

${worktreeNotes}

### Continuity Notes

${notes}

[View Run Logs →](${decision.runUrl})

${decision.marker}`;
}

export function writeWaterSpiderArtifacts(params: {
  rootDir: string;
  decision: WaterSpiderDecision;
  markdownPath?: string;
  jsonPath?: string;
}) {
  const reportsDir = path.join(params.rootDir, '.ai', 'parallel-reports');
  const sessionToken = params.decision.sessionId || `issue-${params.decision.issueNumber}-${Date.now()}`;
  const markdownPath = params.markdownPath || path.join(reportsDir, `water-spider-${sessionToken}.md`);
  const jsonPath = params.jsonPath || path.join(reportsDir, `water-spider-${sessionToken}.json`);

  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, `${renderWaterSpiderMarkdown(params.decision, params.rootDir)}\n`, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(params.decision, null, 2), 'utf8');

  return {
    markdownPath,
    jsonPath,
  };
}

function resolveWaterSpiderConfig(env: NodeJS.ProcessEnv): WaterSpiderConfig {
  const maxAttempts = parsePositiveInteger(env.AUTOMATION_WATER_SPIDER_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS;
  const ref =
    env.AUTOMATION_WATER_SPIDER_REF ||
    env.GITHUB_HEAD_REF ||
    env.GITHUB_REF_NAME ||
    sanitizeGitRef(env.GITHUB_REF) ||
    'develop';

  return {
    autoRetryEnabled: env.AUTOMATION_WATER_SPIDER_AUTO_RETRY === 'true',
    maxAttempts,
    workflowId: env.AUTOMATION_WATER_SPIDER_WORKFLOW_ID || 'autonomous-agent.yml',
    ref,
  };
}

function sanitizeGitRef(ref?: string) {
  if (!ref) {
    return '';
  }
  return ref.replace(/^refs\/heads\//, '').trim();
}

function readSummary(summaryJsonPath: string) {
  return JSON.parse(fs.readFileSync(summaryJsonPath, 'utf8')) as StoredExecutionArtifactSummary;
}

function readJsonIfPresent<T>(filePath?: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function summarizeWorktrees(worktrees?: StoredExecutionPlan['worktrees']): WaterSpiderWorktreeSummary {
  const summary: WaterSpiderWorktreeSummary = {
    total: worktrees?.length || 0,
    persistent: 0,
    uncleaned: 0,
    lifecycles: {
      planned: 0,
      created: 0,
      reused: 0,
      cleaned: 0,
    },
    modes: {
      'reuse-current-tree': 0,
      'git-worktree': 0,
    },
  };

  for (const worktree of worktrees || []) {
    summary.modes[worktree.mode] += 1;
    summary.lifecycles[worktree.lifecycle] += 1;
    if (worktree.mode === 'git-worktree') {
      summary.persistent += 1;
      if (worktree.lifecycle !== 'cleaned') {
        summary.uncleaned += 1;
      }
    }
  }

  return summary;
}

interface ContinuityEvaluation {
  status: WaterSpiderContinuityStatus;
  recommendedAction: WaterSpiderContinuityAction;
  reason: string;
  notes: string[];
}

function evaluateContinuity(params: {
  summary: StoredExecutionArtifactSummary;
  report?: ExecutionReport;
  worktrees: WaterSpiderWorktreeSummary;
}): ContinuityEvaluation {
  const { summary, report, worktrees } = params;
  const failedTasks = report?.summary.failed ?? summary.totals.failed;
  const skippedTasks = report?.summary.skipped ?? summary.totals.skipped;
  const totalTasks = report?.summary.total ?? summary.totals.total;
  const resumeEligible = worktrees.persistent > 0 && worktrees.uncleaned > 0;

  if (summary.executionMode !== 'execute') {
    return {
      status: 'idle' as const,
      recommendedAction: 'noop' as const,
      reason: 'Water Spider only auto-continues execute runs; planning runs are intentionally left as observation-only artifacts.',
      notes: ['This run executed in planning mode, so no continuity replay was requested.'],
    };
  }

  if (summary.status === 'success' && failedTasks === 0) {
    return {
      status: 'healthy' as const,
      recommendedAction: 'noop' as const,
      reason: 'The execute run completed without failed tasks, so Water Spider did not need to continue the pipeline.',
      notes: ['The latest execute run is healthy.'],
    };
  }

  if (!report) {
    return {
      status: 'stalled' as const,
      recommendedAction: 'retry-execute' as const,
      reason: 'The workflow finished without an execution report artifact, so the run is treated as stalled and eligible for a fresh execute retry.',
      notes: ['No execution report artifact was found under `.ai/parallel-reports/`.'],
    };
  }

  if (failedTasks > 0) {
    return {
      status: 'retryable_failure' as const,
      recommendedAction: 'retry-execute' as const,
      reason: `${failedTasks} task(s) failed in the latest execute run, so Water Spider recommends a clean execute retry.`,
      notes: [`Failed tasks detected: ${failedTasks}.`, `Skipped tasks detected: ${skippedTasks}.`],
    };
  }

  if (skippedTasks > 0) {
    return {
      status: 'stalled' as const,
      recommendedAction: resumeEligible ? 'resume-execute' : 'retry-execute',
      reason: resumeEligible
        ? `${skippedTasks} task(s) were skipped, and persistent git worktrees are still available, so Water Spider recommends a resume-style execute rerun.`
        : `${skippedTasks} task(s) were skipped, but no persistent git worktree is available, so Water Spider recommends a clean execute retry instead of a resume.`,
      notes: [
        `Skipped tasks detected: ${skippedTasks}.`,
        resumeEligible
          ? 'Persistent git worktrees remained available for continuity.'
          : 'No reusable git worktree remained available for continuity.',
      ],
    };
  }

  if (totalTasks === 0) {
    return {
      status: 'idle' as const,
      recommendedAction: 'noop' as const,
      reason: 'No executable tasks were produced in the latest execute run, so there is nothing for Water Spider to continue.',
      notes: ['The execution report contained zero tasks.'],
    };
  }

  return {
    status: 'blocked' as const,
    recommendedAction: 'escalate' as const,
    reason: 'The latest run did not fit a retryable or resumable continuity pattern, so Water Spider escalated it for manual inspection.',
    notes: ['The execution report requires manual inspection before continuing.'],
  };
}

async function loadStoredStates(params: {
  octokit: WaterSpiderOctokitLike;
  owner: string;
  repo: string;
  issueNumber: number;
}) {
  const states: WaterSpiderStoredState[] = [];
  let page = 1;

  while (true) {
    const response = (await params.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      per_page: 100,
      page,
    })) as { data: Array<{ body?: string | null }> };

    for (const comment of response.data) {
      const body = comment.body || '';
      for (const state of extractStoredStates(body)) {
        if (state.issueNumber === params.issueNumber) {
          states.push(state);
        }
      }
    }

    if (response.data.length < 100) {
      break;
    }
    page += 1;
  }

  return states;
}

function extractStoredStates(body: string) {
  const states: WaterSpiderStoredState[] = [];
  const pattern = new RegExp(`<!--\\s*${WATER_SPIDER_MARKER_PREFIX}\\s+({[\\s\\S]*?})\\s*-->`, 'g');

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    try {
      states.push(JSON.parse(match[1]) as WaterSpiderStoredState);
    } catch {
      // Ignore malformed historical markers so Water Spider can keep moving.
    }
  }

  return states;
}

async function dispatchWaterSpiderFollowUp(params: {
  octokit: WaterSpiderOctokitLike;
  owner: string;
  repo: string;
  workflowId: string;
  ref: string;
  issueNumber: number;
}) {
  try {
    await params.octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
      owner: params.owner,
      repo: params.repo,
      workflow_id: params.workflowId,
      ref: params.ref,
      inputs: {
        issue_number: String(params.issueNumber),
        execution_mode: 'execute',
      },
    });

    return {
      ok: true as const,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: `Water Spider failed to dispatch ${params.workflowId} on ref=${params.ref}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function buildStoredStateMarker(decision: WaterSpiderDecision) {
  const state: WaterSpiderStoredState = {
    issueNumber: decision.issueNumber,
    sessionId: decision.sessionId,
    continuityStatus: decision.continuityStatus,
    recommendedAction: decision.recommendedAction,
    action: decision.action,
    attempt: decision.attempt,
    maxAttempts: decision.maxAttempts,
    autoRetryEnabled: decision.autoRetryEnabled,
    dispatched: decision.dispatched,
    recordedAt: decision.recordedAt,
  };

  return `<!-- ${WATER_SPIDER_MARKER_PREFIX} ${JSON.stringify(state)} -->`;
}

function parsePositiveInteger(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function toRelativePath(rootDir: string, filePath: string) {
  return path.relative(rootDir, filePath) || '.';
}
