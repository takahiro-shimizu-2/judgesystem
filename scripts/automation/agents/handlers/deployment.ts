import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import { Octokit } from '@octokit/rest';

import { ensureDirectory, slugify, truncateText } from '../../core/utils.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import { LabelStateMachine } from '../../state/label-state-machine.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface DeploymentAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
  octokitFactory?: (token: string) => DeploymentOctokitLike;
}

type DeploymentOctokitLike = Pick<Octokit, 'request'>;

type DeploymentStepName = 'approval' | 'preflight' | 'build' | 'deploy' | 'healthcheck' | 'rollback';

interface DeploymentStepResult {
  name: DeploymentStepName;
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

interface ProviderRunDetails {
  workflowId: string;
  ref: string;
  runId?: number;
  runUrl?: string;
  status: 'requested' | 'queued' | 'in_progress' | 'completed' | 'unknown';
  conclusion?: string | null;
  waited: boolean;
  summary: string;
}

interface DeploymentArtifactPayload {
  issueNumber: number;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  commandSource: string;
  provider: string;
  target: string;
  environment: string;
  workingDirectory: string;
  approval: DeploymentApprovalDetails;
  steps: DeploymentStepResult[];
  rollbackAttempted: boolean;
  providerRun?: ProviderRunDetails;
  generatedAt: string;
}

type ResolvedDeployAction =
  | {
      kind: 'command';
      command: string;
      source: string;
      note: string;
    }
  | {
      kind: 'workflow-dispatch';
      source: string;
      note: string;
      workflowId: string;
      ref: string;
      inputs: Record<string, string>;
      waitForRun: boolean;
      timeoutMs: number;
      pollIntervalMs: number;
    }
  | {
      kind: 'unresolved';
      source: 'unresolved';
      note: string;
    };

interface WorkflowDispatchDeployResult {
  step: DeploymentStepResult;
  providerRun?: ProviderRunDetails;
}

interface WorkflowRunLike {
  id: number;
  html_url?: string;
  status?: string;
  conclusion?: string | null;
  created_at?: string;
  head_branch?: string;
}

const DEFAULT_HEALTHCHECK_RETRIES = 0;
const DEFAULT_HEALTHCHECK_DELAY_MS = 5_000;
const DEFAULT_PROVIDER_RUN_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_PROVIDER_RUN_POLL_INTERVAL_MS = 5_000;
const PROTECTED_ENVIRONMENT_NAMES = new Set(['prod', 'production', 'live']);
const GITHUB_PAGES_TARGETS = new Set(['dashboard', 'docs', 'github-pages']);

export function createDeploymentAgentHandler(options: DeploymentAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'deployment-command-gate',
    mode: 'connected',
    description:
      'Runs a gated deployment contract with optional provider presets, preflight, health check, rollback, workflow dispatch orchestration, and artifact generation.',
    execute: async ({ task, definition, context }) => {
      const env = context.env;
      const enabled = env.AUTOMATION_ENABLE_DEPLOY === 'true';
      const rootDir = context.rootDir || options.rootDir;
      const environment = env.AUTOMATION_DEPLOY_ENVIRONMENT || 'unspecified';
      const provider = (env.AUTOMATION_DEPLOY_PROVIDER || 'custom').trim() || 'custom';
      const target = (env.AUTOMATION_DEPLOY_TARGET || environment).trim() || 'unspecified';
      const resolvedDeployAction = resolveDeployAction({
        rootDir,
        env,
        provider,
        target,
      });

      if (!enabled || resolvedDeployAction.kind === 'unresolved') {
        return {
          status: 'skipped',
          notes: [
            `${definition.name} is connected, but deployment is gated.`,
            'Set AUTOMATION_ENABLE_DEPLOY=true and AUTOMATION_DEPLOY_COMMAND to enable it, or enable AUTOMATION_DEPLOY_USE_PROVIDER_PRESET=true for a supported repo-local provider preset.',
            resolvedDeployAction.note,
          ]
            .filter(Boolean)
            .join(' '),
        };
      }

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
      let providerRun: ProviderRunDetails | undefined;

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
            commandSource: resolvedDeployAction.source,
            provider,
            target,
            environment,
            workingDirectory,
            approval: approval.details,
            steps,
            rollbackAttempted,
            providerRun,
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
          commandSource: resolvedDeployAction.source,
          provider,
          target,
          environment,
          workingDirectory,
          approval: approval.details,
          steps,
          rollbackAttempted,
          providerRun,
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
            providerRun,
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
            commandSource: resolvedDeployAction.source,
            provider,
            target,
            environment,
            workingDirectory,
            approval: approval.details,
            steps,
            rollbackAttempted,
            providerRun,
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

      const deployExecution =
        resolvedDeployAction.kind === 'command'
          ? {
              step: runDeploymentCommand({
                name: 'deploy',
                command: resolvedDeployAction.command,
                cwd: workingDirectory,
                env,
              }),
              providerRun: undefined,
            }
          : await runWorkflowDispatchDeploy({
              env,
              rootDir,
              action: resolvedDeployAction,
              octokitFactory: options.octokitFactory,
              log: (message) => context.logger.info(message),
            });
      const deployResult = deployExecution.step;
      providerRun = deployExecution.providerRun;
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
          commandSource: resolvedDeployAction.source,
          provider,
          target,
          environment,
          workingDirectory,
          approval: approval.details,
          steps,
          rollbackAttempted,
          providerRun,
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
            commandSource: resolvedDeployAction.source,
            provider,
            target,
            environment,
            workingDirectory,
            approval: approval.details,
            steps,
            rollbackAttempted,
            providerRun,
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
        commandSource: resolvedDeployAction.source,
        provider,
        target,
        environment,
        workingDirectory,
        approval: approval.details,
        steps,
        rollbackAttempted,
        providerRun,
      });

