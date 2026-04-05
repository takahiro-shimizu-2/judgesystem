import * as path from 'path';

import { truncateText } from '../core/utils.js';
import type { ExecutionPlan, TaskManagerRunResult } from '../orchestration/task-manager.js';
import type { ExecutionReport, TaskExecutionRecord } from '../orchestration/task-executor.js';

interface LivingPlanMarkdownArgs {
  rootDir: string;
  plan: ExecutionPlan;
  report: ExecutionReport;
  artifactPaths: TaskManagerRunResult['artifactPaths'];
}

export function buildLivingPlanMarkdown(args: LivingPlanMarkdownArgs) {
  const totalEstimatedMinutes = args.plan.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const expectedCompletion = new Date(new Date(args.plan.createdAt).getTime() + totalEstimatedMinutes * 60 * 1000);
  const recordsByTaskId = new Map(args.report.tasks.map((record) => [record.taskId, record]));
  const worktreesByTaskId = new Map(args.plan.worktrees.map((assignment) => [assignment.taskId, assignment]));
  const issueBody = extractIssueSummary(args.plan.issue.body);
  const warnings = args.report.warnings.length > 0 ? args.report.warnings : args.plan.warnings;
  const sections = [
    renderHeader(args),
    renderOverview(args, issueBody, totalEstimatedMinutes),
    renderOmegaUnderstanding(args),
    renderStrategicPlan(args),
    renderDagVisualization(args),
    renderTaskBreakdown(args, recordsByTaskId, worktreesByTaskId),
    renderProgress(args, totalEstimatedMinutes),
    renderDecisions(args, warnings),
    renderRecommendations(warnings),
    renderTimeline(args, expectedCompletion),
    renderArtifacts(args),
  ];

  return sections.join('\n\n');
}

function renderHeader(args: LivingPlanMarkdownArgs) {
  const modeLabel = args.report.executionMode === 'planning' ? 'Planning' : 'Execution';
  const labels = args.plan.issue.labels && args.plan.issue.labels.length > 0 ? args.plan.issue.labels.join(', ') : 'None';
  const issueUrl = args.plan.issue.url ? `\n**Issue URL**: ${args.plan.issue.url}` : '';

  return `# Execution Plan: Issue #${args.plan.issue.number}

**Title**: ${args.plan.issue.title}
**Session**: \`${args.plan.sessionId}\`
**Mode**: ${modeLabel}
**Strategy**: \`${args.plan.strategy}\`
**Created**: ${formatTimestamp(args.plan.createdAt)}
**Updated**: ${formatTimestamp(new Date(args.report.endTime).toISOString())}
**Labels**: ${labels}${issueUrl}
`;
}

function renderOverview(args: LivingPlanMarkdownArgs, issueBody: string, totalEstimatedMinutes: number) {
  const worktreeModes = [...new Set(args.plan.worktrees.map((worktree) => worktree.mode))];

  return `## Overview

${issueBody}

### Execution Summary

- **Total Tasks**: ${args.plan.tasks.length}
- **Estimated Duration**: ${totalEstimatedMinutes} minutes
- **Concurrency**: ${args.plan.concurrency}
- **Worktree Mode**: ${worktreeModes.join(', ') || 'None'}
- **Execution Mode**: \`${args.report.executionMode}\`
- **Warnings**: ${args.report.warnings.length}
`;
}

function renderOmegaUnderstanding(args: LivingPlanMarkdownArgs) {
  const { intent } = args.plan.omega;

  return `## Omega Understanding

- **Normalized Goal**: ${intent.normalizedGoal}
- **Desired Outcome**: ${intent.desiredOutcome}
- **Current Run Mode**: \`${intent.currentRunMode}\`
- **Recommended Next Mode**: \`${intent.recommendedNextMode}\`
- **Preferred Capabilities**: ${intent.preferredCapabilities.map((capability) => `\`${capability}\``).join(', ')}

### Goals

