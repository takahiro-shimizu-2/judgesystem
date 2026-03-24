#!/usr/bin/env tsx

import { ProjectsV2Client } from './lib/projects-v2.js';
import { resolveGitHubToken, resolveRepositoryContext } from './lib/repository-metrics.js';

async function main() {
  const token = resolveGitHubToken({ preferProjectToken: true });
  if (!token) {
    console.log('Skipping project status update: no GitHub token available.');
    return;
  }

  const context = resolveRepositoryContext();
  const projectNumber = parseInt(process.env.PROJECT_NUMBER || process.env.GITHUB_PROJECT_NUMBER || '1', 10);
  const eventName = process.env.GITHUB_EVENT_NAME || '';
  const contentType = process.env.CONTENT_TYPE || (eventName === 'pull_request' ? 'pull_request' : 'issue');
  const contentNumber = parseInt(
    process.env.CONTENT_NUMBER || process.env.ISSUE_NUMBER || process.env.PR_NUMBER || '',
    10,
  );
  const action = process.env.EVENT_ACTION || 'opened';

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
    const desiredStatus = mapStatus(contentType, action);

    await client.updateStatus(itemId, desiredStatus);
    console.log(`Updated project item for ${contentType} #${contentNumber} -> ${desiredStatus}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isConfigurationGap(message)) {
      console.log(`Skipping project status update: ${message}`);
      return;
    }

    console.error(message);
    process.exit(1);
  }
}

function mapStatus(contentType: string, action: string) {
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

function isConfigurationGap(message: string) {
  return [
    'missing required scopes',
    'ProjectV2',
    'Status field not found',
    'Status option',
    'Could not resolve to a ProjectV2',
    'Resource not accessible',
  ].some((fragment) => message.includes(fragment));
}

main();
