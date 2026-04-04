import { ProjectsV2Client } from '../github/projects-v2.js';
import { resolveGitHubToken, resolveRepositoryContext } from '../reporting/repository-metrics.js';

export type ProjectContentType = 'issue' | 'pull_request';

export function mapProjectStatus(contentType: ProjectContentType, action: string) {
  if (action === 'closed') {
    return 'Done';
  }

  if (contentType === 'pull_request') {
    return 'In Review';
  }

  if (action === 'reopened') {
    return 'In Progress';
  }

  return 'Todo';
}

export function isProjectStatusConfigurationGap(message: string) {
  return [
    'missing required scopes',
    'ProjectV2',
    'Status field not found',
    'Status option',
    'Could not resolve to a ProjectV2',
    'Resource not accessible',
  ].some((fragment) => message.includes(fragment));
}

export async function runUpdateProjectStatus(env = process.env) {
  const token = resolveGitHubToken({ preferProjectToken: true });
  if (!token) {
    console.log('Skipping project status update: no GitHub token available.');
    return;
  }

  const context = resolveRepositoryContext(
    env.GITHUB_REPOSITORY || env.REPOSITORY || 'takahiro-shimizu-2/judgesystem',
  );
  const projectNumber = parseInt(env.PROJECT_NUMBER || env.GITHUB_PROJECT_NUMBER || '1', 10);
  const eventName = env.GITHUB_EVENT_NAME || '';
  const contentType =
    (env.CONTENT_TYPE as ProjectContentType | undefined) ||
    (eventName === 'pull_request' ? 'pull_request' : 'issue');
  const contentNumber = parseInt(env.CONTENT_NUMBER || env.ISSUE_NUMBER || env.PR_NUMBER || '', 10);
  const action = env.EVENT_ACTION || 'opened';

  if (!Number.isFinite(contentNumber)) {
    console.log('Skipping project status update: no issue or PR number was provided.');
    return;
  }

  const client = new ProjectsV2Client(token, {
    owner: context.owner,
    repo: context.repo,
    projectNumber,
  });

  try {
    await client.initialize();
    const contentId =
      contentType === 'pull_request'
        ? await client.getPullRequestNodeId(contentNumber)
        : await client.getIssueNodeId(contentNumber);
    const itemId = await client.ensureProjectItem(contentId);
    const desiredStatus = mapProjectStatus(contentType, action);

    await client.updateStatus(itemId, desiredStatus);
    console.log(`Updated project item for ${contentType} #${contentNumber} -> ${desiredStatus}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isProjectStatusConfigurationGap(message)) {
      console.log(`Skipping project status update: ${message}`);
      return;
    }

    throw error;
  }
}

export async function runUpdateProjectStatusCli(env = process.env) {
  try {
    await runUpdateProjectStatus(env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
