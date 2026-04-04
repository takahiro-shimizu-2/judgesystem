import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { ensureDirectory, slugify, truncateText } from '../../core/utils.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import { LabelStateMachine } from '../../state/label-state-machine.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface DeploymentAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

interface DeploymentStepResult {
  name: 'approval' | 'preflight' | 'build' | 'deploy' | 'healthcheck' | 'rollback';
  command?: string;
  passed: boolean;
  skipped?: boolean;
  exitCode: number | null;
  summary: string;
  attemptsUsed: number;
}

interface DeploymentApprovalDetails {
  policy: 'auto' | 'required' | 'disabled';
  required: boolean;
  approved: boolean;
  approvedBy?: string;
  source?: string;
  reason?: string;
  allowedApprovers: string[];
  summary: string;
}

interface DeploymentArtifactPayload {
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  provider: string;
  target: string;
  environment: string;
  workingDirectory: string;
  approval: DeploymentApprovalDetails;
  steps: DeploymentStepResult[];
  rollbackAttempted: boolean;
  generatedAt: string;
}

const DEFAULT_HEALTHCHECK_RETRIES = 0;
const DEFAULT_HEALTHCHECK_DELAY_MS = 5_000;
const PROTECTED_ENVIRONMENT_NAMES = new Set(['prod', 'production', 'live']);

