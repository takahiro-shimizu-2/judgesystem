import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { Octokit } from '@octokit/rest';

import { ensureDirectory, slugify } from '../../core/utils.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface PrAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
  octokitFactory?: (token: string) => PrOctokitLike;
}

interface PrMergeabilityResult {
  required: boolean;
  mergeable: boolean | null;
  mergeableState?: string;
  attemptsUsed: number;
  note: string;
}

interface RemotePrResult {
  note: string;
  prNumber?: number;
  prUrl?: string;
  reviewersRequested: string[];
  labelsApplied: string[];
  mergeability?: PrMergeabilityResult;
}

type PrOctokitLike = Pick<Octokit, 'rest'>;

export function createPrAgentHandler(options: PrAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'pr-draft-preparer',
    mode: 'connected',
    description:
      'Prepares a local draft PR artifact and can open or update a remote draft PR with optional reviewer, label, and mergeability contracts.',
    execute: async ({ task, definition, context }) => {
      const rootDir = context.rootDir || options.rootDir;
      const branch = runGit(['branch', '--show-current'], rootDir) || 'detached-head';
      const reportsDir = ensureDirectory(path.join(rootDir, '.ai', 'parallel-reports'));
      const fileName = `pr-draft-${context.sessionId}-${slugify(task.id)}.md`;
      const artifactPath = path.join(reportsDir, fileName);
      const title = `${prefixForTaskType(task.type)}: ${task.title}`;
      const requestedReviewers = parseListEnv(context.env.AUTOMATION_PR_REVIEWERS);
      const requestedLabels = parseListEnv(context.env.AUTOMATION_PR_LABELS);
      const requireMergeable = resolveRequiredFlag(context.env.AUTOMATION_PR_REQUIRE_MERGEABLE);
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
        requestedReviewers,
        requestedLabels,
        requireMergeable,
      });

      fs.writeFileSync(artifactPath, body, 'utf8');

      let remotePrResult: RemotePrResult;
      try {
        remotePrResult = await maybeCreateRemotePr({
          rootDir,
          env: context.env,
          repository,
          baseBranch,
          headBranch: branch,
          title,
          body,
          requestedReviewers,
          requestedLabels,
          requireMergeable,
          octokitFactory: options.octokitFactory,
        });
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} Draft artifact: ${path.relative(rootDir, artifactPath)}.`,
        );
      }

      return {
        status: 'completed',
        notes: [
          `${definition.name} prepared a draft PR artifact at ${path.relative(rootDir, artifactPath)}.`,
          remotePrResult.note,
        ]
          .filter(Boolean)
          .join(' '),
        output: {
          artifactPath,
          branch,
          baseBranch,
          title,
          prNumber: remotePrResult.prNumber,
          prUrl: remotePrResult.prUrl,
          reviewersRequested: remotePrResult.reviewersRequested,
          labelsApplied: remotePrResult.labelsApplied,
          mergeability: remotePrResult.mergeability,
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
  requestedReviewers: string[];
  requestedLabels: string[];
  requireMergeable: boolean;
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

## Remote PR Contract
- Requested reviewers: ${params.requestedReviewers.length > 0 ? params.requestedReviewers.join(', ') : 'none'}
- Requested labels: ${params.requestedLabels.length > 0 ? params.requestedLabels.join(', ') : 'none'}
- Mergeability gate required: ${params.requireMergeable ? 'yes' : 'no'}
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
  requestedReviewers: string[];
  requestedLabels: string[];
  requireMergeable: boolean;
  octokitFactory?: (token: string) => PrOctokitLike;
}): Promise<RemotePrResult> {
  if (params.env.AUTOMATION_ENABLE_PR_WRITE !== 'true') {
    return {
      note: 'Remote PR creation is disabled. Set AUTOMATION_ENABLE_PR_WRITE=true to open or update a draft PR automatically.',
      prNumber: undefined,
      prUrl: undefined,
      reviewersRequested: [],
      labelsApplied: [],
      mergeability: buildSkippedMergeability(
        params.requireMergeable,
        'Mergeability gate was not evaluated because remote PR creation is disabled.',
      ),
    };
  }

  const token = params.env.GITHUB_TOKEN || params.env.GH_PROJECT_TOKEN || params.env.GH_TOKEN;
  if (!token) {
    return {
      note: 'Remote PR creation was requested, but no GitHub token is available.',
      prNumber: undefined,
      prUrl: undefined,
      reviewersRequested: [],
      labelsApplied: [],
      mergeability: buildSkippedMergeability(
        params.requireMergeable,
        'Mergeability gate was not evaluated because no GitHub token is available.',
      ),
    };
  }

  if (!params.headBranch || params.headBranch === 'detached-head') {
    return {
      note: 'Remote PR creation was skipped because the current checkout is detached and no usable head branch is available.',
      prNumber: undefined,
      prUrl: undefined,
      reviewersRequested: [],
      labelsApplied: [],
      mergeability: buildSkippedMergeability(
        params.requireMergeable,
        'Mergeability gate was not evaluated because the checkout is detached.',
      ),
    };
  }

  if (params.headBranch === params.baseBranch) {
    return {
      note: `Remote PR creation was skipped because head branch ${params.headBranch} matches base branch ${params.baseBranch}.`,
      prNumber: undefined,
      prUrl: undefined,
      reviewersRequested: [],
      labelsApplied: [],
      mergeability: buildSkippedMergeability(
        params.requireMergeable,
        'Mergeability gate was not evaluated because head and base branches match.',
      ),
    };
  }

  if (!branchExistsOnOrigin(params.headBranch, params.rootDir)) {
    return {
      note: `Remote PR creation was skipped because origin/${params.headBranch} does not exist yet. Push the branch first or let another handler publish it.`,
      prNumber: undefined,
      prUrl: undefined,
      reviewersRequested: [],
      labelsApplied: [],
      mergeability: buildSkippedMergeability(
        params.requireMergeable,
        'Mergeability gate was not evaluated because the remote branch does not exist yet.',
      ),
    };
  }

  const octokit = params.octokitFactory ? params.octokitFactory(token) : new Octokit({ auth: token });
  const existing = await octokit.rest.pulls.list({
    owner: params.repository.owner,
    repo: params.repository.repo,
    state: 'open',
    head: `${params.repository.owner}:${params.headBranch}`,
    base: params.baseBranch,
    per_page: 10,
  });

  let prNumber: number;
  let prUrl: string;
  const notes: string[] = [];

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

    prNumber = updated.data.number;
    prUrl = updated.data.html_url;
    notes.push(`Remote draft PR already existed and was updated: #${prNumber} ${prUrl}`);
  } else {
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

    prNumber = created.data.number;
    prUrl = created.data.html_url;
    notes.push(`Remote draft PR was created: #${prNumber} ${prUrl}`);
  }

  if (params.requestedLabels.length > 0) {
    await octokit.rest.issues.addLabels({
      owner: params.repository.owner,
      repo: params.repository.repo,
      issue_number: prNumber,
      labels: params.requestedLabels,
    });
    notes.push(`Applied PR labels: ${params.requestedLabels.join(', ')}`);
  }

  if (params.requestedReviewers.length > 0) {
    await octokit.rest.pulls.requestReviewers({
      owner: params.repository.owner,
      repo: params.repository.repo,
      pull_number: prNumber,
      reviewers: params.requestedReviewers,
    });
    notes.push(`Requested reviewers: ${params.requestedReviewers.join(', ')}`);
  }

  const mergeability = params.requireMergeable
    ? await resolveMergeability({
        octokit,
        owner: params.repository.owner,
        repo: params.repository.repo,
        pullNumber: prNumber,
        retries: resolveMergeabilityRetries(params.env),
        delayMs: resolveMergeabilityDelayMs(params.env),
      })
    : undefined;

  if (params.requireMergeable && mergeability?.mergeable !== true) {
    throw new Error(`Remote draft PR #${prNumber} did not satisfy the mergeability gate. ${mergeability?.note}`);
  }

  if (mergeability) {
    notes.push(mergeability.note);
  }

  return {
    note: notes.join(' '),
    prNumber,
    prUrl,
    reviewersRequested: params.requestedReviewers,
    labelsApplied: params.requestedLabels,
    mergeability,
  };
}

