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

interface CodegenPostcheckResult {
  command: string;
  passed: boolean;
  exitCode: number | null;
  summary: string;
}

interface CodegenCommandResult {
  enabled: boolean;
  command?: string;
  writerExecuted: boolean;
  note: string;
  requireChanges: boolean;
  allowedPaths: string[];
  newlyChangedFiles: string[];
  currentChangedFiles: string[];
  evaluatedChangedFiles: string[];
  unexpectedFiles: string[];
  postcheck?: CodegenPostcheckResult;
  failedReason?: string;
}

interface CodegenArtifactPayload {
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  taskType: string;
  briefPath: string;
  worktreePath: string;
  branchName?: string;
  commandResult: CodegenCommandResult;
  generatedAt: string;
}

export function createCodeGenAgentHandler(options: CodeGenAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'codegen-brief-preparer',
    mode: 'connected',
    description:
      'Creates a repo-local implementation brief, optionally syncs the issue into implementing, and can invoke an explicit writer contract with allowlists, post-checks, and summary artifacts.',
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

      const codegenResult = runCodegenCommand({
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

      const codegenArtifact = writeCodegenArtifacts({
        rootDir,
        issueNumber: context.issueNumber,
        sessionId: context.sessionId,
        taskId: task.id,
        taskTitle: task.title,
        taskType: task.type,
        briefPath: artifactPath,
        worktreePath,
        branchName,
        commandResult: codegenResult,
      });

      const syncNote = await syncIssueState({
        env: context.env,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
      });

      if (codegenResult.failedReason) {
        throw new Error(
          `${codegenResult.failedReason} Artifacts: ${codegenArtifact.markdownPath}, ${codegenArtifact.jsonPath}`,
        );
      }

      return {
        status: 'completed',
        notes: [
          `${definition.name} prepared an implementation brief at ${path.relative(rootDir, artifactPath)}.`,
          `Use ${path.relative(rootDir, worktreePath)} as the staging area for this task.`,
          codegenResult.note,
          `Codegen artifacts were written to ${path.relative(rootDir, codegenArtifact.markdownPath)} and ${path.relative(
            rootDir,
            codegenArtifact.jsonPath,
          )}.`,
          syncNote,
        ]
          .filter(Boolean)
          .join(' '),
        output: {
          artifactPath,
          worktreePath,
          branchName,
          changedFiles: codegenResult.evaluatedChangedFiles,
          postcheck: codegenResult.postcheck,
          codegenArtifact,
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
- \`AUTOMATION_CODEGEN_ALLOWED_PATHS\` can restrict which repo-relative paths the writer is allowed to change.
- \`AUTOMATION_CODEGEN_REQUIRE_CHANGES=true\` can force the writer contract to fail if no changed files are detected.
- \`AUTOMATION_CODEGEN_POSTCHECK_COMMAND\` can run a follow-up validation step after writing.
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
}): CodegenCommandResult {
  const enabled = params.env.AUTOMATION_ENABLE_CODEGEN_WRITE === 'true';
  const command = (params.env.AUTOMATION_CODEGEN_COMMAND || '').trim();
  const allowedPaths = parseListEnv(params.env.AUTOMATION_CODEGEN_ALLOWED_PATHS).map(normalizeRepoPath);
  const requireChanges = resolveRequiredFlag(params.env.AUTOMATION_CODEGEN_REQUIRE_CHANGES);
  const postcheckCommand = (params.env.AUTOMATION_CODEGEN_POSTCHECK_COMMAND || '').trim();

  if (!enabled || !command) {
    return {
      enabled,
      command: command || undefined,
      writerExecuted: false,
      note: 'Code writing is disabled. Set AUTOMATION_ENABLE_CODEGEN_WRITE=true and AUTOMATION_CODEGEN_COMMAND to let CodeGenAgent invoke an explicit writer command.',
      requireChanges,
      allowedPaths,
      newlyChangedFiles: [],
      currentChangedFiles: [],
      evaluatedChangedFiles: [],
      unexpectedFiles: [],
    };
  }

  const before = listChangedFiles(params.rootDir);
  const commandResult = runShellCommand({
    command,
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
    timeoutMs: 30 * 60 * 1000,
  });

  const after = listChangedFiles(params.rootDir);
  const newlyChangedFiles = after.filter((file) => !before.includes(file));
  const evaluatedChangedFiles = newlyChangedFiles.length > 0 ? newlyChangedFiles : after;
  const unexpectedFiles =
    allowedPaths.length > 0
      ? evaluatedChangedFiles.filter((file) => !isAllowedRepoPath(file, allowedPaths))
      : [];

  const postcheck =
    commandResult.status === 0 && postcheckCommand
      ? runShellCommand({
          command: postcheckCommand,
          cwd: params.rootDir,
          env: params.env,
          timeoutMs: 10 * 60 * 1000,
        })
      : undefined;

  const postcheckResult = postcheck
    ? {
        command: postcheckCommand,
        passed: postcheck.status === 0,
        exitCode: postcheck.status,
        summary: summarizeCommandOutput(postcheck.stdout, postcheck.stderr),
      }
    : undefined;

  let failedReason: string | undefined;
  if (commandResult.status !== 0) {
    failedReason = `Code generation command failed (${commandResult.status ?? 'signal'}): ${summarizeCommandOutput(
      commandResult.stdout,
      commandResult.stderr,
    )}`;
  } else if (requireChanges && evaluatedChangedFiles.length === 0) {
    failedReason = 'Code generation command completed, but no changed files were detected while AUTOMATION_CODEGEN_REQUIRE_CHANGES=true.';
  } else if (unexpectedFiles.length > 0) {
    failedReason = `Code generation command touched files outside AUTOMATION_CODEGEN_ALLOWED_PATHS: ${unexpectedFiles.join(
      ', ',
    )}.`;
  } else if (postcheckResult && !postcheckResult.passed) {
    failedReason = `Codegen post-check failed (${postcheckResult.exitCode ?? 'signal'}): ${postcheckResult.summary}`;
  }

  const noteParts = [
    `Code writing command ${commandResult.status === 0 ? 'executed successfully' : 'failed'} in the repo root.`,
    evaluatedChangedFiles.length > 0
      ? `Detected ${evaluatedChangedFiles.length} evaluated changed file(s): ${evaluatedChangedFiles.join(', ')}.`
      : 'No changed files were detected after the writer command.',
    allowedPaths.length > 0 ? `Allowed paths: ${allowedPaths.join(', ')}.` : 'No path allowlist was configured.',
    postcheckResult
      ? `Post-check ${postcheckResult.passed ? 'passed' : 'failed'}: ${postcheckResult.summary}`
      : postcheckCommand
        ? 'Post-check was configured but skipped because the writer command failed.'
        : 'No post-check command was configured.',
  ];

  return {
    enabled,
    command,
    writerExecuted: true,
    note: noteParts.join(' '),
    requireChanges,
    allowedPaths,
    newlyChangedFiles,
    currentChangedFiles: after,
    evaluatedChangedFiles,
    unexpectedFiles,
    postcheck: postcheckResult,
    failedReason,
  };
}

function writeCodegenArtifacts(params: {
  rootDir: string;
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  taskType: string;
  briefPath: string;
  worktreePath: string;
  branchName?: string;
  commandResult: CodegenCommandResult;
}) {
  const reportsDir = ensureDirectory(path.join(params.rootDir, '.ai', 'parallel-reports'));
  const baseName = `codegen-summary-${params.sessionId}-${slugify(params.taskId)}`;
  const markdownPath = path.join(reportsDir, `${baseName}.md`);
  const jsonPath = path.join(reportsDir, `${baseName}.json`);
  const payload: CodegenArtifactPayload = {
    issueNumber: params.issueNumber,
    sessionId: params.sessionId,
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    taskType: params.taskType,
    briefPath: params.briefPath,
    worktreePath: params.worktreePath,
    branchName: params.branchName,
    commandResult: params.commandResult,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(markdownPath, buildCodegenMarkdown(payload), 'utf8');

  return {
    markdownPath,
    jsonPath,
  };
}

function buildCodegenMarkdown(payload: CodegenArtifactPayload) {
  return `# Codegen Summary

## Task
- Issue: #${payload.issueNumber}
- Session: ${payload.sessionId}
- Task: ${payload.taskId}
- Title: ${payload.taskTitle}
- Type: ${payload.taskType}

## Contract
- Brief path: ${payload.briefPath}
- Worktree path: ${payload.worktreePath}
- Branch: ${payload.branchName || 'n/a'}
- Writer enabled: ${payload.commandResult.enabled ? 'yes' : 'no'}
- Writer executed: ${payload.commandResult.writerExecuted ? 'yes' : 'no'}
- Require changes: ${payload.commandResult.requireChanges ? 'yes' : 'no'}
- Command: ${payload.commandResult.command || 'n/a'}
- Allowed paths: ${payload.commandResult.allowedPaths.length > 0 ? payload.commandResult.allowedPaths.join(', ') : 'n/a'}
- Note: ${payload.commandResult.note}
${payload.commandResult.failedReason ? `- Failure: ${payload.commandResult.failedReason}` : ''}

## Files
- Newly changed: ${payload.commandResult.newlyChangedFiles.length > 0 ? payload.commandResult.newlyChangedFiles.join(', ') : 'none'}
- Current changed: ${payload.commandResult.currentChangedFiles.length > 0 ? payload.commandResult.currentChangedFiles.join(', ') : 'none'}
- Evaluated changed: ${payload.commandResult.evaluatedChangedFiles.length > 0 ? payload.commandResult.evaluatedChangedFiles.join(', ') : 'none'}
- Unexpected files: ${payload.commandResult.unexpectedFiles.length > 0 ? payload.commandResult.unexpectedFiles.join(', ') : 'none'}

## Post-check
${payload.commandResult.postcheck
  ? `- Command: ${payload.commandResult.postcheck.command}
- Passed: ${payload.commandResult.postcheck.passed ? 'yes' : 'no'}
- Exit code: ${payload.commandResult.postcheck.exitCode ?? 'signal'}
- Summary: ${payload.commandResult.postcheck.summary}`
  : '- No post-check command was configured.'}

## Generated
- ${payload.generatedAt}
`;
}

function runShellCommand(params: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}) {
  return spawnSync(params.command, {
    cwd: params.cwd,
    env: params.env,
    encoding: 'utf8',
    shell: true,
    timeout: params.timeoutMs,
  });
}

function summarizeCommandOutput(stdout?: string, stderr?: string) {
  return (
    truncateText(
      [stdout, stderr]
        .filter(Boolean)
        .join('\n')
        .trim()
        .replace(/\s+/g, ' '),
      240,
    ) || 'Command completed without additional output.'
  );
}

function listChangedFiles(rootDir: string) {
  const modified = runGitLines(['diff', '--name-only', '--relative', 'HEAD'], rootDir);
  const untracked = runGitLines(['ls-files', '--others', '--exclude-standard'], rootDir);

  return [...new Set([...modified, ...untracked].map(normalizeRepoPath).filter(Boolean))];
}

function runGitLines(args: string[], cwd: string) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return [] as string[];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseListEnv(rawValue?: string) {
  return (rawValue || '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeRepoPath(targetPath: string) {
  return targetPath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isAllowedRepoPath(targetPath: string, allowedPaths: string[]) {
  const normalizedTarget = normalizeRepoPath(targetPath);
  return allowedPaths.some((allowedPath) => {
    const normalizedAllowed = normalizeRepoPath(allowedPath).replace(/\/+$/, '');
    return normalizedTarget === normalizedAllowed || normalizedTarget.startsWith(`${normalizedAllowed}/`);
  });
}

function resolveRequiredFlag(rawValue?: string) {
  const normalized = (rawValue || '').trim().toLowerCase();
  return ['true', 'required', 'always', '1', 'yes'].includes(normalized);
}
