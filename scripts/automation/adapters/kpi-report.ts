import { Octokit } from '@octokit/rest';

import { DiscussionsClient } from '../github/discussions.js';
import { buildKpiReportMarkdown } from '../reporting/automation-reporting.js';
import { loadProjectKpiSummary } from '../reporting/project-kpi.js';
import {
  collectRepositoryMetrics,
  resolveGitHubToken,
  resolveRepositoryContext,
} from '../reporting/repository-metrics.js';

export async function runKpiReportCli(argv = process.argv) {
  const token = resolveGitHubToken();
  if (!token) {
    console.error('GITHUB_TOKEN or GH_TOKEN is required');
    process.exit(1);
  }

  try {
    const context = resolveRepositoryContext();
    const metrics = await collectRepositoryMetrics(token, context);
    const projectKpi = await loadProjectKpiSummary(context);
    const title = `📊 Weekly KPI Report: ${metrics.weekLabel}`;
    const body = buildKpiReportMarkdown(metrics, projectKpi);
    const dryRun = argv.includes('--dry-run');

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
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
