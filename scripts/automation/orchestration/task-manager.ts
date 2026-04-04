import * as fs from 'fs';
import * as path from 'path';

import type { LogLevel } from '../core/logger.js';
import { AutomationLogger } from '../core/logger.js';
import { ensureDirectory } from '../core/utils.js';
import { createAgentRegistry, type AgentRegistry } from '../agents/registry.js';
import { LLMDecomposer, type AutomationIssue } from '../decomposition/llm-decomposer.js';
import { validateTaskDecomposition } from '../decomposition/decomposition-validator.js';
import { buildTaskDag, type TaskDag } from './dag-manager.js';
import { TaskExecutor, type ExecutionReport, type TaskExecutionRunner } from './task-executor.js';
import { WorktreeCoordinator, type WorktreeAssignment } from './worktree-coordinator.js';

export interface ExecutionPlan {
  sessionId: string;
  createdAt: string;
  issue: AutomationIssue;
  strategy: 'llm' | 'heuristic';
  tasks: ReturnType<typeof validateTaskDecomposition>['tasks'];
  warnings: string[];
  dag: TaskDag;
  concurrency: number;
  dryRun: boolean;
  worktrees: WorktreeAssignment[];
}

export interface TaskManagerOptions {
  rootDir?: string;
  concurrency?: number;
  dryRun?: boolean;
  useWorktree?: boolean;
  logLevel?: LogLevel;
  deviceIdentifier?: string;
}

export interface TaskManagerDependencies {
  decomposer?: LLMDecomposer;
  taskRunner?: TaskExecutionRunner;
  agentRegistry?: AgentRegistry;
}

export interface TaskManagerRunResult {
  plan: ExecutionPlan;
  report: ExecutionReport;
  artifactPaths: {
    planPath: string;
    reportPath: string;
    logPath: string;
  };
}

export class TaskManager {
  private readonly rootDir: string;
  private readonly concurrency: number;
  private readonly dryRun: boolean;
  private readonly useWorktree: boolean;
  private readonly logLevel: LogLevel;
  private readonly deviceIdentifier: string;
  private readonly decomposer: LLMDecomposer;
  private readonly taskRunner?: TaskExecutionRunner;
  private readonly agentRegistry: AgentRegistry;

  constructor(options: TaskManagerOptions = {}, dependencies: TaskManagerDependencies = {}) {
    this.rootDir = options.rootDir ?? process.cwd();
    this.concurrency = options.concurrency ?? 2;
    this.dryRun = options.dryRun ?? false;
    this.useWorktree = options.useWorktree ?? false;
    this.logLevel = options.logLevel ?? 'info';
    this.deviceIdentifier = options.deviceIdentifier ?? 'local-runner';
    this.decomposer = dependencies.decomposer ?? new LLMDecomposer();
    this.taskRunner = dependencies.taskRunner;
    this.agentRegistry = dependencies.agentRegistry ?? createAgentRegistry({ rootDir: this.rootDir });
  }

  async runIssue(issue: AutomationIssue): Promise<TaskManagerRunResult> {
    const logger = new AutomationLogger('CoordinatorAgent', {
      level: this.logLevel,
      rootDir: this.rootDir,
      writeToFile: true,
    });
    const plan = await this.createExecutionPlan(issue, logger);
    const worktrees = new Map(plan.worktrees.map((assignment) => [assignment.taskId, assignment]));

    logger.info('Starting orchestration execution');
    const executor = new TaskExecutor({
      concurrency: plan.concurrency,
      dryRun: plan.dryRun,
      deviceIdentifier: this.deviceIdentifier,
    });
    const report = await executor.execute(
      {
        sessionId: plan.sessionId,
        issueNumber: issue.number,
        levels: plan.dag.levels,
        tasks: plan.tasks,
        warnings: plan.warnings,
        edges: plan.dag.edges.length,
        logger,
        worktrees,
        agentRegistry: this.agentRegistry,
      },
      this.taskRunner,
    );

    const artifactPaths = this.writeArtifacts(plan, report, logger);
    logger.info(
      `Orchestration complete: ${report.summary.completed}/${report.summary.total} tasks completed, ${report.summary.planned} planned`,
    );

    return {
      plan,
      report,
      artifactPaths,
    };
  }

  private async createExecutionPlan(issue: AutomationIssue, logger: AutomationLogger): Promise<ExecutionPlan> {
    logger.info(`Decomposing Issue #${issue.number}`);
    const decomposition = await this.decomposer.decomposeIssue(issue);
    logger.info(`Found ${decomposition.tasks.length} task candidates`);

    const validated = validateTaskDecomposition(decomposition);
    if (!validated.valid) {
      throw new Error(validated.errors.join('\n'));
    }

    const warnings = [...validated.warnings, ...this.agentRegistry.warnings];

    logger.info('Building task dependency graph (DAG)');
    const dag = buildTaskDag(validated.tasks);
    logger.info(`Graph: ${dag.nodes.length} nodes, ${dag.edges.length} edges, ${dag.levels.length} levels`);

    if (dag.hasCycles) {
      throw new Error(`Cycle detected in task graph: ${JSON.stringify(dag.cyclePaths)}`);
    }

    logger.info('No circular dependencies found');

    const sessionId = `session-${Date.now()}`;
    const concurrency = Math.max(1, Math.min(this.concurrency, Math.max(1, dag.maxParallelism), 5));
    const worktrees = new WorktreeCoordinator({
      rootDir: this.rootDir,
      useWorktree: this.useWorktree,
      createDirectories: true,
    }).planAssignments(issue.number, validated.tasks);

    return {
      sessionId,
      createdAt: new Date().toISOString(),
      issue,
      strategy: decomposition.strategy,
      tasks: validated.tasks,
      warnings,
      dag,
      concurrency,
      dryRun: this.dryRun,
      worktrees,
    };
  }

  private writeArtifacts(plan: ExecutionPlan, report: ExecutionReport, logger: AutomationLogger) {
    const aiRoot = ensureDirectory(path.join(this.rootDir, '.ai'));
    const reportsDir = ensureDirectory(path.join(aiRoot, 'parallel-reports'));
    const planPath = path.join(reportsDir, `execution-plan-${plan.sessionId}.json`);
    const reportPath = path.join(reportsDir, `agents-parallel-${plan.sessionId}.json`);

    fs.writeFileSync(
      planPath,
      JSON.stringify(
        {
          sessionId: plan.sessionId,
          createdAt: plan.createdAt,
          issue: plan.issue,
          strategy: plan.strategy,
          concurrency: plan.concurrency,
          dryRun: plan.dryRun,
          warnings: plan.warnings,
          dag: {
            nodes: plan.dag.nodes,
            edges: plan.dag.edges,
            levels: plan.dag.levels,
          },
          worktrees: plan.worktrees,
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    return {
      planPath,
      reportPath,
      logPath: logger.getLogFilePath(),
    };
  }
}
