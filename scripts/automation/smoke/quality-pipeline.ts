import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { createAgentRegistry } from '../agents/registry.js';
import type { AutomationIssue, TaskDecomposition } from '../decomposition/llm-decomposer.js';
import { TaskManager } from '../orchestration/task-manager.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'judgesystem-quality-pipeline-'));
  const issue: AutomationIssue = {
    number: 801,
    title: 'Quality pipeline parity smoke',
    body: '- [ ] Implement the feature slice',
    labels: ['🤖 agent:coordinator', '🔍 state:analyzing'],
    url: 'https://example.invalid/issues/801',
  };
  const executions: Array<{
    taskId: string;
    agent: string;
    worktreePath?: string;
    status?: string;
    dependencies: string[];
  }> = [];

  try {
    initializeGitRepo(rootDir);

    const manager = new TaskManager(
      {
        rootDir,
        gitnexusRootDir: process.cwd(),
        dryRun: false,
        concurrency: 2,
        useWorktree: true,
        autoCleanupWorktrees: true,
        logLevel: 'error',
      },
      {
        decomposer: {
          async decomposeIssue(): Promise<TaskDecomposition> {
            return {
              issue,
              prompt: 'smoke',
              warnings: [],
              strategy: 'heuristic',
              tasks: [
                {
                  id: 'task-801-1',
                  issueNumber: issue.number,
                  title: 'Implement the feature slice',
                  type: 'feature',
                  agent: 'CodeGenAgent',
                  estimatedMinutes: 45,
                  priority: 'high',
                  dependencies: [],
                  rawText: 'Implement the feature slice',
                  source: 'fallback',
                },
              ],
            };
          },
        } as any,
        taskRunner: async (task, context) => {
          assert(context.gitnexusTaskBinding, `Expected GitNexus task binding for ${task.id}.`);
          executions.push({
            taskId: task.id,
            agent: task.agent,
            worktreePath: context.worktree?.worktreePath,
            dependencies: task.dependencies,
            status: 'completed',
          });
          return {
            status: 'completed',
            notes: `smoke:${task.id}`,
          };
        },
        agentRegistry: createAgentRegistry({ rootDir: process.cwd() }),
      },
    );

    const result = await manager.runIssue(issue);
    const taskIds = result.plan.tasks.map((task) => task.id);

    assert(taskIds.includes('task-801-1-test'), 'Synthetic TestAgent task was not added.');
    assert(taskIds.includes('task-801-1-review'), 'Synthetic ReviewAgent task was not added.');
    assert(taskIds.includes('task-801-1-pr'), 'Synthetic PRAgent task was not added.');
    assert(result.plan.gitnexus.taskBindings.length === result.plan.tasks.length, 'Expected GitNexus bindings for every task.');
    assert(executions.length === 4, `Expected 4 executed tasks, got ${executions.length}.`);

    const worktreePaths = [...new Set(executions.map((entry) => entry.worktreePath).filter(Boolean))];
    assert(worktreePaths.length === 1, `Expected shared worktree path, got ${worktreePaths.join(', ')}.`);

    const testExecution = executions.find((entry) => entry.taskId === 'task-801-1-test');
    const reviewExecution = executions.find((entry) => entry.taskId === 'task-801-1-review');
    const prExecution = executions.find((entry) => entry.taskId === 'task-801-1-pr');

    assert(testExecution?.dependencies.includes('task-801-1'), 'TestAgent task did not depend on CodeGen task.');
    assert(reviewExecution?.dependencies.includes('task-801-1-test'), 'ReviewAgent task did not depend on TestAgent task.');
    assert(prExecution?.dependencies.includes('task-801-1-review'), 'PRAgent task did not depend on ReviewAgent task.');
    assert(
      result.report.tasks.every((record) => record.status === 'completed'),
      'Quality pipeline smoke expected all execution records to complete.',
    );
    assert(
      result.plan.worktrees.every((assignment) => assignment.lifecycle === 'cleaned'),
      'Expected auto-cleaned worktree lifecycle after smoke execution.',
    );

    console.log('[passed] quality-pipeline');
    console.log(`  - tasks=${taskIds.join(',')}`);
    console.log(`  - shared-worktree=${worktreePaths[0]}`);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

function initializeGitRepo(rootDir: string) {
  execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'miyabi@example.invalid'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Miyabi Smoke'], { cwd: rootDir, stdio: 'ignore' });
  writeFileSync(path.join(rootDir, 'README.md'), '# smoke\n', 'utf8');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'chore: init smoke repo'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['branch', '-M', 'develop'], { cwd: rootDir, stdio: 'ignore' });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