      return {
        status: 'completed',
        notes: [
          `${definition.name} completed deployment contract for ${provider}/${target} in ${environment} at ${describeWorkingDirectory(
            rootDir,
            workingDirectory,
            env,
          )}.`,
          resolvedDeployAction.note,
          approval.details.summary,
          preflightResult ? formatStepSummary(preflightResult) : 'No preflight command was configured.',
          buildResult ? formatStepSummary(buildResult) : 'No build command was configured.',
          formatStepSummary(deployResult),
          providerRun ? providerRun.summary : undefined,
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
        ]
          .filter(Boolean)
          .join(' '),
        output: {
          commandSource: resolvedDeployAction.source,
          provider,
          target,
          environment,
          workingDirectory,
          approval: approval.details,
          steps,
          rollbackAttempted,
          providerRun,
          artifact,
        },
      };
    },
  };
}

function resolveDeployAction(params: {
  rootDir: string;
  env: NodeJS.ProcessEnv;
  provider: string;
  target: string;
}): ResolvedDeployAction {
  const explicit = (params.env.AUTOMATION_DEPLOY_COMMAND || '').trim();
  if (explicit) {
    return {
      kind: 'command',
      command: explicit,
      source: 'explicit',
      note: 'Deploy command source: explicit AUTOMATION_DEPLOY_COMMAND.',
    };
  }

  if (params.env.AUTOMATION_DEPLOY_USE_PROVIDER_PRESET === 'true') {
    return resolveProviderPresetAction(params);
  }

  return {
    kind: 'unresolved',
    source: 'unresolved',
    note: 'No deploy command was resolved. Provide AUTOMATION_DEPLOY_COMMAND or enable AUTOMATION_DEPLOY_USE_PROVIDER_PRESET=true for a supported provider preset.',
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

function resolveProviderPresetAction(params: {
  rootDir: string;
  env: NodeJS.ProcessEnv;
  provider: string;
  target: string;
}): ResolvedDeployAction {
  if (params.provider === 'cloud-run') {
    if (!['backend', 'frontend'].includes(params.target)) {
      return {
        kind: 'unresolved',
        source: 'unresolved',
        note: `Provider preset is enabled, but no repo-local preset exists for ${params.provider}/${params.target}.`,
      };
    }

    const wrapperPath = path.join(params.rootDir, 'scripts', 'automation', 'deploy', 'cloud-run.sh');
    return {
      kind: 'command',
      command: `bash ${shellEscape(wrapperPath)} ${shellEscape(params.target)}`,
      source: 'cloud-run-preset',
      note: `Deploy command source: repo-local cloud-run preset for target=${params.target}.`,
    };
  }

  if (params.provider === 'github-pages') {
    if (!GITHUB_PAGES_TARGETS.has(params.target)) {
      return {
        kind: 'unresolved',
        source: 'unresolved',
        note: `GitHub Pages preset currently supports targets: ${Array.from(GITHUB_PAGES_TARGETS).join(', ')}.`,
      };
    }

    if (params.env.AUTOMATION_GITHUB_PAGES_ENABLED !== 'true') {
      return {
        kind: 'unresolved',
        source: 'unresolved',
        note: 'GitHub Pages preset requires AUTOMATION_GITHUB_PAGES_ENABLED=true so the runtime does not report a skipped Pages workflow as a successful deploy.',
      };
    }

    const workflowId = (params.env.AUTOMATION_GITHUB_PAGES_WORKFLOW || 'deploy-pages.yml').trim() || 'deploy-pages.yml';
    const ref = resolveWorkflowDispatchRef(params.rootDir, params.env);
    return {
      kind: 'workflow-dispatch',
      source: 'github-pages-preset',
      note: `Deploy command source: repo-local github-pages preset for target=${params.target} via workflow_dispatch ${workflowId} on ref=${ref}.`,
      workflowId,
      ref,
      inputs: {},
      waitForRun: resolveBooleanEnv(params.env.AUTOMATION_GITHUB_PAGES_WAIT_FOR_RUN, true),
      timeoutMs: resolveBoundedIntegerEnv(
        params.env.AUTOMATION_GITHUB_PAGES_RUN_TIMEOUT_MS,
        DEFAULT_PROVIDER_RUN_TIMEOUT_MS,
        10_000,
        60 * 60 * 1000,
      ),
      pollIntervalMs: resolveBoundedIntegerEnv(
        params.env.AUTOMATION_GITHUB_PAGES_POLL_INTERVAL_MS,
        DEFAULT_PROVIDER_RUN_POLL_INTERVAL_MS,
        1_000,
        60_000,
      ),
    };
  }

  return {
    kind: 'unresolved',
    source: 'unresolved',
    note: `Provider preset is enabled, but no repo-local preset exists for ${params.provider}/${params.target}.`,
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
  name: DeploymentStepName;
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

async function runWorkflowDispatchDeploy(params: {
  env: NodeJS.ProcessEnv;
  rootDir: string;
  action: Extract<ResolvedDeployAction, { kind: 'workflow-dispatch' }>;
  octokitFactory?: (token: string) => DeploymentOctokitLike;
  log?: (message: string) => void;
}): Promise<WorkflowDispatchDeployResult> {
  const token = resolveGitHubToken(params.env);
  const dispatchCommand = `workflow_dispatch ${params.action.workflowId} @ ${params.action.ref}`;

  if (!token) {
    return {
      step: {
        name: 'deploy',
        command: dispatchCommand,
        passed: false,
        exitCode: 1,
        summary: 'GitHub token is required to dispatch the provider workflow preset.',
        attemptsUsed: 1,
      },
      providerRun: {
        workflowId: params.action.workflowId,
        ref: params.action.ref,
        status: 'unknown',
        waited: false,
        summary: 'GitHub token is required to dispatch the provider workflow preset.',
      },
    };
  }

  const repository = resolveRepositoryContext(
    params.env.GITHUB_REPOSITORY || params.env.REPOSITORY || process.env.GITHUB_REPOSITORY,
  );
  const octokit = params.octokitFactory ? params.octokitFactory(token) : new Octokit({ auth: token });
  const requestedAtMs = Date.now();

  try {
    await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
      owner: repository.owner,
      repo: repository.repo,
      workflow_id: params.action.workflowId,
      ref: params.action.ref,
      inputs: params.action.inputs,
    });
  } catch (error) {
    const summary = `Failed to dispatch provider workflow ${params.action.workflowId}: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return {
      step: {
        name: 'deploy',
        command: dispatchCommand,
        passed: false,
        exitCode: 1,
        summary,
        attemptsUsed: 1,
      },
      providerRun: {
        workflowId: params.action.workflowId,
        ref: params.action.ref,
        status: 'unknown',
        waited: false,
        summary,
      },
    };
  }

  const requestedSummary = `Workflow dispatch requested for ${params.action.workflowId} on ref=${params.action.ref}.`;

  if (!params.action.waitForRun) {
    return {
      step: {
        name: 'deploy',
        command: dispatchCommand,
        passed: true,
        exitCode: 0,
        summary: requestedSummary,
        attemptsUsed: 1,
      },
      providerRun: {
        workflowId: params.action.workflowId,
        ref: params.action.ref,
        status: 'requested',
        waited: false,
        summary: requestedSummary,
      },
    };
  }

  params.log?.(`Waiting for provider workflow ${params.action.workflowId} on ref=${params.action.ref}.`);
  const awaited = await waitForWorkflowRunCompletion({
    octokit,
    owner: repository.owner,
    repo: repository.repo,
    workflowId: params.action.workflowId,
    ref: params.action.ref,
    requestedAtMs,
    timeoutMs: params.action.timeoutMs,
    pollIntervalMs: params.action.pollIntervalMs,
  });

  return {
    step: {
      name: 'deploy',
      command: dispatchCommand,
      passed: awaited.passed,
      exitCode: awaited.passed ? 0 : 1,
      summary: awaited.providerRun.summary,
      attemptsUsed: 1,
    },
    providerRun: awaited.providerRun,
  };
}

async function waitForWorkflowRunCompletion(params: {
  octokit: DeploymentOctokitLike;
  owner: string;
  repo: string;
  workflowId: string;
  ref: string;
  requestedAtMs: number;
  timeoutMs: number;
  pollIntervalMs: number;
}): Promise<{ passed: boolean; providerRun: ProviderRunDetails }> {
  const startedAt = Date.now();
  let runId: number | undefined;
  let runUrl: string | undefined;

  while (Date.now() - startedAt <= params.timeoutMs) {
    if (!runId) {
      const listResponse = (await params.octokit.request(
        'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
        {
          owner: params.owner,
          repo: params.repo,
          workflow_id: params.workflowId,
          branch: params.ref,
          event: 'workflow_dispatch',
          per_page: 20,
        },
      )) as { data: { workflow_runs?: WorkflowRunLike[] } };
      const candidate = selectWorkflowRunCandidate(listResponse.data.workflow_runs || [], params.ref, params.requestedAtMs);
      if (candidate) {
        runId = candidate.id;
        runUrl = candidate.html_url;
      }
    }

    if (runId) {
      const currentResponse = (await params.octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', {
        owner: params.owner,
        repo: params.repo,
        run_id: runId,
      })) as { data: WorkflowRunLike };
      const current = currentResponse.data;
      const status = normalizeWorkflowRunStatus(current.status);
      const summaryBase = `Provider workflow ${params.workflowId} run #${current.id}${
        current.html_url ? ` (${current.html_url})` : ''
      }`;

      if (status === 'completed') {
        const conclusion = current.conclusion || 'unknown';
        const passed = conclusion === 'success';
        return {
          passed,
          providerRun: {
            workflowId: params.workflowId,
            ref: params.ref,
            runId: current.id,
            runUrl: current.html_url || runUrl,
            status,
            conclusion: current.conclusion,
            waited: true,
            summary: passed
              ? `${summaryBase} completed successfully.`
              : `${summaryBase} completed with conclusion=${conclusion}.`,
          },
        };
      }
    }

    await sleep(params.pollIntervalMs);
  }

  if (runId) {
    return {
      passed: false,
      providerRun: {
        workflowId: params.workflowId,
        ref: params.ref,
        runId,
        runUrl,
        status: 'in_progress' as const,
        waited: true,
        summary: `Provider workflow ${params.workflowId} run #${runId}${
          runUrl ? ` (${runUrl})` : ''
        } did not complete within ${params.timeoutMs}ms.`,
      },
    };
  }

  return {
    passed: false,
      providerRun: {
        workflowId: params.workflowId,
        ref: params.ref,
        status: 'requested' as const,
        waited: true,
        summary: `Provider workflow ${params.workflowId} was dispatched, but no matching workflow run was observed within ${params.timeoutMs}ms.`,
      },
    };
  }

function selectWorkflowRunCandidate(runs: WorkflowRunLike[], ref: string, requestedAtMs: number) {
  return runs
    .filter((run) => {
      if (run.head_branch !== ref) {
        return false;
      }
      if (!run.created_at) {
        return false;
      }

      return new Date(run.created_at).getTime() >= requestedAtMs - 60_000;
    })
    .sort((left, right) => {
      const leftMs = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightMs = right.created_at ? new Date(right.created_at).getTime() : 0;
      return rightMs - leftMs;
    })[0];
}

function normalizeWorkflowRunStatus(status?: string): ProviderRunDetails['status'] {
  if (status === 'queued' || status === 'in_progress' || status === 'completed') {
    return status;
  }
  if (status === 'requested' || status === 'waiting' || status === 'pending') {
    return 'requested';
  }

  return 'unknown';
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

async function sleep(delayMs: number) {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
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
  commandSource: string;
  provider: string;
  target: string;
  environment: string;
  workingDirectory: string;
  approval: DeploymentApprovalDetails;
  steps: DeploymentStepResult[];
  rollbackAttempted: boolean;
  providerRun?: ProviderRunDetails;
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
    commandSource: params.commandSource,
    provider: params.provider,
    target: params.target,
    environment: params.environment,
    workingDirectory: params.workingDirectory,
    approval: params.approval,
    steps: params.steps,
    rollbackAttempted: params.rollbackAttempted,
    providerRun: params.providerRun,
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
- Command source: ${payload.commandSource}
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

## Provider Run
- Workflow: ${payload.providerRun?.workflowId || 'n/a'}
- Ref: ${payload.providerRun?.ref || 'n/a'}
- Run ID: ${payload.providerRun?.runId || 'n/a'}
- Run URL: ${payload.providerRun?.runUrl || 'n/a'}
- Status: ${payload.providerRun?.status || 'n/a'}
- Conclusion: ${payload.providerRun?.conclusion || 'n/a'}
- Waited: ${payload.providerRun ? (payload.providerRun.waited ? 'yes' : 'no') : 'n/a'}
- Summary: ${payload.providerRun?.summary || 'n/a'}

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

function resolveBooleanEnv(rawValue: string | undefined, fallback: boolean) {
  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function resolveBoundedIntegerEnv(rawValue: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(rawValue || '', 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function resolveWorkflowDispatchRef(rootDir: string, env: NodeJS.ProcessEnv) {
  const configured = (env.AUTOMATION_GITHUB_PAGES_REF || env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || '').trim();
  if (configured) {
    return configured;
  }

  const currentBranch = runGit(['branch', '--show-current'], rootDir);
  if (currentBranch && currentBranch !== 'HEAD') {
    return currentBranch;
  }

  const remoteHead = runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], rootDir);
  if (remoteHead?.startsWith('origin/')) {
    return remoteHead.slice('origin/'.length);
  }

  return 'develop';
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

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