export function createDeploymentAgentHandler(options: DeploymentAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'deployment-command-gate',
    mode: 'connected',
    description:
      'Runs an explicitly configured deployment contract with optional preflight, health check, rollback, and artifact generation.',
    execute: async ({ task, definition, context }) => {
      const env = context.env;
      const enabled = env.AUTOMATION_ENABLE_DEPLOY === 'true';
      const deployCommand = env.AUTOMATION_DEPLOY_COMMAND;

      if (!enabled || !deployCommand) {
        return {
          status: 'skipped',
          notes: `${definition.name} is connected, but deployment is gated. Set AUTOMATION_ENABLE_DEPLOY=true and AUTOMATION_DEPLOY_COMMAND to enable it.`,
        };
      }

      const rootDir = context.rootDir || options.rootDir;
      const environment = env.AUTOMATION_DEPLOY_ENVIRONMENT || 'unspecified';
      const provider = (env.AUTOMATION_DEPLOY_PROVIDER || 'custom').trim() || 'custom';
      const target = (env.AUTOMATION_DEPLOY_TARGET || environment).trim() || 'unspecified';
      const workingDirectory = resolveDeploymentWorkingDirectory(rootDir, env);
      const preflightCommand = env.AUTOMATION_DEPLOY_PREFLIGHT_COMMAND;
      const buildCommand = env.AUTOMATION_DEPLOY_BUILD_COMMAND;
      const healthcheckCommand = env.AUTOMATION_DEPLOY_HEALTHCHECK_COMMAND;
      const rollbackCommand = env.AUTOMATION_DEPLOY_ROLLBACK_COMMAND;
      const healthcheckRetries = resolveHealthcheckRetries(env);
      const healthcheckDelayMs = resolveHealthcheckDelayMs(env);
      const approval = resolveDeploymentApproval({
        env,
        environment,
        provider,
        target,
      });
      const steps: DeploymentStepResult[] = [];
      let rollbackAttempted = false;

      const preflightResult = preflightCommand
        ? runDeploymentCommand({
            name: 'preflight',
            command: preflightCommand,
            cwd: workingDirectory,
            env,
          })
        : undefined;
      if (preflightResult) {
        steps.push(preflightResult);
        if (!preflightResult.passed) {
          const artifact = writeDeploymentArtifacts({
            rootDir,
            issueNumber: context.issueNumber,
            sessionId: context.sessionId,
            taskId: task.id,
            taskTitle: task.title,
            provider,
            target,
            environment,
            workingDirectory,
            approval: approval.details,
            steps,
            rollbackAttempted,
          });
          throw new Error(
            `Deployment preflight failed (${environment}): ${formatStepSummary(preflightResult)} Artifacts: ${artifact.markdownPath}, ${artifact.jsonPath}`,
          );
        }
      }

      steps.push(approval.step);
      if (!approval.details.approved) {
        const artifact = writeDeploymentArtifacts({
          rootDir,
          issueNumber: context.issueNumber,
          sessionId: context.sessionId,
          taskId: task.id,
          taskTitle: task.title,
          provider,
          target,
          environment,
          workingDirectory,
          approval: approval.details,
          steps,
          rollbackAttempted,
        });

        return {
          status: 'skipped',
          notes: [
            `${definition.name} did not deploy ${provider}/${target} to ${environment} because the approval gate was not satisfied.`,
            approval.details.summary,
            `Deployment artifacts were written to ${relativeOrSelf(rootDir, artifact.markdownPath)} and ${relativeOrSelf(
              rootDir,
              artifact.jsonPath,
            )}.`,
          ].join(' '),
          output: {
            provider,
            target,
            environment,
            workingDirectory,
            approval: approval.details,
            steps,
            rollbackAttempted,
            artifact,
          },
        };
      }

      const buildResult = buildCommand
        ? runDeploymentCommand({
            name: 'build',
            command: buildCommand,
            cwd: workingDirectory,
            env,
          })
        : undefined;
      if (buildResult) {
        steps.push(buildResult);
        if (!buildResult.passed) {
          const artifact = writeDeploymentArtifacts({
            rootDir,
            issueNumber: context.issueNumber,
            sessionId: context.sessionId,
            taskId: task.id,
            taskTitle: task.title,
            provider,
            target,
            environment,
            workingDirectory,
            approval: approval.details,
            steps,
            rollbackAttempted,
          });
          throw new Error(
            `Deployment build failed (${environment}): ${formatStepSummary(buildResult)} Artifacts: ${artifact.markdownPath}, ${artifact.jsonPath}`,
          );
        }
      }

      const syncNote = await syncIssueState({
        env,
        issueNumber: context.issueNumber,
        taskId: task.id,
        taskTitle: task.title,
      });

      const deployResult = runDeploymentCommand({
        name: 'deploy',
        command: deployCommand,
        cwd: workingDirectory,
        env,
      });
      steps.push(deployResult);

      if (!deployResult.passed) {
        const rollbackResult = rollbackCommand
          ? runDeploymentCommand({
              name: 'rollback',
              command: rollbackCommand,
              cwd: workingDirectory,
              env,
            })
          : undefined;
        if (rollbackResult) {
          rollbackAttempted = true;
          steps.push(rollbackResult);
        }

        const artifact = writeDeploymentArtifacts({
          rootDir,
          issueNumber: context.issueNumber,
          sessionId: context.sessionId,
          taskId: task.id,
          taskTitle: task.title,
          provider,
          target,
          environment,
          workingDirectory,
          approval: approval.details,
          steps,
          rollbackAttempted,
        });

        throw new Error(
          [
            `Deployment command failed (${environment}).`,
            formatStepSummary(deployResult),
            rollbackResult
              ? `Rollback ${rollbackResult.passed ? 'completed' : 'failed'}: ${formatStepSummary(rollbackResult)}`
              : 'Rollback was not attempted because AUTOMATION_DEPLOY_ROLLBACK_COMMAND is not configured.',
            syncNote,
            `Artifacts: ${artifact.markdownPath}, ${artifact.jsonPath}`,
          ].join(' '),
        );
      }

      let healthcheckResult: DeploymentStepResult | undefined;
      if (healthcheckCommand) {
        healthcheckResult = runDeploymentCommandWithRetries({
          name: 'healthcheck',
          command: healthcheckCommand,
          cwd: workingDirectory,
          env,
          retries: healthcheckRetries,
          delayMs: healthcheckDelayMs,
          logRetry: (message) => context.logger.warn(message),
        });
        steps.push(healthcheckResult);

        if (!healthcheckResult.passed) {
          const rollbackResult = rollbackCommand
            ? runDeploymentCommand({
                name: 'rollback',
                command: rollbackCommand,
                cwd: workingDirectory,
                env,
              })
            : undefined;
          if (rollbackResult) {
            rollbackAttempted = true;
            steps.push(rollbackResult);
          }

          const artifact = writeDeploymentArtifacts({
            rootDir,
            issueNumber: context.issueNumber,
            sessionId: context.sessionId,
            taskId: task.id,
            taskTitle: task.title,
            provider,
            target,
            environment,
            workingDirectory,
            approval: approval.details,
            steps,
            rollbackAttempted,
          });

          throw new Error(
            [
              `Deployment health check failed (${environment}).`,
              formatStepSummary(healthcheckResult),
              rollbackResult
                ? `Rollback ${rollbackResult.passed ? 'completed' : 'failed'}: ${formatStepSummary(rollbackResult)}`
                : 'Rollback was not attempted because AUTOMATION_DEPLOY_ROLLBACK_COMMAND is not configured.',
              syncNote,
              `Artifacts: ${artifact.markdownPath}, ${artifact.jsonPath}`,
            ].join(' '),
          );
        }
      }

      const artifact = writeDeploymentArtifacts({
        rootDir,
        issueNumber: context.issueNumber,
        sessionId: context.sessionId,
        taskId: task.id,
        taskTitle: task.title,
        provider,
        target,
        environment,
        workingDirectory,
        approval: approval.details,
        steps,
        rollbackAttempted,
      });

      return {
        status: 'completed',
        notes: [
          `${definition.name} completed deployment contract for ${provider}/${target} in ${environment} at ${describeWorkingDirectory(
            rootDir,
            workingDirectory,
            env,
          )}.`,
          approval.details.summary,
          preflightResult ? formatStepSummary(preflightResult) : 'No preflight command was configured.',
          buildResult ? formatStepSummary(buildResult) : 'No build command was configured.',
          formatStepSummary(deployResult),
          healthcheckResult
            ? formatStepSummary(healthcheckResult)
            : 'No health check command was configured.',
          rollbackAttempted
            ? 'Rollback command was available but not needed.'
            : 'Rollback was not needed.',
          syncNote,
          `Deployment artifacts were written to ${relativeOrSelf(rootDir, artifact.markdownPath)} and ${relativeOrSelf(
            rootDir,
            artifact.jsonPath,
          )}.`,
        ].join(' '),
        output: {
          provider,
          target,
          environment,
          workingDirectory,
          approval: approval.details,
          steps,
          rollbackAttempted,
          artifact,
        },
      };
    },
  };
}

