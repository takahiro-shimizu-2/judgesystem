import type { AutomationLogger } from '../core/logger.js';
import type { DecomposedTask } from '../decomposition/llm-decomposer.js';
import type { GitNexusTaskBinding } from '../gitnexus/runtime-contract.js';
import { executeTaskWithAgent } from '../agents/capability-router.js';
import type { AutomationAgentHandlerResult } from '../agents/handler-contract.js';
import type { AgentRegistry } from '../agents/registry.js';
import { describeAgentForTask } from '../agents/registry.js';
import type { WorktreeAssignment } from './worktree-coordinator.js';

export type TaskExecutionStatus = 'planned' | 'completed' | 'failed' | 'skipped';

export interface TaskExecutionOutcome {
  status?: Exclude<TaskExecutionStatus, 'failed'>;
  notes?: string;
  output?: unknown;
}

export interface TaskExecutionRecord {
  taskId: string;
  title: string;
  agentType: DecomposedTask['agent'];
  status: TaskExecutionStatus;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  notes?: string;
  error?: string;
  worktreePath?: string;
}

export interface ExecutionReport {
  sessionId: string;
  issueNumber: number;
  deviceIdentifier: string;
  executionMode: 'planning' | 'execute';
  startTime: number;
  endTime: number;
  totalDurationMs: number;
  summary: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    planned: number;
    successRate: number;
  };
  graph: {
    nodes: number;
    edges: number;
    levels: number;
  };
  tasks: TaskExecutionRecord[];
  warnings: string[];
}

export interface TaskExecutionContext {
  sessionId: string;
  issueNumber: number;
  rootDir: string;
  dryRun: boolean;
  logger: AutomationLogger;
  env: NodeJS.ProcessEnv;
  worktrees: Map<string, WorktreeAssignment>;
  worktree?: WorktreeAssignment;
  agentRegistry?: AgentRegistry;
  gitnexusArtifactPath?: string;
  gitnexusTaskBindings: Map<string, GitNexusTaskBinding>;
  gitnexusTaskBinding?: GitNexusTaskBinding;
}

export type TaskExecutionRunner = (
  task: DecomposedTask,
  context: TaskExecutionContext,
) => Promise<TaskExecutionOutcome>;

export interface TaskExecutorOptions {
  concurrency: number;
  dryRun: boolean;
  deviceIdentifier: string;
}

export class TaskExecutor {
  private readonly concurrency: number;
  private readonly dryRun: boolean;
  private readonly deviceIdentifier: string;

  constructor(options: TaskExecutorOptions) {
    this.concurrency = Math.max(1, options.concurrency);
    this.dryRun = options.dryRun;
    this.deviceIdentifier = options.deviceIdentifier;
  }

  async execute(
    params: {
      sessionId: string;
      issueNumber: number;
      levels: string[][];
      tasks: DecomposedTask[];
      warnings: string[];
      edges: number;
      logger: AutomationLogger;
      rootDir: string;
      env: NodeJS.ProcessEnv;
      worktrees: Map<string, WorktreeAssignment>;
      agentRegistry?: AgentRegistry;
      gitnexusArtifactPath?: string;
      gitnexusTaskBindings: Map<string, GitNexusTaskBinding>;
    },
    runner?: TaskExecutionRunner,
  ): Promise<ExecutionReport> {
    const startTime = Date.now();
    const taskMap = new Map(params.tasks.map((task) => [task.id, task]));
    const records: TaskExecutionRecord[] = [];
    const dependencyStatuses = new Map<string, TaskExecutionStatus>();
    const context: TaskExecutionContext = {
      sessionId: params.sessionId,
      issueNumber: params.issueNumber,
      rootDir: params.rootDir,
      dryRun: this.dryRun,
      logger: params.logger,
      env: params.env,
      worktrees: params.worktrees,
      agentRegistry: params.agentRegistry,
      gitnexusArtifactPath: params.gitnexusArtifactPath,
      gitnexusTaskBindings: params.gitnexusTaskBindings,
    };

    for (const [index, level] of params.levels.entries()) {
      params.logger.info(
        `Executing level ${index + 1}/${params.levels.length} (${level.length} tasks, concurrency: ${Math.min(
          level.length,
          this.concurrency,
        )})`,
      );

      const levelTasks = level.map((taskId) => taskMap.get(taskId)).filter((task): task is DecomposedTask => Boolean(task));
      const levelRecords = await this.executeLevel(levelTasks, context, dependencyStatuses, runner);
      records.push(...levelRecords);
      for (const record of levelRecords) {
        dependencyStatuses.set(record.taskId, record.status);
      }
    }

    const endTime = Date.now();
    const completed = records.filter((record) => record.status === 'completed').length;
    const failed = records.filter((record) => record.status === 'failed').length;
    const skipped = records.filter((record) => record.status === 'skipped').length;
    const planned = records.filter((record) => record.status === 'planned').length;

    return {
      sessionId: params.sessionId,
      issueNumber: params.issueNumber,
      deviceIdentifier: this.deviceIdentifier,
      executionMode: this.dryRun ? 'planning' : 'execute',
      startTime,
      endTime,
      totalDurationMs: endTime - startTime,
      summary: {
        total: records.length,
        completed,
        failed,
        skipped,
        planned,
        successRate: records.length > 0 ? Number(((completed / records.length) * 100).toFixed(1)) : 0,
      },
      graph: {
        nodes: params.tasks.length,
        edges: params.edges,
        levels: params.levels.length,
      },
      tasks: records,
      warnings: [...new Set([...(params.agentRegistry?.warnings || []), ...params.warnings])],
    };
  }

