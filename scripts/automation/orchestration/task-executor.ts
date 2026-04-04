import type { AutomationLogger } from '../core/logger.js';
import type { DecomposedTask } from '../decomposition/llm-decomposer.js';
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
  dryRun: boolean;
  logger: AutomationLogger;
  worktrees: Map<string, WorktreeAssignment>;
  agentRegistry?: AgentRegistry;
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
      worktrees: Map<string, WorktreeAssignment>;
      agentRegistry?: AgentRegistry;
    },
    runner?: TaskExecutionRunner,
  ): Promise<ExecutionReport> {
    const startTime = Date.now();
    const taskMap = new Map(params.tasks.map((task) => [task.id, task]));
    const records: TaskExecutionRecord[] = [];
    const context: TaskExecutionContext = {
      sessionId: params.sessionId,
      issueNumber: params.issueNumber,
      dryRun: this.dryRun,
      logger: params.logger,
      worktrees: params.worktrees,
      agentRegistry: params.agentRegistry,
    };

    for (const [index, level] of params.levels.entries()) {
      params.logger.info(
        `Executing level ${index + 1}/${params.levels.length} (${level.length} tasks, concurrency: ${Math.min(
          level.length,
          this.concurrency,
        )})`,
      );

      const levelTasks = level.map((taskId) => taskMap.get(taskId)).filter((task): task is DecomposedTask => Boolean(task));
      const levelRecords = await this.executeLevel(levelTasks, context, runner);
      records.push(...levelRecords);
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
      executionMode: this.dryRun || !runner ? 'planning' : 'execute',
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
    runner?: TaskExecutionRunner,
  ) {
    const results: TaskExecutionRecord[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor];
        cursor += 1;
        results.push(await this.executeTask(task, context, runner));
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
    runner?: TaskExecutionRunner,
  ): Promise<TaskExecutionRecord> {
    const startedAt = Date.now();
    const worktree = context.worktrees.get(task.id);

    if (!runner || context.dryRun) {
      const agentNote = describeAgentForTask(task, context.agentRegistry);
      return {
        taskId: task.id,
        title: task.title,
        agentType: task.agent,
        status: 'planned',
        startedAt,
        endedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        notes: [context.dryRun
          ? 'Dry-run mode: execution was planned but not performed.'
          : 'Planning mode: no task runner is configured yet.', agentNote]
          .filter(Boolean)
          .join(' '),
        worktreePath: worktree?.worktreePath,
      };
    }

    try {
      const outcome = await runner(task, context);
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
}
