import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { ensureDirectory, slugify, truncateText } from '../../core/utils.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import { LabelStateMachine } from '../../state/label-state-machine.js';
import type { AgentType } from '../../state/task-state-machine.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface CodeGenAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

export function createCodeGenAgentHandler(options: CodeGenAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'codegen-brief-preparer',
    mode: 'connected',
    description:
      'Creates a repo-local implementation brief, optionally syncs the issue into implementing, and can invoke an explicit code-writing command when enabled.',
    execute: async ({ task, definition, context }) => {
      const rootDir = context.rootDir || options.rootDir;
      const worktreePath = ensureDirectory(
        context.worktree?.worktreePath || path.join(rootDir, '.ai', 'worktrees', `issue-${context.issueNumber}`, task.id),
      );
      const fileName = `implementation-brief-${context.sessionId}-${slugify(task.id)}.md`;
      const artifactPath = path.join(worktreePath, fileName);
      const branchName = context.worktree?.branchName;

      fs.writeFileSync(
        artifactPath,
        buildImplementationBrief({
          issueNumber: context.issueNumber,
          taskId: task.id,
          taskTitle: task.title,
          taskType: task.type,
          worktreePath,
          branchName,
          definitionPath: definition.sourcePath,
          definitionSummary: definition.summary,
          definitionEscalation: definition.escalation,
        }),
        'utf8',
      );

      const codegenNote = runCodegenCommand({
        rootDir,
        env: context.env,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
        taskType: task.type,
        worktreePath,
        branchName,
        artifactPath,
      });

      const syncNote = await syncIssueState({
        env: context.env,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
      });

      return {
        status: 'completed',
        notes: [
          `${definition.name} prepared an implementation brief at ${path.relative(rootDir, artifactPath)}.`,
          `Use ${path.relative(rootDir, worktreePath)} as the staging area for this task.`,
          codegenNote.note,
          syncNote,
        ].join(' '),
        output: {
          artifactPath,
          worktreePath,
          branchName,
          changedFiles: codegenNote.changedFiles,
        },
      };
    },
  };
}

function buildImplementationBrief(params: {
  issueNumber: number;
  taskId: string;
  taskTitle: string;
  taskType: string;
  worktreePath: string;
  branchName?: string;
  definitionPath: string;
  definitionSummary: string;
  definitionEscalation?: string;
}) {
  const branchLine = params.branchName ? params.branchName : 'agent branch not assigned';

  return `# Code Generation Brief

## Issue
- #${params.issueNumber}

## Task
- ID: ${params.taskId}
- Title: ${params.taskTitle}
- Type: ${params.taskType}

## Working Area
- Worktree path: ${params.worktreePath}
- Suggested branch: ${branchLine}

## Claude-side Source of Truth
- Definition: ${params.definitionPath}
- Summary: ${params.definitionSummary}
${params.definitionEscalation ? `- Escalation: ${params.definitionEscalation}` : ''}

## Runtime Contract
- This handler always materializes a local implementation brief first.
- When \`AUTOMATION_ENABLE_CODEGEN_WRITE=true\` and \`AUTOMATION_CODEGEN_COMMAND\` are set, it can invoke an explicit code-writing command in the repo root.
- The code-writing command receives task metadata via environment variables and is expected to edit the repo intentionally.
- When the gate is closed, product code changes remain an explicit follow-up step for a human or a future capability binding.

## Suggested Next Steps
1. Review the task DAG and linked execution report under \`.ai/parallel-reports/\`.
2. Use GitNexus \`query/context/impact\` on the concrete symbols you plan to change.
3. Implement inside the suggested worktree or current repository root, then run \`npm run typecheck\` and any relevant tests.
4. Hand off to \`ReviewAgent\` and \`PRAgent\` once code changes are ready.
`;
}

async function syncIssueState(params: {
  env: NodeJS.ProcessEnv;
  issueNumber: number;
  taskId: string;
  taskTitle: string;
}) {
  const token = resolveGitHubToken(params.env);
  if (!token) {
    return 'GitHub label sync was skipped because no token is available.';
  }

  try {
    const repository = resolveRepositoryContext(
      params.env.GITHUB_REPOSITORY || params.env.REPOSITORY || process.env.GITHUB_REPOSITORY,
    );
    const stateMachine = new LabelStateMachine(token, repository.owner, repository.repo);
    await stateMachine.assignAgent(params.issueNumber, 'codegen' satisfies AgentType);
    await stateMachine.transitionState(
      params.issueNumber,
      'implementing',
      `Triggered by ${params.taskId}: ${params.taskTitle}`,
    );

    return `Issue #${params.issueNumber} labels were updated to agent:codegen and state:implementing.`;
  } catch (error) {
    return `Implementation brief was generated, but GitHub label sync could not move issue #${params.issueNumber} into implementing: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function resolveGitHubToken(env: NodeJS.ProcessEnv) {
  return env.GITHUB_TOKEN || env.GH_PROJECT_TOKEN || env.GH_TOKEN || null;
}

function runCodegenCommand(params: {
  rootDir: string;
  env: NodeJS.ProcessEnv;
  issueNumber: number;
  taskId: string;
  taskTitle: string;
  taskType: string;
  worktreePath: string;
  branchName?: string;
  artifactPath: string;
}) {
  const enabled = params.env.AUTOMATION_ENABLE_CODEGEN_WRITE === 'true';
  const command = params.env.AUTOMATION_CODEGEN_COMMAND;

  if (!enabled || !command) {
    return {
      note: 'Code writing is disabled. Set AUTOMATION_ENABLE_CODEGEN_WRITE=true and AUTOMATION_CODEGEN_COMMAND to let CodeGenAgent invoke an explicit writer command.',
      changedFiles: [] as string[],
    };
  }

  const before = listChangedFiles(params.rootDir);
  const result = spawnSync(command, {
    cwd: params.rootDir,
    env: {
      ...params.env,
      AUTOMATION_ISSUE_NUMBER: String(params.issueNumber),
      AUTOMATION_TASK_ID: params.taskId,
      AUTOMATION_TASK_TITLE: params.taskTitle,
      AUTOMATION_TASK_TYPE: params.taskType,
      AUTOMATION_WORKTREE_PATH: params.worktreePath,
      AUTOMATION_BRIEF_PATH: params.artifactPath,
      AUTOMATION_BRANCH_NAME: params.branchName || '',
    },
    encoding: 'utf8',
    shell: true,
    timeout: 30 * 60 * 1000,
  });

  if (result.status !== 0) {
    throw new Error(
      `Code generation command failed (${result.status ?? 'signal'}): ${truncateText(
        [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
        240,
      )}`,
    );
  }

  const after = listChangedFiles(params.rootDir);
  const changedFiles = after.filter((file) => !before.includes(file));
  const finalFiles = changedFiles.length > 0 ? changedFiles : after;

  return {
    note:
      finalFiles.length > 0
        ? `Code writing command executed successfully in the repo root and left ${finalFiles.length} changed file(s): ${finalFiles.join(', ')}.`
        : 'Code writing command executed successfully, but no tracked file changes were detected afterwards.',
    changedFiles: finalFiles,
  };
}

function listChangedFiles(rootDir: string) {
  const result = spawnSync('git', ['status', '--short'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[A-Z?]{1,2}\s+/, ''))
    .filter(Boolean);
}