${renderBulletList(intent.goals)}

### Constraints

${renderBulletList(intent.constraints)}

### Risks

${renderBulletList(intent.risks)}

### Source Signals

${renderBulletList(intent.sourceSignals)}`;
}

function renderStrategicPlan(args: LivingPlanMarkdownArgs) {
  const { strategicPlan } = args.plan.omega;

  return `## Strategic Plan

${strategicPlan.summary}

- **Deliverable Focus**: ${strategicPlan.deliverableFocus}

### Phases

${strategicPlan.phases
  .map(
    (phase) => `#### ${phase.label}

- **Owner**: \`${phase.owner}\`
- **Objective**: ${phase.objective}
- **Capabilities**: ${phase.capabilities.map((capability) => `\`${capability}\``).join(', ')}
- **Success Criteria**:
${phase.successCriteria.map((criterion) => `  - ${criterion}`).join('\n')}`,
  )
  .join('\n\n')}

### Assumptions

${renderBulletList(strategicPlan.assumptions)}

### Success Criteria

${renderBulletList(strategicPlan.successCriteria)}

### Risk Mitigations

${renderBulletList(strategicPlan.riskMitigations)}`;
}

function renderDagVisualization(args: LivingPlanMarkdownArgs) {
  const levelSummary = args.plan.dag.levels
    .map((level, index) => {
      const suffix = index === 0 ? 'can run in parallel' : `depends on Level ${index}`;
      return `**Level ${index + 1}** (${level.length} tasks, ${suffix}):\n${level.map((taskId) => `- \`${taskId}\``).join('\n')}`;
    })
    .join('\n\n');

  return `## DAG Visualization

\`\`\`mermaid
${buildMermaidGraph(args)}
\`\`\`

### Execution Levels

${levelSummary || '_No DAG levels generated._'}`;
}

function renderTaskBreakdown(
  args: LivingPlanMarkdownArgs,
  recordsByTaskId: Map<string, TaskExecutionRecord>,
  worktreesByTaskId: Map<string, ExecutionPlan['worktrees'][number]>,
) {
  const body = args.plan.dag.levels
    .map((level, index) => {
      const tasks = level
        .map((taskId) => args.plan.tasks.find((task) => task.id === taskId))
        .filter((task): task is ExecutionPlan['tasks'][number] => Boolean(task))
        .map((task) => renderTask(task, recordsByTaskId.get(task.id), worktreesByTaskId.get(task.id), args.rootDir))
        .join('\n\n');

      return `### Level ${index + 1}\n\n${tasks}`;
    })
    .join('\n\n');

  return `## Task Breakdown

${body || '_No task breakdown available._'}`;
}

function renderTask(
  task: ExecutionPlan['tasks'][number],
  record: TaskExecutionRecord | undefined,
  worktree: ExecutionPlan['worktrees'][number] | undefined,
  rootDir: string,
) {
  const status = record?.status ?? 'planned';
  const checkbox = getCheckbox(status);
  const dependencies = task.dependencies.length > 0 ? task.dependencies.map((dependency) => `\`${dependency}\``).join(', ') : 'None';
  const worktreePath = worktree ? `\`${toRelativePath(rootDir, worktree.worktreePath)}\`` : 'None';
  const branchName = worktree ? `\`${worktree.branchName}\`` : 'None';
  const notes = record?.notes ? `\n  - Notes: ${truncateText(record.notes, 180)}` : '';
  const error = record?.error ? `\n  - Error: ${truncateText(record.error, 180)}` : '';

  return `- ${checkbox} \`${task.id}\`: ${task.title}
  - Agent: \`${task.agent}\`
  - Type / Priority: \`${task.type}\` / \`${task.priority}\`
  - Estimate: ${task.estimatedMinutes} min
  - Status: \`${status}\`
  - Dependencies: ${dependencies}
  - Branch: ${branchName}
  - Worktree: ${worktreePath}${notes}${error}`;
}