function resolveDeploymentApproval(params: {
  env: NodeJS.ProcessEnv;
  environment: string;
  provider: string;
  target: string;
}) {
  const policy = resolveApprovalPolicy(params.env.AUTOMATION_DEPLOY_REQUIRE_APPROVAL);
  const required = policy === 'required' || (policy === 'auto' && isProtectedEnvironment(params.environment));
  const approvedBy = (params.env.AUTOMATION_DEPLOY_APPROVED_BY || '').trim();
  const source = (params.env.AUTOMATION_DEPLOY_APPROVAL_SOURCE || '').trim();
  const reason = (params.env.AUTOMATION_DEPLOY_APPROVAL_REASON || '').trim();
  const allowedApprovers = parseListEnv(params.env.AUTOMATION_DEPLOY_ALLOWED_APPROVERS);
  const approved =
    !required ||
    (!!approvedBy &&
      (allowedApprovers.length === 0 ||
        allowedApprovers.some((candidate) => candidate.toLowerCase() === approvedBy.toLowerCase())));

  const summary = !required
    ? `Approval was not required for ${params.environment} (${params.provider}/${params.target}) under policy=${policy}.`
    : approved
      ? `Approval granted by ${approvedBy}${
          source ? ` via ${source}` : ''
        }${reason ? ` (${reason})` : ''}${
          allowedApprovers.length > 0 ? ' against the configured approver allowlist.' : ' with no approver allowlist configured.'
        }`
      : `Approval is required for ${params.environment} (${params.provider}/${params.target}) but was not satisfied.${
          approvedBy
            ? allowedApprovers.length > 0
              ? ` ${approvedBy} is not in AUTOMATION_DEPLOY_ALLOWED_APPROVERS.`
              : ''
            : ' Set AUTOMATION_DEPLOY_APPROVED_BY or run from an actor that the workflow passes through.'
        }`;

  const details: DeploymentApprovalDetails = {
    policy,
    required,
    approved,
    approvedBy: approvedBy || undefined,
    source: source || undefined,
    reason: reason || undefined,
    allowedApprovers,
    summary,
  };

  return {
    details,
    step: {
      name: 'approval' as const,
      passed: approved,
      skipped: !required,
      exitCode: approved ? 0 : null,
      summary,
      attemptsUsed: 1,
    },
  };
}

