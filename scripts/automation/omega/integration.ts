import * as fs from 'fs';
import * as path from 'path';

import { truncateText, unique } from '../core/utils.js';
import type { ExecutionPlan, TaskManagerRunResult } from '../orchestration/task-manager.js';
import type { ExecutionReport } from '../orchestration/task-executor.js';
import type { OmegaLearningCarryForward } from './understanding.js';

type SessionArtifactKind = 'codegen' | 'test' | 'review' | 'pr' | 'deploy' | 'continuity' | 'other';
export type OmegaDeliverableStatus = 'planning-only' | 'ready' | 'needs-review' | 'blocked';

export interface OmegaSessionArtifactRef {
  path: string;
  kind: SessionArtifactKind;
}

export interface OmegaDeliverable {
  deliverableId: string;
  sessionId: string;
  issueNumber: number;
  createdAt: string;
  executionMode: ExecutionReport['executionMode'];
  status: OmegaDeliverableStatus;
  deliverableFocus: string;
  completeness: number;
  sourceArtifacts: {
    planPath: string;
    reportPath: string;
    plansPath: string;
    intentPath: string;
    strategicPlanPath: string;
    logPath: string;
  };
  handlerArtifacts: Record<SessionArtifactKind, string[]>;
  taskSummary: {
    total: number;
    completed: number;
    planned: number;
    skipped: number;
    failed: number;
    completedAgents: string[];
    blockedTasks: string[];
    pendingTasks: string[];
  };
  issues: string[];
  recommendations: string[];
  priorLearning?: OmegaLearningCarryForward;
}

export interface OmegaLearningPattern {
  type: 'success' | 'failure' | 'planning' | 'handoff';
  description: string;
  evidence: string[];
}

export interface OmegaLearningLesson {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
}

export interface OmegaLearningArtifact {
  knowledgeId: string;
  issueNumber: number;
  createdAt: string;
  sourceSessionId: string;
  sourceDeliverableId: string;
  derivedFromStatus: OmegaDeliverableStatus;
  patterns: OmegaLearningPattern[];
  lessons: OmegaLearningLesson[];
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  summary: {
    overallLearningScore: number;
    artifactCount: number;
    carriesForwardToNextRun: boolean;
  };
}

interface ArtifactPathsForOmega {
  planPath: string;
  reportPath: string;
  plansPath: string;
  intentPath: string;
  strategicPlanPath: string;
  logPath: string;
}

const SESSION_ARTIFACT_PREFIX_MAP: Array<{ prefix: string; kind: SessionArtifactKind }> = [
  { prefix: 'codegen-summary-', kind: 'codegen' },
  { prefix: 'test-summary-', kind: 'test' },
  { prefix: 'test-comment-', kind: 'test' },
  { prefix: 'review-summary-', kind: 'review' },
  { prefix: 'review-comment-', kind: 'review' },
  { prefix: 'pr-draft-', kind: 'pr' },
  { prefix: 'deployment-summary-', kind: 'deploy' },
  { prefix: 'water-spider-', kind: 'continuity' },
];

export function buildOmegaDeliverable(args: {
  rootDir: string;
  plan: ExecutionPlan;
  report: ExecutionReport;
  artifactPaths: ArtifactPathsForOmega;
}): OmegaDeliverable {
  const sessionArtifacts = collectSessionArtifacts(args.rootDir, args.plan.sessionId);
  const taskSummary = summarizeTasks(args.report);
  const issues = buildDeliverableIssues(args.report, taskSummary);
  const recommendations = buildDeliverableRecommendations(args.report, taskSummary);

  return {
    deliverableId: `deliverable-${args.plan.sessionId}`,
    sessionId: args.plan.sessionId,
    issueNumber: args.plan.issue.number,
    createdAt: new Date(args.report.endTime).toISOString(),
    executionMode: args.report.executionMode,
    status: deriveDeliverableStatus(args.report, taskSummary),
    deliverableFocus: args.plan.omega.strategicPlan.deliverableFocus,
    completeness: deriveCompleteness(args.report),
    sourceArtifacts: {
      planPath: args.artifactPaths.planPath,
      reportPath: args.artifactPaths.reportPath,
      plansPath: args.artifactPaths.plansPath,
      intentPath: args.artifactPaths.intentPath,
      strategicPlanPath: args.artifactPaths.strategicPlanPath,
      logPath: args.artifactPaths.logPath,
    },
    handlerArtifacts: categorizeSessionArtifacts(args.rootDir, sessionArtifacts),
    taskSummary,
    issues,
    recommendations,
    priorLearning: args.plan.omega.previousLearning,
  };
}

