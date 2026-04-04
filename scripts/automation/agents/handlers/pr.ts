import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { ensureDirectory, slugify } from '../../core/utils.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import type { AgentHandlerBinding } from '../handler-contract.js';
import { Octokit } from '@octokit/rest';

interface PrAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

export function createPrAgentHandler(options: PrAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'pr-draft-preparer',
    mode: 'connected',
    description: 'Prepares a local draft PR markdown artifact and can open or update a draft PR when explicitly enabled.',
    execute: async ({ task, definition, context }) => {
      const rootDir = context.rootDir || options.rootDir;
      const branch = runGit(['branch', '--show-current'], rootDir) || 'detached-head';
      const reportsDir = ensureDirectory(path.join(rootDir, '.ai', 'parallel-reports'));
      const fileName = `pr-draft-${context.sessionId}-${slugify(task.id)}.md`;
      const artifactPath = path.join(reportsDir, fileName);
      const title = `${prefixForTaskType(task.type)}: ${task.title}`;
      const repository = resolveRepositoryContext(
        context.env.GITHUB_REPOSITORY || context.env.REPOSITORY || process.env.GITHUB_REPOSITORY,
      );
      const baseBranch = resolveBaseBranch(rootDir, context.env);
      const body = buildDraftPrBody({
        title,
        branch,
        baseBranch,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
        definitionPath: definition.sourcePath,
      });

      fs.writeFileSync(artifactPath, body, 'utf8');

      const remotePrResult = await maybeCreateRemotePr({
        rootDir,
        env: context.env,
        repository,
        baseBranch,
        headBranch: branch,
        title,
        body,
      });

      return {
        status: 'completed',
        notes: [
          `${definition.name} prepared a draft PR artifact at ${path.relative(rootDir, artifactPath)}.`,
          remotePrResult.note,
        ].join(' '),
        output: {
          artifactPath,
          branch,
          baseBranch,
          title,
          prNumber: remotePrResult.prNumber,
          prUrl: remotePrResult.prUrl,
        },
      };
    },
  };
}

function buildDraftPrBody(params: {
  title: string;
  branch: string;
  baseBranch: string;
  issueNumber: number;
  taskId: string;
  taskTitle: string;
  definitionPath: string;
}) {
  return `# Draft Pull Request Plan

## Title
${params.title}

## Branch
${params.branch}

## Base Branch
${params.baseBranch}

## Linked Issue
Closes #${params.issueNumber}

## Task
- ${params.taskId}: ${params.taskTitle}

## Runtime Notes
- Generated from ${params.definitionPath}
- This artifact is always generated first so the PR plan remains reviewable even when GitHub write access is gated.
`;
}

async function maybeCreateRemotePr(params: {
  rootDir: string;
  env: NodeJS.ProcessEnv;
  repository: { owner: string; repo: string };
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
}) {
  if (params.env.AUTOMATION_ENABLE_PR_WRITE !== 'true') {
    return {
      note: 'Remote PR creation is disabled. Set AUTOMATION_ENABLE_PR_WRITE=true to open or update a draft PR automatically.',
      prNumber: undefined,
      prUrl: undefined,
    };
  }

  const token = params.env.GITHUB_TOKEN || params.env.GH_PROJECT_TOKEN || params.env.GH_TOKEN;
  if (!token) {
    return {
      note: 'Remote PR creation was requested, but no GitHub token is available.',
      prNumber: undefined,
      prUrl: undefined,
    };
  }

  if (!params.headBranch || params.headBranch === 'detached-head') {
    return {
      note: 'Remote PR creation was skipped because the current checkout is detached and no usable head branch is available.',
      prNumber: undefined,
      prUrl: undefined,
    };
  }

  if (params.headBranch === params.baseBranch) {
    return {
      note: `Remote PR creation was skipped because head branch ${params.headBranch} matches base branch ${params.baseBranch}.`,
      prNumber: undefined,
      prUrl: undefined,
    };
  }

  if (!branchExistsOnOrigin(params.headBranch, params.rootDir)) {
    return {
      note: `Remote PR creation was skipped because origin/${params.headBranch} does not exist yet. Push the branch first or let another handler publish it.`,
      prNumber: undefined,
      prUrl: undefined,
    };
  }

  const octokit = new Octokit({ auth: token });
  const existing = await octokit.rest.pulls.list({
    owner: params.repository.owner,
    repo: params.repository.repo,
    state: 'open',
    head: `${params.repository.owner}:${params.headBranch}`,
    base: params.baseBranch,
    per_page: 10,
  });

  if (existing.data.length > 0) {
    const current = existing.data[0];
    const updated = await octokit.rest.pulls.update({
      owner: params.repository.owner,
      repo: params.repository.repo,
      pull_number: current.number,
      title: params.title,
      body: params.body,
      state: 'open',
      base: params.baseBranch,
    });

    return {
      note: `Remote draft PR already existed and was updated: #${updated.data.number} ${updated.data.html_url}`,
      prNumber: updated.data.number,
      prUrl: updated.data.html_url,
    };
  }

  const created = await octokit.rest.pulls.create({
    owner: params.repository.owner,
    repo: params.repository.repo,
    title: params.title,
    body: params.body,
    head: params.headBranch,
    base: params.baseBranch,
    draft: true,
    maintainer_can_modify: true,
  });

  return {
    note: `Remote draft PR was created: #${created.data.number} ${created.data.html_url}`,
    prNumber: created.data.number,
    prUrl: created.data.html_url,
  };
}

function prefixForTaskType(taskType: string) {
  if (taskType === 'deployment') return 'ci';
  if (taskType === 'docs') return 'docs';
  if (taskType === 'bug') return 'fix';
  if (taskType === 'refactor') return 'refactor';
  if (taskType === 'test') return 'test';
  return 'feat';
}

function runGit(args: string[], cwd: string) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function resolveBaseBranch(rootDir: string, env: NodeJS.ProcessEnv) {
  const configured = env.AUTOMATION_PR_BASE || env.GITHUB_BASE_REF;
  if (configured) {
    return configured;
  }

  const remoteHead = runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], rootDir);
  if (remoteHead?.startsWith('origin/')) {
    return remoteHead.slice('origin/'.length);
  }

  return 'develop';
}

function branchExistsOnOrigin(branch: string, cwd: string) {
  const result = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], {
    cwd,
    encoding: 'utf8',
  });

  return result.status === 0;
}
