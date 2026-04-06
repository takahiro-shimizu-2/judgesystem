import * as fs from 'fs';
import * as path from 'path';

import { truncateText } from '../core/utils.js';
import type { OmegaDeliverable, OmegaLearningArtifact } from '../omega/integration.js';
import type { ExecutionReport } from '../orchestration/task-executor.js';

type WorkflowExecutionStatus = 'success' | 'failure';

interface SummaryCliArgs {
  issueNumber: number;
  rootDir: string;
  runUrl: string;
  triggeredBy: string;
  workflowStatus: WorkflowExecutionStatus;
  outMarkdownPath: string;
  outJsonPath: string;
}

interface StoredExecutionPlan {
  sessionId: string;
  createdAt: string;
  issue: {
    number: number;
    title: string;
  };
  omega?: {
    intent?: {
      normalizedGoal: string;
      recommendedNextMode: 'planning' | 'execute';
    };
    strategicPlan?: {
      summary: string;
      deliverableFocus: string;
    };
  };
  strategy: 'llm' | 'heuristic';
  concurrency: number;
  dryRun: boolean;
  warnings: string[];
}

interface ExecutionArtifactSummary {
  status: WorkflowExecutionStatus;
  issueNumber: number;
  executionMode: ExecutionReport['executionMode'] | 'unknown';
  sessionId?: string;
  reportPath?: string;
  planPath?: string;
  plansMarkdownPath?: string;
  intentPath?: string;
  strategicPlanPath?: string;
  deliverablePath?: string;
  learningPath?: string;
  gitnexusPath?: string;
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

export async function runAutonomousAgentSummaryCli(argv = process.argv) {
  const args = parseArgs(argv);
  const summary = buildExecutionArtifactSummary(args);

  fs.writeFileSync(args.outMarkdownPath, `${summary.markdown}\n`, 'utf8');
  fs.writeFileSync(args.outJsonPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
}

export function buildExecutionArtifactSummary(args: SummaryCliArgs): ExecutionArtifactSummary {
  const latestReport = findLatestExecutionReport(args.rootDir, args.issueNumber);
  const linkedPlan = latestReport ? findExecutionPlan(args.rootDir, latestReport.report.sessionId) : undefined;
  const livingPlan = latestReport ? findLivingPlan(args.rootDir, latestReport.report.sessionId) : undefined;
  const omegaIntent = latestReport ? findOmegaIntent(args.rootDir, latestReport.report.sessionId) : undefined;
  const strategicPlan = latestReport ? findStrategicPlan(args.rootDir, latestReport.report.sessionId) : undefined;
  const deliverable = latestReport ? findOmegaDeliverable(args.rootDir, latestReport.report.sessionId) : undefined;
  const learning = latestReport ? findOmegaLearning(args.rootDir, latestReport.report.sessionId) : undefined;
  const gitnexus = latestReport ? findGitNexusArtifact(args.rootDir, latestReport.report.sessionId) : undefined;
  const effectiveStatus = deriveEffectiveStatus(args.workflowStatus, latestReport?.report);
  const markdown = buildIssueCommentMarkdown({
    ...args,
    status: effectiveStatus,
    report: latestReport?.report,
    plan: linkedPlan?.plan,
    deliverable: deliverable?.payload,
    learning: learning?.payload,
    intentPath: omegaIntent ? path.relative(args.rootDir, omegaIntent.path) : undefined,
    livingPlanPath: livingPlan ? path.relative(args.rootDir, livingPlan.path) : undefined,
    strategicPlanPath: strategicPlan ? path.relative(args.rootDir, strategicPlan.path) : undefined,
    deliverablePath: deliverable ? path.relative(args.rootDir, deliverable.path) : undefined,
    learningPath: learning ? path.relative(args.rootDir, learning.path) : undefined,
    gitnexusPath: gitnexus ? path.relative(args.rootDir, gitnexus.path) : undefined,
  });

  return {
    status: effectiveStatus,
    issueNumber: args.issueNumber,
    executionMode: latestReport?.report.executionMode ?? 'unknown',
    sessionId: latestReport?.report.sessionId,
    reportPath: latestReport?.path,
    planPath: linkedPlan?.path,
    plansMarkdownPath: livingPlan?.path,
    intentPath: omegaIntent?.path,
    strategicPlanPath: strategicPlan?.path,
    deliverablePath: deliverable?.path,
    learningPath: learning?.path,
    gitnexusPath: gitnexus?.path,
    totals: latestReport
      ? {
          total: latestReport.report.summary.total,
          completed: latestReport.report.summary.completed,
          skipped: latestReport.report.summary.skipped,
          planned: latestReport.report.summary.planned,
          failed: latestReport.report.summary.failed,
        }
      : {
          total: 0,
          completed: 0,
          skipped: 0,
          planned: 0,
          failed: 0,
        },
    warnings: latestReport?.report.warnings ?? [],
    markdown,
  };
}

function buildIssueCommentMarkdown(params: {
  issueNumber: number;
  runUrl: string;
  triggeredBy: string;
  status: WorkflowExecutionStatus;
  report?: ExecutionReport;
  plan?: StoredExecutionPlan;
  deliverable?: OmegaDeliverable;
  learning?: OmegaLearningArtifact;
  intentPath?: string;
  livingPlanPath?: string;
  strategicPlanPath?: string;
  deliverablePath?: string;
  learningPath?: string;
  gitnexusPath?: string;
}) {
  if (!params.report) {
    return `## ${params.status === 'success' ? '⚠️' : '❌'} Autonomous Agent Summary Unavailable

**Status**: ${params.status}
**Issue**: #${params.issueNumber}
**Triggered by**: ${params.triggeredBy}

The workflow finished, but no execution report artifact was found under \`.ai/parallel-reports/\`.

[View Run Logs →](${params.runUrl})
`;
  }

  const modeLabel = params.report.executionMode === 'planning' ? 'Planning' : 'Execution';
  const headingIcon = params.status === 'success' ? '✅' : '❌';
  const planNotes = [
    params.plan?.omega?.intent?.normalizedGoal ? `- Intent: ${params.plan.omega.intent.normalizedGoal}` : null,
    params.plan?.omega?.strategicPlan?.deliverableFocus
      ? `- Deliverable Focus: ${params.plan.omega.strategicPlan.deliverableFocus}`
      : null,
    params.deliverable ? `- Deliverable Status: \`${params.deliverable.status}\`` : null,
    params.learning ? `- Learning Score: ${params.learning.summary.overallLearningScore}/100` : null,
    params.plan && params.plan.strategy ? `- Strategy: \`${params.plan.strategy}\`` : null,
    params.plan ? `- Concurrency: ${params.plan.concurrency}` : null,
    params.intentPath ? `- Intent Artifact: \`${params.intentPath}\`` : null,
    params.livingPlanPath ? `- Planning Artifact: \`${params.livingPlanPath}\`` : null,
    params.strategicPlanPath ? `- Strategic Plan: \`${params.strategicPlanPath}\`` : null,
    params.deliverablePath ? `- Deliverable Artifact: \`${params.deliverablePath}\`` : null,
    params.learningPath ? `- Learning Artifact: \`${params.learningPath}\`` : null,
    params.gitnexusPath ? `- GitNexus Artifact: \`${params.gitnexusPath}\`` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const executionNotes = [planNotes, renderWarnings(params.report.warnings)].filter(Boolean).join('\n');

  return `## ${headingIcon} Autonomous ${modeLabel} Report

**Status**: ${params.status}
**Issue**: #${params.issueNumber}
**Triggered by**: ${params.triggeredBy}
**Execution Mode**: ${modeLabel}

### Summary

| Metric | Value |
| --- | --- |
| Tasks | ${params.report.summary.total} |
| Completed | ${params.report.summary.completed} |
| Skipped | ${params.report.summary.skipped} |
| Planned | ${params.report.summary.planned} |
| Failed | ${params.report.summary.failed} |
| DAG Levels | ${params.report.graph.levels} |
| DAG Edges | ${params.report.graph.edges} |

### Task Snapshot

${renderTaskSection('Completed', params.report, 'completed')}

${renderTaskSection('Skipped', params.report, 'skipped')}

${renderTaskSection('Planned', params.report, 'planned')}

${renderTaskSection('Failed', params.report, 'failed')}

### Execution Notes

${executionNotes}

[View Run Logs →](${params.runUrl})
`;
}

function renderTaskSection(
  label: string,
  report: ExecutionReport,
  status: 'completed' | 'skipped' | 'planned' | 'failed',
) {
  const tasks = report.tasks.filter((task) => task.status === status);
  if (tasks.length === 0) {
    return `#### ${label}\n\n_None_`;
  }

  return `#### ${label}\n\n${tasks
    .slice(0, 5)
    .map(
      (task) =>
        `- \`${task.agentType}\` ${task.title}${task.notes ? ` — ${truncateText(task.notes, 160)}` : ''}${
          task.error ? ` — ${truncateText(task.error, 160)}` : ''
        }`,
    )
    .join('\n')}`;
}

function renderWarnings(warnings: string[]) {
  if (warnings.length === 0) {
    return '- No workflow-level warnings were recorded.';
  }

  return warnings.map((warning) => `- ${warning}`).join('\n');
}

function deriveEffectiveStatus(workflowStatus: WorkflowExecutionStatus, report?: ExecutionReport): WorkflowExecutionStatus {
  if (workflowStatus === 'failure') {
    return 'failure';
  }

  if (!report) {
    return 'failure';
  }

  return report.summary.failed > 0 ? 'failure' : 'success';
}

function findLatestExecutionReport(rootDir: string, issueNumber: number) {
  const reportsDir = path.join(rootDir, '.ai', 'parallel-reports');
  if (!fs.existsSync(reportsDir)) {
    return undefined;
  }

  const reports = fs
    .readdirSync(reportsDir)
    .filter((file) => file.startsWith('agents-parallel-') && file.endsWith('.json'))
    .map((file) => path.join(reportsDir, file))
    .map((filePath) => ({
      path: filePath,
      report: JSON.parse(fs.readFileSync(filePath, 'utf8')) as ExecutionReport,
      mtimeMs: fs.statSync(filePath).mtimeMs,
    }))
    .filter((entry) => entry.report.issueNumber === issueNumber)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return reports[0];
}

function findExecutionPlan(rootDir: string, sessionId: string) {
  const planPath = path.join(rootDir, '.ai', 'parallel-reports', `execution-plan-${sessionId}.json`);
  if (!fs.existsSync(planPath)) {
    return undefined;
  }

  return {
    path: planPath,
    plan: JSON.parse(fs.readFileSync(planPath, 'utf8')) as StoredExecutionPlan,
  };
}

function findGitNexusArtifact(rootDir: string, sessionId: string) {
  const artifactPath = path.join(rootDir, '.ai', 'parallel-reports', `gitnexus-runtime-${sessionId}.json`);
  if (!fs.existsSync(artifactPath)) {
    return undefined;
  }

  return {
    path: artifactPath,
  };
}

function findLivingPlan(rootDir: string, sessionId: string) {
  const plansPath = path.join(rootDir, '.ai', 'parallel-reports', `plans-${sessionId}.md`);
  if (!fs.existsSync(plansPath)) {
    return undefined;
  }

  return {
    path: plansPath,
  };
}

function findOmegaIntent(rootDir: string, sessionId: string) {
  const intentPath = path.join(rootDir, '.ai', 'parallel-reports', `omega-intent-${sessionId}.json`);
  if (!fs.existsSync(intentPath)) {
    return undefined;
  }

  return {
    path: intentPath,
  };
}

function findStrategicPlan(rootDir: string, sessionId: string) {
  const strategicPlanPath = path.join(rootDir, '.ai', 'parallel-reports', `strategic-plan-${sessionId}.md`);
  if (!fs.existsSync(strategicPlanPath)) {
    return undefined;
  }

  return {
    path: strategicPlanPath,
  };
}

function findOmegaDeliverable(rootDir: string, sessionId: string) {
  const deliverablePath = path.join(rootDir, '.ai', 'parallel-reports', `omega-deliverable-${sessionId}.json`);
  if (!fs.existsSync(deliverablePath)) {
    return undefined;
  }

  return {
    path: deliverablePath,
    payload: JSON.parse(fs.readFileSync(deliverablePath, 'utf8')) as OmegaDeliverable,
  };
}

function findOmegaLearning(rootDir: string, sessionId: string) {
  const learningPath = path.join(rootDir, '.ai', 'parallel-reports', `omega-learning-${sessionId}.json`);
  if (!fs.existsSync(learningPath)) {
    return undefined;
  }

  return {
    path: learningPath,
    payload: JSON.parse(fs.readFileSync(learningPath, 'utf8')) as OmegaLearningArtifact,
  };
}

function parseArgs(argv: string[]): SummaryCliArgs {
  const issueNumber = parseNumberFlag(argv, '--issue');
  const rootDir = parseStringFlag(argv, '--root') || process.cwd();
  const runUrl = parseStringFlag(argv, '--run-url');
  const triggeredBy = parseStringFlag(argv, '--triggered-by') || 'unknown';
  const workflowStatus = (parseStringFlag(argv, '--status') || 'failure') as WorkflowExecutionStatus;
  const outMarkdownPath = parseStringFlag(argv, '--out-md');
  const outJsonPath = parseStringFlag(argv, '--out-json');

  if (!issueNumber) {
    throw new Error('--issue <number> is required');
  }
  if (!runUrl) {
    throw new Error('--run-url <url> is required');
  }
  if (!outMarkdownPath || !outJsonPath) {
    throw new Error('--out-md <path> and --out-json <path> are required');
  }

  return {
    issueNumber,
    rootDir,
    runUrl,
    triggeredBy,
    workflowStatus: workflowStatus === 'success' ? 'success' : 'failure',
    outMarkdownPath,
    outJsonPath,
  };
}

function parseStringFlag(argv: string[], flag: string) {
  const inline = argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }

  const index = argv.findIndex((value) => value === flag);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }

  return null;
}

function parseNumberFlag(argv: string[], flag: string) {
  const value = parseStringFlag(argv, flag);
  if (!value) {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