export function buildOmegaLearningArtifact(args: {
  deliverable: OmegaDeliverable;
  plan: ExecutionPlan;
  report: ExecutionReport;
}): OmegaLearningArtifact {
  const patterns = buildLearningPatterns(args.deliverable, args.report);
  const lessons = buildLearningLessons(args.deliverable, args.report);
  const recommendations = buildLearningRecommendations(args.deliverable, args.report);

  return {
    knowledgeId: `knowledge-${args.plan.sessionId}`,
    issueNumber: args.plan.issue.number,
    createdAt: new Date(args.report.endTime).toISOString(),
    sourceSessionId: args.plan.sessionId,
    sourceDeliverableId: args.deliverable.deliverableId,
    derivedFromStatus: args.deliverable.status,
    patterns,
    lessons,
    recommendations,
    summary: {
      overallLearningScore: deriveLearningScore(args.deliverable, args.report),
      artifactCount: countArtifactRefs(args.deliverable.handlerArtifacts),
      carriesForwardToNextRun: true,
    },
  };
}

export function loadLatestOmegaLearningContext(params: {
  rootDir: string;
  issueNumber: number;
  excludeSessionId?: string;
}): OmegaLearningCarryForward | undefined {
  const reportsDir = path.join(params.rootDir, '.ai', 'parallel-reports');
  if (!fs.existsSync(reportsDir)) {
    return undefined;
  }

  const candidates = fs
    .readdirSync(reportsDir)
    .filter((entry) => entry.startsWith('omega-learning-') && entry.endsWith('.json'))
    .map((entry) => path.join(reportsDir, entry))
    .map((filePath) => ({
      path: filePath,
      payload: JSON.parse(fs.readFileSync(filePath, 'utf8')) as OmegaLearningArtifact,
      mtimeMs: fs.statSync(filePath).mtimeMs,
    }))
    .filter(
      (entry) =>
        entry.payload.issueNumber === params.issueNumber &&
        entry.payload.sourceSessionId !== params.excludeSessionId,
    )
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const latest = candidates[0];
  if (!latest) {
    return undefined;
  }

  const immediateRecommendations = latest.payload.recommendations.immediate.slice(0, 3);
  const lessonPreview = latest.payload.lessons[0]
    ? `${latest.payload.lessons[0].title}: ${latest.payload.lessons[0].description}`
    : 'No blocking lessons were recorded.';

  return {
    knowledgeId: latest.payload.knowledgeId,
    sourceSessionId: latest.payload.sourceSessionId,
    createdAt: latest.payload.createdAt,
    sourcePath: latest.path,
    overallLearningScore: latest.payload.summary.overallLearningScore,
    immediateRecommendations,
    lessonPreview: truncateText(lessonPreview, 180),
  };
}

function collectSessionArtifacts(rootDir: string, sessionId: string) {
  const reportsDir = path.join(rootDir, '.ai', 'parallel-reports');
  if (!fs.existsSync(reportsDir)) {
    return [];
  }

  return fs
    .readdirSync(reportsDir)
    .filter((entry) => entry.includes(sessionId))
    .map((entry) => path.join(reportsDir, entry))
    .map((artifactPath) => ({
      path: artifactPath,
      baseName: path.basename(artifactPath),
    }));
}