async function resolveMergeability(params: {
  octokit: PrOctokitLike;
  owner: string;
  repo: string;
  pullNumber: number;
  retries: number;
  delayMs: number;
}): Promise<PrMergeabilityResult> {
  const maxAttempts = Math.max(1, params.retries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await params.octokit.rest.pulls.get({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
    });

    const mergeable = current.data.mergeable;
    const mergeableState = current.data.mergeable_state || undefined;

    if (mergeable !== null || attempt === maxAttempts) {
      return {
        required: true,
        mergeable,
        mergeableState,
        attemptsUsed: attempt,
        note:
          mergeable === true
            ? `Mergeability gate passed after ${attempt} attempt${attempt === 1 ? '' : 's'} (state=${mergeableState || 'unknown'}).`
            : `Mergeability gate failed after ${attempt} attempt${attempt === 1 ? '' : 's'} (mergeable=${String(
                mergeable,
              )}, state=${mergeableState || 'unknown'}).`,
      };
    }

    await sleep(params.delayMs);
  }

  return {
    required: true,
    mergeable: null,
    attemptsUsed: maxAttempts,
    note: `Mergeability gate ended without a terminal result after ${maxAttempts} attempts.`,
  };
}

function buildSkippedMergeability(required: boolean, note: string): PrMergeabilityResult | undefined {
  if (!required) {
    return undefined;
  }

  return {
    required: true,
    mergeable: null,
    attemptsUsed: 0,
    note,
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

function parseListEnv(rawValue?: string) {
  return (rawValue || '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveRequiredFlag(rawValue?: string) {
  const normalized = (rawValue || '').trim().toLowerCase();
  return ['true', 'required', 'always', '1', 'yes'].includes(normalized);
}

function resolveMergeabilityRetries(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.AUTOMATION_PR_MERGEABILITY_RETRIES || '', 10);
  if (Number.isNaN(parsed)) {
    return 5;
  }

  return Math.max(0, Math.min(10, parsed));
}

function resolveMergeabilityDelayMs(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.AUTOMATION_PR_MERGEABILITY_DELAY_MS || '', 10);
  if (Number.isNaN(parsed)) {
    return 1_000;
  }

  return Math.max(0, Math.min(10_000, parsed));
}

async function sleep(delayMs: number) {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