function resolveDeploymentWorkingDirectory(rootDir: string, env: NodeJS.ProcessEnv) {
  const configured = env.AUTOMATION_DEPLOY_CWD;
  if (!configured) {
    return rootDir;
  }

  return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
}

function runDeploymentCommand(params: {
  name: DeploymentStepResult['name'];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): DeploymentStepResult {
  const result = spawnSync(params.command, {
    cwd: params.cwd,
    env: params.env,
    encoding: 'utf8',
    shell: true,
    timeout: 15 * 60 * 1000,
  });

  return {
    name: params.name,
    command: params.command,
    passed: result.status === 0,
    exitCode: result.status,
    summary: summarizeCommandOutput(result.stdout, result.stderr),
    attemptsUsed: 1,
  };
}

function runDeploymentCommandWithRetries(params: {
  name: 'healthcheck';
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  retries: number;
  delayMs: number;
  logRetry?: (message: string) => void;
}): DeploymentStepResult {
  const maxAttempts = Math.max(1, params.retries + 1);
  let finalResult: DeploymentStepResult | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runDeploymentCommand({
      name: params.name,
      command: params.command,
      cwd: params.cwd,
      env: params.env,
    });
    finalResult = {
      ...result,
      attemptsUsed: attempt,
    };

    if (result.passed || attempt === maxAttempts) {
      return finalResult;
    }

    params.logRetry?.(
      `Deployment health check failed on attempt ${attempt}/${maxAttempts}. Retrying in ${params.delayMs}ms.`,
    );
    sleepMs(params.delayMs);
  }

  return (
    finalResult || {
      name: params.name,
      command: params.command,
      passed: false,
      exitCode: null,
      summary: 'Deployment health check failed without producing a terminal attempt.',
      attemptsUsed: maxAttempts,
    }
  );
}

function resolveHealthcheckRetries(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.AUTOMATION_DEPLOY_HEALTHCHECK_RETRIES || '', 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_HEALTHCHECK_RETRIES;
  }

  return Math.max(0, Math.min(10, parsed));
}

function resolveHealthcheckDelayMs(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.AUTOMATION_DEPLOY_HEALTHCHECK_DELAY_MS || '', 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_HEALTHCHECK_DELAY_MS;
  }

  return Math.max(0, Math.min(60_000, parsed));
}

