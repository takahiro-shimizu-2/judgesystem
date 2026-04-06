import * as fs from 'fs';
import * as path from 'path';

import type { LogLevel } from '../core/logger.js';
import { AutomationLogger } from '../core/logger.js';
import { ensureDirectory } from '../core/utils.js';
import { createAgentRegistry, type AgentRegistry } from '../agents/registry.js';
import { LLMDecomposer, type AutomationIssue } from '../decomposition/llm-decomposer.js';
import { validateTaskDecomposition } from '../decomposition/decomposition-validator.js';
import {
  buildStrategicPlanMarkdown,
  createOmegaPlanningLayer,
  type OmegaPlanningLayer,
} from '../omega/understanding.js';
import {
  buildOmegaDeliverable,
  buildOmegaLearningArtifact,
  loadLatestOmegaLearningContext,
} from '../omega/integration.js';
import { buildTaskDag, type TaskDag } from './dag-manager.js';
import { buildLivingPlanMarkdown } from '../planning/plans-generator.js';
import { buildGitNexusRuntimeArtifact } from '../gitnexus/runtime-context.js';
import {
  findGitNexusTaskBinding,
  type GitNexusRuntimeArtifact,
} from '../gitnexus/runtime-contract.js';
import { TaskExecutor, type ExecutionReport, type TaskExecutionRunner } from './task-executor.js';
import { WorktreeCoordinator, type WorktreeAssignment } from './worktree-coordinator.js';

export interface ExecutionPlan {
  sessionId: string;
  createdAt: string;
  issue: AutomationIssue;
  omega: OmegaPlanningLayer;
  strategy: 'llm' | 'heuristic';
  tasks: ReturnType<typeof validateTaskDecomposition>['tasks'];
  warnings: string[];
  dag: TaskDag;
  concurrency: number;
  dryRun: boolean;
  worktrees: WorktreeAssignment[];
  gitnexus: GitNexusRuntimeArtifact;
}

export interface TaskManagerOptions {
  rootDir?: string;
  concurrency?: number;
  dryRun?: boolean;
  useWorktree?: boolean;
  autoCleanupWorktrees?: boolean;
  logLevel?: LogLevel;
  deviceIdentifier?: string;
  gitnexusRootDir?: string;
  gitnexusRepo?: string;
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
    plansPath: string;
    intentPath: string;
    strategicPlanPath: string;
    deliverablePath: string;
    learningPath: string;
    gitnexusPath: string;
    logPath: string;
  };
}

export class TaskManager {
  private readonly rootDir: string;
  private readonly concurrency: number;
  private readonly dryRun: boolean;
  private readonly useWorktree: boolean;
  private readonly autoCleanupWorktrees: boolean;
  private readonly logLevel: LogLevel;
  private readonly deviceIdentifier: string;
  private readonly gitnexusRootDir: string;
  private readonly gitnexusRepo: string;
  private readonly decomposer: LLMDecomposer;
  private readonly taskRunner?: TaskExecutionRunner;
  private readonly agentRegistry: AgentRegistry;

