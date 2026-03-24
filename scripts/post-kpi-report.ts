#!/usr/bin/env tsx

import { Octokit } from '@octokit/rest';

import { buildKpiReportMarkdown, type ProjectKpiSummary } from './lib/automation-reporting.js';
import { DiscussionsClient } from './lib/discussions.js';
import { ProjectsV2Client } from './lib/projects-v2.js';
import { collectRepositoryMetrics, resolveGitHubToken, resolveRepositoryContext } from './lib/repository-metrics.js';

async function main() {
  const token = resolveGitHubToken();
  if (!token) {
    console.error('GITHUB_TOKEN or GH_TOKEN is required');
    process.exit(1);
  }

  const context = resolveRepositoryContext();
  const metrics = await collectRepositoryMetrics(token, context);
  const projectKpi = await maybeLoadProjectKpi(context);
  const title = `📊 Weekly KPI Report: ${metrics.weekLabel}`;
  const body = buildKpiReportMarkdown(metrics, projectKpi);
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log(title);
    console.log(body);
    return;
  }

  try {
    const discussionsClient = new DiscussionsClient(token, context);
    await discussionsClient.initialize();
    const category = discussionsClient.getPreferredCategory();
    const discussion = await discussionsClient.createDiscussion({
      categoryId: category.id,
      title,
      body,
    });

    console.log(`Posted KPI report to Discussions: ${discussion.url}`);
    return;
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : String(error);
    console.log(`Falling back to GitHub Issue: ${fallbackReason}`);
  }

  const octokit = new Octokit({ auth: token });
  const { data: issue } = await octokit.rest.issues.create({
    owner: context.owner,
    repo: context.repo,
    title,
    body,
    labels: ['📊 report:kpi', '🤖 system:automation'],
  });

  console.log(`Created KPI report issue #${issue.number}: ${issue.html_url}`);
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
