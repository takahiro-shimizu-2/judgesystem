import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { createAgentRegistry } from '../agents/registry.js';
import type { AutomationIssue, TaskDecomposition } from '../decomposition/llm-decomposer.js';
import { TaskManager } from '../orchestration/task-manager.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'judgesystem-omega-learning-smoke-'));
  const issue: AutomationIssue = {
    number: 702,
    title: 'Omega integration and learning smoke',
    body: ['- [ ] Draft the plan', '- [ ] Implement the slice (depends: task-702-1)', '- [ ] Validate the outcome (depends: task-702-2)'].join(
      '\n',
    ),
    labels: ['agent:coordinator', 'state:analyzing'],
    url: 'https://example.invalid/issues/702',
  };

  try {
    const manager = new TaskManager(
      {
        rootDir,
        gitnexusRootDir: process.cwd(),
        dryRun: true,
        concurrency: 2,
        logLevel: 'error',
      },
      {
        decomposer: {
          async decomposeIssue(): Promise<TaskDecomposition> {
            return {
              issue,
              prompt: 'omega-smoke',
              warnings: [],
              strategy: 'heuristic',
              tasks: [
                {
                  id: 'task-702-1',
                  issueNumber: issue.number,
                  title: 'Draft the plan',
                  type: 'analysis',
                  agent: 'IssueAgent',
                  estimatedMinutes: 15,
                  priority: 'medium',
                  dependencies: [],
                  rawText: 'Draft the plan',
                  source: 'fallback',
                },
                {
                  id: 'task-702-2',
                  issueNumber: issue.number,
                  title: 'Implement the slice',
                  type: 'feature',
                  agent: 'CodeGenAgent',
                  estimatedMinutes: 45,
                  priority: 'high',
                  dependencies: ['task-702-1'],
                  rawText: 'Implement the slice',
                  source: 'fallback',
                },
                {
                  id: 'task-702-3',
                  issueNumber: issue.number,
                  title: 'Validate the outcome',
                  type: 'review',
                  agent: 'ReviewAgent',
                  estimatedMinutes: 20,
                  priority: 'medium',
                  dependencies: ['task-702-2'],
                  rawText: 'Validate the outcome',
                  source: 'fallback',
                },
              ],
            };
          },
        } as any,
        agentRegistry: createAgentRegistry({ rootDir: process.cwd() }),
      },
    );

    const first = await manager.runIssue(issue);
    assert(existsSync(first.artifactPaths.deliverablePath), 'First run did not create a deliverable artifact.');
    assert(existsSync(first.artifactPaths.learningPath), 'First run did not create a learning artifact.');

    const second = await manager.runIssue(issue);
    assert(second.plan.omega.previousLearning, 'Second run did not carry forward the previous learning artifact.');
    assert(
      second.plan.omega.previousLearning?.sourceSessionId === first.plan.sessionId,
      'Second run did not reference the first learning session.',
    );

    const secondPlanMarkdown = readFileSync(second.artifactPaths.plansPath, 'utf8');
    assert(secondPlanMarkdown.includes('## Learning Context'), 'Living plan did not render the prior learning context.');

    const secondLearning = JSON.parse(readFileSync(second.artifactPaths.learningPath, 'utf8')) as {
      summary?: {
        carriesForwardToNextRun?: boolean;
      };
    };
    assert(
      secondLearning.summary?.carriesForwardToNextRun === true,
      'Second learning artifact is not marked as carry-forward ready.',
    );

    console.log('[passed] omega-integration-learning');
    console.log(`  - first=${path.basename(first.artifactPaths.learningPath)}`);
    console.log(`  - second=${path.basename(second.artifactPaths.learningPath)}`);
    console.log(`  - previous=${second.plan.omega.previousLearning?.sourceSessionId}`);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