function renderProgress(args: LivingPlanMarkdownArgs, totalEstimatedMinutes: number) {
  const { completed, failed, skipped, planned, total } = args.report.summary;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return `## Progress

\`\`\`
${buildProgressBar(percent)} ${percent}%
\`\`\`

| Metric | Count | Percentage |
| --- | ---: | ---: |
| Completed | ${completed} | ${toPercent(completed, total)} |
| Planned | ${planned} | ${toPercent(planned, total)} |
| Skipped | ${skipped} | ${toPercent(skipped, total)} |
| Failed | ${failed} | ${toPercent(failed, total)} |
| Total | ${total} | 100% |

### Runtime Notes

- **Reported Success Rate**: ${args.report.summary.successRate}%
- **Total Estimated Work**: ${totalEstimatedMinutes} min
- **Actual Runtime**: ${formatDuration(args.report.totalDurationMs)}
`;
}

function renderDecisions(args: LivingPlanMarkdownArgs, warnings: string[]) {
  const decisionEntries = [
    {
      timestamp: args.plan.createdAt,
      decision: 'Run Omega understanding before task decomposition and persist the intent/strategic-plan artifacts',
      reason: 'Issue-to-task execution should have a stable planning layer that later agents can inspect without re-reading the raw issue body alone.',
      implementation: `Intent and Strategic Plan are written alongside the execution artifacts for session \`${args.plan.sessionId}\`.`,
      alternatives: 'Skip Omega understanding and go directly from the issue body to task decomposition.',
    },
    {
      timestamp: args.plan.createdAt,
      decision: `Use ${args.plan.strategy} decomposition with DAG-based orchestration`,
      reason: `Issue #${args.plan.issue.number} needs an execution order that can be handed off to repo-local runtime handlers safely.`,
      implementation: `Concurrency=${args.plan.concurrency}, executionMode=${args.report.executionMode}, worktreeAssignments=${args.plan.worktrees.length}`,
      alternatives:
        args.plan.strategy === 'heuristic'
          ? 'An explicit LLM invocation hook can replace heuristic decomposition when the runtime is configured for it.'
          : undefined,
    },
    {
      timestamp: new Date(args.report.endTime).toISOString(),
      decision:
        args.report.executionMode === 'planning'
          ? 'Preserve planning-first mode until write-capable autonomy gates are explicitly opened'
          : 'Persist execution results as replayable runtime artifacts',
      reason:
        args.report.executionMode === 'planning'
          ? 'Planning mode keeps the session observable without making code, PR, or deploy side effects.'
          : 'Execution mode should leave enough context for review, PR, and deploy follow-up.',
      implementation: `Artifacts are written to \`${toRelativePath(args.rootDir, path.dirname(args.artifactPaths.plansPath))}\`.`,
      alternatives: undefined,
    },
  ];

  if (warnings.length > 0) {
    decisionEntries.push({
      timestamp: new Date(args.report.endTime).toISOString(),
      decision: 'Carry workflow and registry warnings forward as operator-visible context',
      reason: 'Missing Claude definitions, decomposition caveats, and runtime warnings should remain visible to later agents and reviewers.',
      implementation: `${warnings.length} warning(s) were copied into the Recommendations section below.`,
      alternatives: undefined,
    });
  }

  return `## Decisions

${decisionEntries
  .map(
    (entry) => `### ${formatTimestamp(entry.timestamp)}

- **Decision**: ${entry.decision}
- **Reason**: ${entry.reason}
${entry.alternatives ? `- **Alternatives**: ${entry.alternatives}\n` : ''}- **Implementation**: ${entry.implementation}`,
  )
  .join('\n\n')}`;
}

function renderRecommendations(warnings: string[]) {
  return `## Recommendations

${
  warnings.length > 0
    ? warnings.map((warning) => `- ${warning}`).join('\n')
    : '- No additional workflow-level warnings were recorded for this session.'
}`;
}

