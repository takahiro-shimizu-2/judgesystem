import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { ensureDirectory, slugify } from '../../core/utils.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface PrAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

export function createPrAgentHandler(options: PrAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'pr-draft-preparer',
    mode: 'connected',
    description: 'Prepares a local draft PR markdown artifact and leaves remote PR creation behind an explicit opt-in.',
    execute: async ({ task, definition, context }) => {
      const branch = runGit(['branch', '--show-current'], context.rootDir || options.rootDir) || 'detached-head';
      const reportsDir = ensureDirectory(path.join(context.rootDir || options.rootDir, '.ai', 'parallel-reports'));
      const fileName = `pr-draft-${context.sessionId}-${slugify(task.id)}.md`;
      const artifactPath = path.join(reportsDir, fileName);
      const title = `${prefixForTaskType(task.type)}: ${task.title}`;
      const body = buildDraftPrBody({
        title,
        branch,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
        definitionPath: definition.sourcePath,
      });

      fs.writeFileSync(artifactPath, body, 'utf8');

      return {
        status: 'completed',
        notes: `${definition.name} prepared a draft PR artifact at ${path.relative(
          context.rootDir || options.rootDir,
          artifactPath,
        )}. Remote PR creation remains gated; set AUTOMATION_ENABLE_PR_WRITE=true when the workflow is ready to open PRs automatically.`,
        output: {
          artifactPath,
          branch,
          title,
        },
      };
    },
  };
}

function buildDraftPrBody(params: {
  title: string;
  branch: string;
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

## Linked Issue
Closes #${params.issueNumber}

## Task
- ${params.taskId}: ${params.taskTitle}

## Runtime Notes
- Generated from ${params.definitionPath}
- This artifact is local-only; remote PR creation is intentionally behind an explicit opt-in gate.
`;
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