function categorizeSessionArtifacts(rootDir: string, artifacts: Array<{ path: string; baseName: string }>) {
  const buckets: Record<SessionArtifactKind, string[]> = {
    codegen: [],
    test: [],
    review: [],
    pr: [],
    deploy: [],
    continuity: [],
    other: [],
  };

  for (const artifact of artifacts) {
    const matched = SESSION_ARTIFACT_PREFIX_MAP.find((entry) => artifact.baseName.startsWith(entry.prefix));
    const kind = matched?.kind ?? 'other';
    buckets[kind].push(path.relative(rootDir, artifact.path));
  }

  return buckets;
}

function summarizeTasks(report: ExecutionReport) {
  return {
    total: report.summary.total,
    completed: report.summary.completed,
    planned: report.summary.planned,
    skipped: report.summary.skipped,
    failed: report.summary.failed,
    completedAgents: unique(report.tasks.filter((task) => task.status === 'completed').map((task) => task.agentType)),
    blockedTasks: report.tasks
      .filter((task) => task.status === 'failed' || task.status === 'skipped')
      .map((task) => `${task.taskId} (${task.status})`),
    pendingTasks: report.tasks
      .filter((task) => task.status === 'planned')
      .map((task) => `${task.taskId} (${task.agentType})`),
  };
}

function buildDeliverableIssues(
  report: ExecutionReport,
  taskSummary: ReturnType<typeof summarizeTasks>,
) {
  return unique([
    ...report.warnings,
    ...taskSummary.blockedTasks.map((task) => `Blocked task: ${task}`),
  ]);
}

function buildDeliverableRecommendations(
  report: ExecutionReport,
  taskSummary: ReturnType<typeof summarizeTasks>,
) {
  const recommendations = [
    report.executionMode === 'planning'
      ? 'Review the strategic plan and open execute gates only for the capabilities that are intentionally allowed.'
      : null,
    taskSummary.failed > 0
      ? 'Resolve failed tasks before treating the deliverable as merge-ready.'
      : null,
    taskSummary.planned > 0
      ? 'Promote remaining planned tasks into explicit follow-up runs or narrow the scope so the deliverable can converge.'
      : null,
    taskSummary.skipped > 0
      ? 'Inspect dependency failures and replay the blocked handoff chain once prerequisites are healthy.'
      : null,
    report.warnings.length > 0
      ? 'Carry runtime warnings into the next run instead of assuming the missing capability is resolved.'
      : null,
    taskSummary.failed === 0 && taskSummary.planned === 0 && taskSummary.skipped === 0 && report.executionMode === 'execute'
      ? 'Use this deliverable as the current best-known-good baseline for the next Omega learning cycle.'
      : null,
  ].filter((value): value is string => Boolean(value));

  return unique(recommendations);
}

function deriveDeliverableStatus(
  report: ExecutionReport,
  taskSummary: ReturnType<typeof summarizeTasks>,
): OmegaDeliverableStatus {
  if (report.executionMode === 'planning') {
    return 'planning-only';
  }

  if (taskSummary.failed > 0) {
    return 'blocked';
  }

  if (taskSummary.planned > 0 || taskSummary.skipped > 0) {
    return 'needs-review';
  }

  return 'ready';
}

function deriveCompleteness(report: ExecutionReport) {
  if (report.summary.total === 0) {
    return 0;
  }

  return Math.round(
    ((report.summary.completed + report.summary.planned + report.summary.skipped) / report.summary.total) * 100,
  );
}