function renderTimeline(args: LivingPlanMarkdownArgs, expectedCompletion: Date) {
  return `## Timeline

- **Started**: ${formatTimestamp(new Date(args.report.startTime).toISOString())}
- **Last Update**: ${formatTimestamp(new Date(args.report.endTime).toISOString())}
- **Expected Completion**: ${formatTimestamp(expectedCompletion.toISOString())}
- **Actual Runtime**: ${formatDuration(args.report.totalDurationMs)}`;
}

function renderArtifacts(args: LivingPlanMarkdownArgs) {
  return `## Artifacts

- **Living Plan**: \`${toRelativePath(args.rootDir, args.artifactPaths.plansPath)}\`
- **Omega Intent JSON**: \`${toRelativePath(args.rootDir, args.artifactPaths.intentPath)}\`
- **Strategic Plan Markdown**: \`${toRelativePath(args.rootDir, args.artifactPaths.strategicPlanPath)}\`
- **Execution Plan JSON**: \`${toRelativePath(args.rootDir, args.artifactPaths.planPath)}\`
- **Execution Report JSON**: \`${toRelativePath(args.rootDir, args.artifactPaths.reportPath)}\`
- **Coordinator Log**: \`${toRelativePath(args.rootDir, args.artifactPaths.logPath)}\``;
}

function renderBulletList(values: string[]) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- None';
}

function buildMermaidGraph(args: LivingPlanMarkdownArgs) {
  const lines = ['graph TD'];
  const recordByTaskId = new Map(args.report.tasks.map((record) => [record.taskId, record]));

  for (const task of args.plan.tasks) {
    const record = recordByTaskId.get(task.id);
    const label = escapeMermaidLabel(`${task.id}<br/>${truncateText(task.title, 34)}`);
    lines.push(`    ${normalizeMermaidId(task.id)}["${label}"]:::${getMermaidStatusClass(record?.status ?? 'planned')}`);
  }

  for (const edge of args.plan.dag.edges) {
    lines.push(`    ${normalizeMermaidId(edge.from)} --> ${normalizeMermaidId(edge.to)}`);
  }

  lines.push('');
  lines.push('    classDef planned fill:#6b7280,stroke:#4b5563,color:#fff');
  lines.push('    classDef completed fill:#10b981,stroke:#059669,color:#fff');
  lines.push('    classDef failed fill:#ef4444,stroke:#dc2626,color:#fff');
  lines.push('    classDef skipped fill:#f59e0b,stroke:#d97706,color:#111827');

  return lines.join('\n');
}

function buildProgressBar(percent: number) {
  const totalBars = 20;
  const filled = Math.max(0, Math.min(totalBars, Math.round((percent / 100) * totalBars)));
  return `${'#'.repeat(filled)}${'-'.repeat(totalBars - filled)}`;
}

function extractIssueSummary(body: string | null | undefined) {
  if (!body || body.trim().length === 0) {
    return '_No issue body provided._';
  }

  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  return lines.join('\n');
}

function formatTimestamp(value: string) {
  return new Date(value).toISOString();
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function toPercent(value: number, total: number) {
  if (total === 0) {
    return '0%';
  }

  return `${Math.round((value / total) * 100)}%`;
}

function toRelativePath(rootDir: string, absolutePath: string) {
  const relative = path.relative(rootDir, absolutePath);
  return relative.length > 0 ? relative : path.basename(absolutePath);
}

function getCheckbox(status: TaskExecutionRecord['status']) {
  switch (status) {
    case 'completed':
      return '[x]';
    case 'failed':
      return '[!]';
    case 'skipped':
      return '[-]';
    default:
      return '[ ]';
  }
}

function getMermaidStatusClass(status: TaskExecutionRecord['status']) {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    default:
      return 'planned';
  }
}

function normalizeMermaidId(taskId: string) {
  return taskId.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeMermaidLabel(value: string) {
  return value.replace(/"/g, "'").replace(/\[/g, '(').replace(/\]/g, ')');
}