  constructor(options: TaskManagerOptions = {}, dependencies: TaskManagerDependencies = {}) {
    this.rootDir = options.rootDir ?? process.cwd();
    this.concurrency = options.concurrency ?? 2;
    this.dryRun = options.dryRun ?? false;
    this.useWorktree = options.useWorktree ?? false;
    this.autoCleanupWorktrees = options.autoCleanupWorktrees ?? false;
    this.logLevel = options.logLevel ?? 'info';
    this.deviceIdentifier = options.deviceIdentifier ?? 'local-runner';
    this.gitnexusRootDir = options.gitnexusRootDir ?? process.cwd();
    this.gitnexusRepo = options.gitnexusRepo ?? process.env.AUTOMATION_GITNEXUS_REPO ?? 'judgesystem';
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
    const worktreeCoordinator = new WorktreeCoordinator({
      rootDir: this.rootDir,
      useWorktree: this.useWorktree,
      createDirectories: true,
      autoCleanup: this.autoCleanupWorktrees,
    });
    const plan = await this.createExecutionPlan(issue, logger, worktreeCoordinator);
    if (!this.dryRun) {
      plan.worktrees = worktreeCoordinator.materializeAssignments(plan.worktrees);
    }
    const worktrees = new Map(plan.worktrees.map((assignment) => [assignment.taskId, assignment]));
    const gitnexusArtifactPath = path.join(
      ensureDirectory(path.join(this.rootDir, '.ai', 'parallel-reports')),
      `gitnexus-runtime-${plan.sessionId}.json`,
    );

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
        rootDir: this.rootDir,
        env: process.env,
        worktrees,
        agentRegistry: this.agentRegistry,
        gitnexusArtifactPath,
        gitnexusTaskBindings: new Map(plan.gitnexus.taskBindings.map((binding) => [binding.taskId, binding])),
      },
      this.taskRunner,
    );

    let artifactPaths = this.writeArtifacts(plan, report, logger);
    if (!this.dryRun) {
      const cleanedAssignments = worktreeCoordinator.cleanupAssignments(plan.worktrees);
      const cleanedCount = cleanedAssignments.filter((assignment) => assignment.lifecycle === 'cleaned').length;
      if (cleanedCount > 0) {
        logger.info(`Auto-cleaned ${cleanedCount} git worktree(s) after execution.`);
      }
      plan.worktrees = cleanedAssignments;
      if (cleanedCount > 0) {
        artifactPaths = this.writeArtifacts(plan, report, logger);
      }
    }
    logger.info(
      `Orchestration complete: ${report.summary.completed}/${report.summary.total} tasks completed, ${report.summary.planned} planned`,
    );

    return {
      plan,
      report,
      artifactPaths,
    };
  }

  private async createExecutionPlan(
    issue: AutomationIssue,
    logger: AutomationLogger,
    worktreeCoordinator: WorktreeCoordinator,
  ): Promise<ExecutionPlan> {
    const sessionId = `session-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const previousLearning = loadLatestOmegaLearningContext({
      rootDir: this.rootDir,
      issueNumber: issue.number,
      excludeSessionId: sessionId,
    });
    logger.info(`Building Omega understanding for Issue #${issue.number}`);
    const omega = createOmegaPlanningLayer(issue, {
      dryRun: this.dryRun,
      previousLearning,
    });
    logger.info(
      `Omega intent captured with ${omega.intent.goals.length} goal(s) and ${omega.strategicPlan.phases.length} strategic phase(s)`,
    );

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

    const concurrency = Math.max(1, Math.min(this.concurrency, Math.max(1, dag.maxParallelism), 5));
    const worktrees = worktreeCoordinator.planAssignments(issue.number, validated.tasks);
    logger.info('Capturing mandatory GitNexus runtime context');
    const gitnexus = buildGitNexusRuntimeArtifact({
      gitnexusRootDir: this.gitnexusRootDir,
      repo: this.gitnexusRepo,
      issue,
      tasks: validated.tasks,
      sessionId,
      logger,
    });

    for (const task of validated.tasks) {
      if (!findGitNexusTaskBinding(gitnexus, task.id)) {
        throw new Error(`GitNexus runtime context did not create a task binding for ${task.id}.`);
      }
    }

    return {
      sessionId,
      createdAt,
      issue,
      omega,
      strategy: decomposition.strategy,
      tasks: validated.tasks,
      warnings,
      dag,
      concurrency,
      dryRun: this.dryRun,
      worktrees,
      gitnexus,
    };
  }

  private writeArtifacts(
    plan: ExecutionPlan,
    report: ExecutionReport,
    logger: AutomationLogger,
  ): TaskManagerRunResult['artifactPaths'] {
    const aiRoot = ensureDirectory(path.join(this.rootDir, '.ai'));
    const reportsDir = ensureDirectory(path.join(aiRoot, 'parallel-reports'));
    const planPath = path.join(reportsDir, `execution-plan-${plan.sessionId}.json`);
    const reportPath = path.join(reportsDir, `agents-parallel-${plan.sessionId}.json`);
    const plansPath = path.join(reportsDir, `plans-${plan.sessionId}.md`);
    const intentPath = path.join(reportsDir, `omega-intent-${plan.sessionId}.json`);
    const strategicPlanPath = path.join(reportsDir, `strategic-plan-${plan.sessionId}.md`);
    const deliverablePath = path.join(reportsDir, `omega-deliverable-${plan.sessionId}.json`);
    const learningPath = path.join(reportsDir, `omega-learning-${plan.sessionId}.json`);
    const gitnexusPath = path.join(reportsDir, `gitnexus-runtime-${plan.sessionId}.json`);

    fs.writeFileSync(
      planPath,
      JSON.stringify(
        {
          sessionId: plan.sessionId,
          createdAt: plan.createdAt,
          issue: plan.issue,
          omega: plan.omega,
          strategy: plan.strategy,
          concurrency: plan.concurrency,
          dryRun: plan.dryRun,
          warnings: plan.warnings,
          gitnexus: plan.gitnexus,
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
    fs.writeFileSync(intentPath, JSON.stringify(plan.omega.intent, null, 2), 'utf8');
    fs.writeFileSync(gitnexusPath, JSON.stringify(plan.gitnexus, null, 2), 'utf8');

    const artifactPaths = {
      planPath,
      reportPath,
      plansPath,
      intentPath,
      strategicPlanPath,
      deliverablePath,
      learningPath,
      gitnexusPath,
      logPath: logger.getLogFilePath(),
    };

    const deliverable = buildOmegaDeliverable({
      rootDir: this.rootDir,
      plan,
      report,
      artifactPaths,
    });
    const learning = buildOmegaLearningArtifact({
      deliverable,
      plan,
      report,
    });

    fs.writeFileSync(deliverablePath, JSON.stringify(deliverable, null, 2), 'utf8');
    fs.writeFileSync(learningPath, JSON.stringify(learning, null, 2), 'utf8');
    fs.writeFileSync(
      strategicPlanPath,
      buildStrategicPlanMarkdown({
        sessionId: plan.sessionId,
        createdAt: plan.createdAt,
        issue: plan.issue,
        planning: plan.omega,
      }),
      'utf8',
    );
    fs.writeFileSync(
      plansPath,
      `${buildLivingPlanMarkdown({
        rootDir: this.rootDir,
        plan,
        report,
        artifactPaths,
        deliverable,
        learning,
      })}\n`,
      'utf8',
    );

    return artifactPaths;
  }
}
