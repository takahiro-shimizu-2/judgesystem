import { Octokit } from '@octokit/rest';

import { buildWeeklyReportMarkdown } from '../reporting/automation-reporting.js';
import { loadProjectKpiSummary } from '../reporting/project-kpi.js';
import {
  collectRepositoryMetrics,
  resolveGitHubToken,
  resolveRepositoryContext,
} from '../reporting/repository-metrics.js';

export async function runWeeklyReportCli(argv = process.argv) {
  const token = resolveGitHubToken();
  if (!token) {
    console.error('GITHUB_TOKEN or GH_TOKEN is required');
    process.exit(1);
  }

  try {
    const context = resolveRepositoryContext();
    const metrics = await collectRepositoryMetrics(token, context);
    const projectKpi = await loadProjectKpiSummary(context);
    const markdown = buildWeeklyReportMarkdown(metrics, projectKpi);

    console.log(markdown);

    if (argv.includes('--create-issue')) {
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
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
