import * as fs from 'fs';
import * as path from 'path';

import { ensureDirectory, slugify } from '../../core/utils.js';
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
      'Creates a repo-local implementation brief from the Claude-side CodeGen definition and optionally syncs the issue into implementing.',
    execute: async ({ task, definition, context }) => {
      const rootDir = context.rootDir || options.rootDir;
      const worktreePath = ensureDirectory(
        context.worktree?.worktreePath || path.join(rootDir, '.ai', 'worktrees', `issue-${context.issueNumber}`, task.id),
      );
      const fileName = `implementation-brief-${context.sessionId}-${slugify(task.id)}.md`;
      const artifactPath = path.join(worktreePath, fileName);

      fs.writeFileSync(
        artifactPath,
        buildImplementationBrief({
          issueNumber: context.issueNumber,
          taskId: task.id,
          taskTitle: task.title,
          taskType: task.type,
          worktreePath,
          branchName: context.worktree?.branchName,
          definitionPath: definition.sourcePath,
          definitionSummary: definition.summary,
          definitionEscalation: definition.escalation,
        }),
        'utf8',
      );

      const syncNote = await syncIssueState({
        env: options.env,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
      });

      return {
        status: 'completed',
        notes: [
          `${definition.name} prepared an implementation brief at ${path.relative(rootDir, artifactPath)}.`,
          `Use ${path.relative(rootDir, worktreePath)} as the working area for this task.`,
          syncNote,
        ].join(' '),
        output: {
          artifactPath,
          worktreePath,
          branchName: context.worktree?.branchName,
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
- This handler does not call an external model or write product code automatically.
- Its job is to materialize a local implementation brief and, when GitHub credentials are available, move the issue into \`agent:codegen\` / \`state:implementing\`.
- Product code changes remain an explicit follow-up step for a human or a future capability binding.

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
