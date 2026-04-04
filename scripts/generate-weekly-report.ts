#!/usr/bin/env tsx

import { Octokit } from '@octokit/rest';

import { ProjectsV2Client } from './automation/github/projects-v2.js';
import {
  buildWeeklyReportMarkdown,
  type ProjectKpiSummary,
} from './automation/reporting/automation-reporting.js';
import {
  collectRepositoryMetrics,
  resolveGitHubToken,
  resolveRepositoryContext,
} from './automation/reporting/repository-metrics.js';

async function main() {
  const token = resolveGitHubToken();
  if (!token) {
    console.error('GITHUB_TOKEN or GH_TOKEN is required');
    process.exit(1);
  }

  const context = resolveRepositoryContext();
  const metrics = await collectRepositoryMetrics(token, context);
  const projectKpi = await maybeLoadProjectKpi(context);
  const markdown = buildWeeklyReportMarkdown(metrics, projectKpi);

  console.log(markdown);

  if (process.argv.includes('--create-issue')) {
    const octokit = new Octokit({ auth: token });
    const { data: issue } = await octokit.rest.issues.create({
      owner: context.owner,
      repo: context.repo,
      title: `📊 Weekly Automation Report: ${metrics.weekLabel}`,
      body: markdown,
      labels: ['📊 report:weekly', '🤖 system:automation'],
    });

    console.log(`Created weekly report issue #${issue.number}: ${issue.html_url}`);
  }
}

async function maybeLoadProjectKpi(context: ReturnType<typeof resolveRepositoryContext>): Promise<ProjectKpiSummary | undefined> {
  const token = resolveGitHubToken({ preferProjectToken: true });
  if (!token) {
    return undefined;
  }

  const projectNumber = parseInt(process.env.PROJECT_NUMBER || process.env.GITHUB_PROJECT_NUMBER || '1', 10);
  const client = new ProjectsV2Client(token, {
    owner: context.owner,
    repo: context.repo,
    projectNumber,
  });

  try {
    await client.initialize();
    const report = await client.generateKPIReport();
    return {
      source: 'project-v2',
      ...report,
    };
  } catch (error) {
    return {
      source: 'repository',
      warning: error instanceof Error ? error.message : String(error),
      totalIssues: 0,
      completedIssues: 0,
      avgDuration: 0,
      totalCost: 0,
      avgQualityScore: 0,
    };
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
