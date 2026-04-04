import { ProjectsV2Client } from '../github/projects-v2.js';
import type { ProjectKpiSummary } from './automation-reporting.js';
import { resolveGitHubToken, type RepositoryContext } from './repository-metrics.js';

export async function loadProjectKpiSummary(
  context: RepositoryContext,
  env = process.env,
): Promise<ProjectKpiSummary | undefined> {
  const token = resolveGitHubToken({ preferProjectToken: true });
  if (!token) {
    return undefined;
  }

  const projectNumber = parseInt(env.PROJECT_NUMBER || env.GITHUB_PROJECT_NUMBER || '1', 10);
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
    return createRepositoryFallbackKpiSummary(error);
  }
}

export function createRepositoryFallbackKpiSummary(error: unknown): ProjectKpiSummary {
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