  private async executeLevel(
    tasks: DecomposedTask[],
    context: TaskExecutionContext,
    dependencyStatuses: Map<string, TaskExecutionStatus>,
    runner?: TaskExecutionRunner,
  ) {
    const results: TaskExecutionRecord[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor];
        cursor += 1;
        results.push(await this.executeTask(task, context, dependencyStatuses, runner));
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, Math.max(1, tasks.length)) }, () => worker()),
    );

    return results;
  }

  private async executeTask(
    task: DecomposedTask,
    context: TaskExecutionContext,
    dependencyStatuses: Map<string, TaskExecutionStatus>,
    runner?: TaskExecutionRunner,
  ): Promise<TaskExecutionRecord> {
    const startedAt = Date.now();
    const worktree = context.worktrees.get(task.id);
    const gitnexusTaskBinding = context.gitnexusTaskBindings.get(task.id);
    const failedDependencies = task.dependencies.filter((dependencyId) => {
      const status = dependencyStatuses.get(dependencyId);
      return status === 'failed' || status === 'skipped';
    });

    if (!gitnexusTaskBinding) {
      const endedAt = Date.now();
      return {
        taskId: task.id,
        title: task.title,
        agentType: task.agent,
        status: 'failed',
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        error: `GitNexus task binding is missing for ${task.id}; planning must create GitNexus runtime context before execution.`,
        worktreePath: worktree?.worktreePath,
      };
    }

    if (context.dryRun) {
      const agentNote = describeAgentForTask(task, context.agentRegistry);
      return {
        taskId: task.id,
        title: task.title,
        agentType: task.agent,
        status: 'planned',
        startedAt,
        endedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        notes: ['Dry-run mode: execution was planned but not performed.', agentNote]
          .concat(gitnexusTaskBinding.notes[0] ? [`GitNexus: ${gitnexusTaskBinding.notes[0]}`] : [])
          .filter(Boolean)
          .join(' '),
        worktreePath: worktree?.worktreePath,
      };
    }

    if (failedDependencies.length > 0) {
      const endedAt = Date.now();
      return {
        taskId: task.id,
        title: task.title,
        agentType: task.agent,
        status: 'skipped',
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        notes: `Skipped because dependency task(s) did not complete successfully: ${failedDependencies.join(', ')}.`,
        worktreePath: worktree?.worktreePath,
      };
    }

    try {
      const outcome = await this.runTask(task, context, runner);
      const endedAt = Date.now();

      return {
        taskId: task.id,
        title: task.title,
        agentType: task.agent,
        status: outcome.status || 'completed',
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        notes: outcome.notes,
        worktreePath: worktree?.worktreePath,
      };
    } catch (error) {
      const endedAt = Date.now();

      return {
        taskId: task.id,
        title: task.title,
        agentType: task.agent,
        status: 'failed',
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        error: error instanceof Error ? error.message : String(error),
        worktreePath: worktree?.worktreePath,
      };
    }
  }

  private runTask(
    task: DecomposedTask,
    context: TaskExecutionContext,
    runner?: TaskExecutionRunner,
  ): Promise<TaskExecutionOutcome | AutomationAgentHandlerResult> {
    if (runner) {
      return runner(task, {
        ...context,
        worktree: context.worktrees.get(task.id),
        gitnexusTaskBinding: context.gitnexusTaskBindings.get(task.id),
      });
    }

    return executeTaskWithAgent(task, {
      ...context,
      worktree: context.worktrees.get(task.id),
      gitnexusTaskBinding: context.gitnexusTaskBindings.get(task.id),
    });
  }
}
