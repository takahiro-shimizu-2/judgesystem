import type { RepositoryMetrics } from './repository-metrics.js';

export interface ProjectKpiSummary {
  source: 'project-v2' | 'repository';
  warning?: string;
  totalIssues: number;
  completedIssues: number;
  avgDuration: number;
  totalCost: number;
  avgQualityScore: number;
}

export function buildWeeklyReportMarkdown(
  metrics: RepositoryMetrics,
  projectKpi?: ProjectKpiSummary,
) {
  const completionRate = formatPercent(metrics.issues.completionRate);
  const workflowSuccessRate = metrics.workflows.total
    ? formatPercent(metrics.workflows.success / metrics.workflows.total)
    : 'n/a';
  const projectSource = projectKpi?.source === 'project-v2' ? 'Projects V2' : 'repository fallback';

  return `## Weekly Automation Report

**Period**: ${metrics.weekLabel}
**Repository**: ${metrics.repository.owner}/${metrics.repository.repo}

### Overview

| Metric | Value |
| --- | --- |
| Total Issues | ${metrics.issues.total} |
| Open Issues | ${metrics.issues.open} |
| Closed Issues | ${metrics.issues.closed} |
| Completion Rate | ${completionRate} |
| Opened This Week | ${metrics.issues.openedThisWeek} |
| Closed This Week | ${metrics.issues.closedThisWeek} |
| Workflow Success Rate | ${workflowSuccessRate} |
| Skill Bus Healthy Skills | ${metrics.skillBus.healthySkills}/${metrics.skillBus.totalSkills} |

### Project / KPI

| Metric | Value |
| --- | --- |
| Data Source | ${projectSource} |
| Avg Duration | ${projectKpi ? formatMinutes(projectKpi.avgDuration) : 'n/a'} |
| Total Cost | ${projectKpi ? formatUsd(projectKpi.totalCost) : 'n/a'} |
| Avg Quality Score | ${projectKpi ? formatScore(projectKpi.avgQualityScore) : 'n/a'} |

${projectKpi?.warning ? `> Warning: ${projectKpi.warning}\n` : ''}

### Recent Closed Issues

${renderRecentClosedIssues(metrics)}

### Issue Trend (Last 7 Days)

${renderTrendTable(metrics)}

### Skill Bus

${renderSkillBus(metrics)}

### Top Labels

${renderTopLabels(metrics)}

### Workflow Health

${renderWorkflowSummary(metrics)}

Generated at ${metrics.generatedAt}`;
}

export function buildKpiReportMarkdown(
  metrics: RepositoryMetrics,
  projectKpi?: ProjectKpiSummary,
) {
  const projectSource = projectKpi?.source === 'project-v2' ? 'Projects V2' : 'repository fallback';

  return `## Weekly KPI Snapshot

**Period**: ${metrics.weekLabel}
**Repository**: ${metrics.repository.owner}/${metrics.repository.repo}

| KPI | Value |
| --- | --- |
| Total Issues | ${metrics.issues.total} |
| Closed Issues | ${metrics.issues.closed} |
| Completion Rate | ${formatPercent(metrics.issues.completionRate)} |
| Opened This Week | ${metrics.issues.openedThisWeek} |
| Closed This Week | ${metrics.issues.closedThisWeek} |
| Workflow Success | ${metrics.workflows.success} successful / ${metrics.workflows.failure} failed |
| Skill Bus Average Score | ${formatScore(metrics.skillBus.averageScore * 100)} |
| KPI Source | ${projectSource} |
| Avg Duration | ${projectKpi ? formatMinutes(projectKpi.avgDuration) : 'n/a'} |
| Total Cost | ${projectKpi ? formatUsd(projectKpi.totalCost) : 'n/a'} |
| Avg Quality Score | ${projectKpi ? formatScore(projectKpi.avgQualityScore) : 'n/a'} |

${projectKpi?.warning ? `> Warning: ${projectKpi.warning}\n` : ''}

### Recent Skill Runs

${renderSkillRuns(metrics)}

### Recent Closed Issues

${renderRecentClosedIssues(metrics)}

Generated at ${metrics.generatedAt}`;
}

export function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

export function formatScore(value: number) {
  return `${value.toFixed(1)}/100`;
}

export function formatMinutes(value: number) {
  return `${value.toFixed(1)} min`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function renderRecentClosedIssues(metrics: RepositoryMetrics) {
  if (metrics.issues.recentClosed.length === 0) {
    return '_No closed issues yet_';
  }

  return metrics.issues.recentClosed
    .map((issue) => `- [#${issue.number}](${issue.url}) ${issue.title}`)
    .join('\n');
}

function renderTrendTable(metrics: RepositoryMetrics) {
  const rows = metrics.trends.map(
    (entry) => `| ${entry.date} | ${entry.opened} | ${entry.closed} |`,
  );

  return ['| Date | Opened | Closed |', '| --- | --- | --- |', ...rows].join('\n');
}

function renderSkillBus(metrics: RepositoryMetrics) {
  return `- Healthy skills: ${metrics.skillBus.healthySkills}/${metrics.skillBus.totalSkills}
- Flagged skills: ${metrics.skillBus.flaggedSkills}
- Last updated: ${metrics.skillBus.lastUpdated || 'n/a'}`;
}

function renderSkillRuns(metrics: RepositoryMetrics) {
  if (metrics.skillBus.recentRuns.length === 0) {
    return '_No skill-bus runs recorded_';
  }

  return metrics.skillBus.recentRuns
    .map(
      (run) =>
        `- ${run.ts}: \`${run.skill}\` ran "${run.task}" -> ${run.result} (score: ${run.score})`,
    )
    .join('\n');
}

function renderTopLabels(metrics: RepositoryMetrics) {
  if (metrics.issues.topLabels.length === 0) {
    return '_No labels applied yet_';
  }

  return metrics.issues.topLabels.map((label) => `- ${label.name}: ${label.count}`).join('\n');
}

function renderWorkflowSummary(metrics: RepositoryMetrics) {
  return `- Total runs inspected: ${metrics.workflows.total}
- Success: ${metrics.workflows.success}
- Failure: ${metrics.workflows.failure}
- Cancelled: ${metrics.workflows.cancelled}`;
}