function sleepMs(delayMs: number) {
  if (delayMs <= 0) {
    return;
  }

  spawnSync('bash', ['-lc', `sleep ${Math.max(0, delayMs) / 1000}`], {
    encoding: 'utf8',
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

function writeDeploymentArtifacts(params: {
  rootDir: string;
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  provider: string;
  target: string;
  environment: string;
  workingDirectory: string;
  approval: DeploymentApprovalDetails;
  steps: DeploymentStepResult[];
  rollbackAttempted: boolean;
}) {
  const reportsDir = ensureDirectory(path.join(params.rootDir, '.ai', 'parallel-reports'));
  const baseName = `deployment-summary-${params.sessionId}-${slugify(params.taskId)}`;
  const markdownPath = path.join(reportsDir, `${baseName}.md`);
  const jsonPath = path.join(reportsDir, `${baseName}.json`);
  const payload: DeploymentArtifactPayload = {
    issueNumber: params.issueNumber,
    sessionId: params.sessionId,
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    provider: params.provider,
    target: params.target,
    environment: params.environment,
    workingDirectory: params.workingDirectory,
    approval: params.approval,
    steps: params.steps,
    rollbackAttempted: params.rollbackAttempted,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(markdownPath, buildDeploymentMarkdown(payload), 'utf8');

  return {
    markdownPath,
    jsonPath,
  };
}

function buildDeploymentMarkdown(payload: DeploymentArtifactPayload) {
  return `# Deployment Summary

## Task
- Issue: #${payload.issueNumber}
- Session: ${payload.sessionId}
- Task: ${payload.taskId}
- Title: ${payload.taskTitle}

## Contract
- Provider: ${payload.provider}
- Target: ${payload.target}
- Environment: ${payload.environment}
- Working directory: ${payload.workingDirectory}
- Rollback attempted: ${payload.rollbackAttempted ? 'yes' : 'no'}

## Approval
- Policy: ${payload.approval.policy}
- Required: ${payload.approval.required ? 'yes' : 'no'}
- Approved: ${payload.approval.approved ? 'yes' : 'no'}
- Approved by: ${payload.approval.approvedBy || 'n/a'}
- Source: ${payload.approval.source || 'n/a'}
- Reason: ${payload.approval.reason || 'n/a'}
- Allowed approvers: ${payload.approval.allowedApprovers.length > 0 ? payload.approval.allowedApprovers.join(', ') : 'n/a'}
- Summary: ${payload.approval.summary}

## Steps
${payload.steps
  .map(
    (step) =>
      `- ${step.name}: ${step.passed ? 'passed' : 'failed'} (${step.attemptsUsed} attempt${
        step.attemptsUsed === 1 ? '' : 's'
      })${step.command ? ` — \`${step.command}\`` : ''} — ${step.summary}`,
  )
  .join('\n')}

## Generated
- ${payload.generatedAt}
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
    await stateMachine.assignAgent(params.issueNumber, 'deployment');
    return `Issue #${params.issueNumber} labels were updated to agent:deployment.`;
  } catch (error) {
    return `Deployment contract started, but GitHub label sync could not assign agent:deployment on issue #${params.issueNumber}: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function formatStepSummary(step: DeploymentStepResult) {
  return `${step.name}: ${step.passed ? 'passed' : 'failed'}${
    step.attemptsUsed > 1 ? ` after ${step.attemptsUsed} attempts` : ''
  } — ${step.summary}`;
}

function describeWorkingDirectory(rootDir: string, workingDirectory: string, env: NodeJS.ProcessEnv) {
  if (!env.AUTOMATION_DEPLOY_CWD) {
    return 'repo root';
  }

  return path.resolve(rootDir) === path.resolve(workingDirectory)
    ? '.'
    : relativeOrSelf(rootDir, workingDirectory);
}

function relativeOrSelf(rootDir: string, targetPath: string) {
  const relative = path.relative(rootDir, targetPath);
  if (!relative) {
    return '.';
  }

  return relative.startsWith('..') ? targetPath : relative;
}

function resolveGitHubToken(env: NodeJS.ProcessEnv) {
  return env.GITHUB_TOKEN || env.GH_PROJECT_TOKEN || env.GH_TOKEN || null;
}

function resolveApprovalPolicy(rawValue?: string): DeploymentApprovalDetails['policy'] {
  const normalized = (rawValue || 'auto').trim().toLowerCase();
  if (['true', 'required', 'always'].includes(normalized)) {
    return 'required';
  }
  if (['false', 'disabled', 'never'].includes(normalized)) {
    return 'disabled';
  }

  return 'auto';
}

function isProtectedEnvironment(environment: string) {
  const normalized = environment.trim().toLowerCase();
  return PROTECTED_ENVIRONMENT_NAMES.has(normalized);
}

function parseListEnv(rawValue?: string) {
  return (rawValue || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
