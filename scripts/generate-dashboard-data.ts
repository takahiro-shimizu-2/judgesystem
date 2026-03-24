#!/usr/bin/env tsx
/**
 * Generate Dashboard Data
 *
 * Mirrors the Miyabi dashboard reporting script while keeping this repository
 * self-contained for GitHub Actions.
 */

import * as fs from 'fs';
import * as path from 'path';

import { ProjectsV2Client } from './lib/projects-v2.js';
import {
  collectRepositoryMetrics,
  resolveGitHubToken,
  resolveRepositoryContext,
} from './lib/repository-metrics.js';

interface DashboardData {
  generated: string;
  summary: {
    totalIssues: number;
    completedIssues: number;
    completionRate: number;
    avgDuration: number;
    totalCost: number;
    avgQualityScore: number;
  };
  trends: Array<{
    date: string;
    completed: number;
    inProgress: number;
    cost: number;
  }>;
  agents: Array<{
    name: string;
    tasksCompleted: number;
    avgDuration: number;
    avgCost: number;
    avgQuality: number;
  }>;
  meta: {
    source: 'project-v2' | 'fallback';
    owner: string;
    repo: string;
    projectNumber: number;
    warning?: string;
  };
}

async function main() {
  const token = resolveGitHubToken();
  const projectToken = resolveGitHubToken({ preferProjectToken: true });
  const { owner, repo } = resolveRepositoryContext();
  const projectNumber = parseInt(process.env.PROJECT_NUMBER || process.env.GITHUB_PROJECT_NUMBER || '1', 10);

  console.log('Generating dashboard data...');
  console.log(`  Owner: ${owner}`);
  console.log(`  Repo: ${repo}`);
  console.log(`  Project: #${projectNumber}`);

  let source: DashboardData['meta']['source'] = 'fallback';
  let warning: string | undefined;
  let kpi = {
    totalIssues: 0,
    completedIssues: 0,
    avgDuration: 0,
    totalCost: 0,
    avgQualityScore: 0,
  };
  let trends = generateFallbackTrends();
  let agents: DashboardData['agents'] = [];

  if (token) {
    const repoMetrics = await collectRepositoryMetrics(token, { owner, repo });
    trends = repoMetrics.trends.map((entry) => ({
      date: entry.date,
      completed: entry.closed,
      inProgress: entry.opened,
      cost: 0,
    }));
    agents = buildAgentData(repoMetrics.skillBus.recentRuns);
    kpi.totalIssues = repoMetrics.issues.total;
    kpi.completedIssues = repoMetrics.issues.closed;
  }

  if (!token) {
    warning = 'GITHUB_TOKEN or GH_PROJECT_TOKEN is not configured. Generated fallback dashboard data.';
    console.warn(`Warning: ${warning}`);
  } else if (projectToken) {
    try {
      const client = new ProjectsV2Client(projectToken, {
        owner,
        repo,
        projectNumber,
      });

      await client.initialize();
      kpi = await client.generateKPIReport();
      kpi.totalIssues = kpi.totalIssues || 0;
      kpi.completedIssues = kpi.completedIssues || 0;
      source = 'project-v2';
    } catch (error) {
      warning = formatDashboardWarning(error);
      console.warn(`Warning: ${warning}`);
    }
  }

  const completionRate = kpi.totalIssues > 0 ? (kpi.completedIssues / kpi.totalIssues) * 100 : 0;

  const dashboardData: DashboardData = {
    generated: new Date().toISOString(),
    summary: {
      totalIssues: kpi.totalIssues,
      completedIssues: kpi.completedIssues,
      completionRate: Math.round(completionRate * 10) / 10,
      avgDuration: Math.round(kpi.avgDuration * 10) / 10,
      totalCost: Math.round(kpi.totalCost * 100) / 100,
      avgQualityScore: Math.round(kpi.avgQualityScore * 10) / 10,
    },
    trends,
    agents,
    meta: {
      source: source === 'project-v2' ? 'project-v2' : 'fallback',
      owner,
      repo,
      projectNumber,
      warning,
    },
  };

  const docsDir = path.join(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const outputPath = path.join(docsDir, 'dashboard-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(dashboardData, null, 2));

  console.log(`Dashboard data generated: ${outputPath}`);
  console.log('Summary:');
  console.log(`  Total Issues: ${dashboardData.summary.totalIssues}`);
  console.log(
    `  Completed: ${dashboardData.summary.completedIssues} (${dashboardData.summary.completionRate}%)`,
  );
  console.log(`  Avg Duration: ${dashboardData.summary.avgDuration} min`);
  console.log(`  Total Cost: $${dashboardData.summary.totalCost}`);
  console.log(`  Avg Quality: ${dashboardData.summary.avgQualityScore}/100`);
  console.log(`  Source: ${dashboardData.meta.source}`);
  if (dashboardData.meta.warning) {
    console.log(`  Warning: ${dashboardData.meta.warning}`);
  }
}

function generateFallbackTrends() {
  const trends = [];
  const today = new Date();

  for (let index = 6; index >= 0; index--) {
    const date = new Date(today);
    date.setDate(date.getDate() - index);

    trends.push({
      date: date.toISOString().split('T')[0],
      completed: 0,
      inProgress: 0,
      cost: 0,
    });
  }

  return trends;
}

function buildAgentData(
  runs: Array<{
    skill: string;
    result: string;
    score: number;
  }>,
) {
  const groups = new Map<string, { completed: number; scoreTotal: number }>();

  for (const run of runs) {
    const current = groups.get(run.skill) || { completed: 0, scoreTotal: 0 };
    current.completed += run.result === 'success' ? 1 : 0;
    current.scoreTotal += run.score;
    groups.set(run.skill, current);
  }

  return [...groups.entries()].map(([name, value]) => ({
    name,
    tasksCompleted: value.completed,
    avgDuration: 0,
    avgCost: 0,
    avgQuality: value.completed > 0 ? Math.round((value.scoreTotal / value.completed) * 1000) / 10 : 0,
  }));
}

function formatDashboardWarning(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('not been granted the required scopes')) {
    return 'GitHub token is missing Projects V2 scopes. Set GH_PROJECT_TOKEN with read:project access.';
  }

  if (message.includes('Could not resolve to a ProjectV2')) {
    return 'GitHub Project V2 was not found. Check PROJECT_NUMBER for this repository.';
  }

  if (message.includes('Bad credentials')) {
    return 'GitHub token could not authenticate. Generated fallback dashboard data.';
  }

  return `Failed to read Projects V2 data. Generated fallback dashboard data instead. Details: ${message}`;
}

main().catch((error) => {
  console.error('Error generating dashboard data:', error);
  process.exit(1);
});