function buildLearningPatterns(deliverable: OmegaDeliverable, report: ExecutionReport): OmegaLearningPattern[] {
  const patterns: OmegaLearningPattern[] = [];

  if (deliverable.status === 'planning-only') {
    patterns.push({
      type: 'planning',
      description: 'A planning-first run successfully produced an intent, strategic plan, and integrated deliverable summary.',
      evidence: [
        `planned=${report.summary.planned}`,
        `strategicFocus=${deliverable.deliverableFocus}`,
      ],
    });
  }

  if (deliverable.status === 'ready') {
    patterns.push({
      type: 'success',
      description: 'The execution path completed without blocked or pending tasks.',
      evidence: [
        `completed=${report.summary.completed}/${report.summary.total}`,
        `completedAgents=${deliverable.taskSummary.completedAgents.join(', ') || 'none'}`,
      ],
    });
  }

  if (deliverable.status === 'blocked') {
    patterns.push({
      type: 'failure',
      description: 'One or more tasks failed, so the deliverable should not be treated as healthy yet.',
      evidence: deliverable.taskSummary.blockedTasks.slice(0, 3),
    });
  }

  if (deliverable.taskSummary.completedAgents.includes('TestAgent') && deliverable.taskSummary.completedAgents.includes('ReviewAgent')) {
    patterns.push({
      type: 'handoff',
      description: 'The quality pipeline preserved the CodeGen/Test/Review handoff chain inside the same session.',
      evidence: [`completedAgents=${deliverable.taskSummary.completedAgents.join(', ')}`],
    });
  }

  return patterns;
}

function buildLearningLessons(deliverable: OmegaDeliverable, report: ExecutionReport): OmegaLearningLesson[] {
  const lessons: OmegaLearningLesson[] = [];

  if (deliverable.status === 'planning-only') {
    lessons.push({
      severity: 'info',
      title: 'Planning remains an explicit gate',
      description:
        'The runtime can now integrate planning output into a deliverable, but execute-mode capabilities should still be opened intentionally per run.',
    });
  }

  if (report.warnings.length > 0) {
    lessons.push({
      severity: 'warning',
      title: 'Runtime warnings must stay visible',
      description: truncateText(report.warnings.join(' | '), 220),
    });
  }

  if (deliverable.taskSummary.failed > 0) {
    lessons.push({
      severity: 'critical',
      title: 'Blocked tasks degrade the learning signal',
      description: `Failed tasks: ${deliverable.taskSummary.blockedTasks.join(', ')}`,
    });
  }

  if (lessons.length === 0) {
    lessons.push({
      severity: 'info',
      title: 'No blocking lessons recorded',
      description: 'The current run produced a clean enough artifact set to carry forward directly.',
    });
  }

  return lessons;
}

function buildLearningRecommendations(deliverable: OmegaDeliverable, report: ExecutionReport) {
  const immediate = unique([
    ...deliverable.recommendations.slice(0, 3),
    deliverable.priorLearning ? 'Compare the new deliverable with the carried-forward learning context before the next execute run.' : null,
  ].filter((value): value is string => Boolean(value)));

  const shortTerm = unique([
    report.executionMode === 'planning'
      ? 'Use the strategic plan as the operator-facing handoff before enabling execute mode.'
      : 'Re-run the quality pipeline after any fix command or PR/deploy side effect changes the worktree.',
    deliverable.taskSummary.completedAgents.includes('DeploymentAgent')
      ? 'Record any provider-specific deploy observations so they can feed bridge revalidation later.'
      : null,
  ].filter((value): value is string => Boolean(value)));

  const longTerm = unique([
    'Use accumulated Omega learning artifacts to refine future issue-to-intent normalization.',
    'Keep bridge contracts narrow so future autonomy slices do not depend on hidden sibling-repo behavior.',
  ]);

  return {
    immediate,
    shortTerm,
    longTerm,
  };
}

function deriveLearningScore(deliverable: OmegaDeliverable, report: ExecutionReport) {
  let score = 100;
  score -= report.summary.failed * 20;
  score -= report.summary.skipped * 5;
  score -= report.warnings.length * 3;

  if (deliverable.status === 'planning-only') {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

function countArtifactRefs(artifacts: Record<SessionArtifactKind, string[]>) {
  return Object.values(artifacts).reduce((sum, entries) => sum + entries.length, 0);
}
