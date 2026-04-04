import { spawnSync } from 'child_process';

import { truncateText } from '../../core/utils.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import { LabelStateMachine } from '../../state/label-state-machine.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface ReviewAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

interface ReviewCheck {
  label: string;
  command: string;
  args: string[];
}

const DEFAULT_REVIEW_CHECKS: ReviewCheck[] = [
  { label: 'typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { label: 'tests', command: 'npm', args: ['test'] },
];

export function createReviewAgentHandler(options: ReviewAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'review-local-checks',
    mode: 'connected',
    description: 'Runs repo-local validation commands and optionally syncs the issue into reviewing.',
    execute: async ({ task, definition, context }) => {
      const cwd = context.worktree?.worktreePath || context.rootDir || options.rootDir;
      const results = DEFAULT_REVIEW_CHECKS.map((check) => runReviewCheck(check, cwd, context.env));
      const failures = results.filter((result) => !result.passed);

      if (failures.length > 0) {
        throw new Error(
          failures
            .map((failure) => `${failure.label} failed (${failure.exitCode ?? 'signal'}): ${failure.summary}`)
            .join('\n'),
        );
      }

      const token = resolveGitHubToken(options.env);
      if (token) {
        const repository = resolveRepositoryContext(
          options.env.GITHUB_REPOSITORY || options.env.REPOSITORY || process.env.GITHUB_REPOSITORY,
        );
        const stateMachine = new LabelStateMachine(token, repository.owner, repository.repo);
        await stateMachine.assignAgent(context.issueNumber, 'review');
        await stateMachine.transitionState(
          context.issueNumber,
          'reviewing',
          `Triggered by ${task.id}: ${task.title}`,
        );
      }

      const notes = [
        `${definition.name} ran ${results.length} local checks in ${cwd}.`,
        `Quality score: 100/100 based on configured local checks (${results.map((result) => result.label).join(', ')}).`,
        ...results.map((result) => `${result.label}: ${result.summary}`),
        token
          ? `Issue #${context.issueNumber} labels were updated to agent:review and state:reviewing.`
          : 'GitHub label sync was skipped because no token is available.',
      ];

      return {
        status: 'completed',
        notes: notes.join(' '),
        output: {
          score: 100,
          checks: results,
        },
      };
    },
  };
}

function runReviewCheck(check: ReviewCheck, cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(check.command, check.args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  });
  const summary = truncateText(
    [result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .trim()
      .replace(/\s+/g, ' '),
    240,
  );

  return {
    label: check.label,
    passed: result.status === 0,
    exitCode: result.status,
    summary: summary || 'Command completed without additional output.',
  };
}

function resolveGitHubToken(env: NodeJS.ProcessEnv) {
  return env.GITHUB_TOKEN || env.GH_PROJECT_TOKEN || env.GH_TOKEN || null;
}
