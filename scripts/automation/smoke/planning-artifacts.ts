import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { createAgentRegistry } from '../agents/registry.js';
import { buildExecutionArtifactSummary } from '../adapters/autonomous-agent-summary.js';
import type { AutomationIssue, TaskDecomposition } from '../decomposition/llm-decomposer.js';
import { TaskManager } from '../orchestration/task-manager.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'judgesystem-planning-smoke-'));
  const issue: AutomationIssue = {
    number: 701,
    title: 'Planning artifact parity smoke',
    body: ['- [ ] Analyze the issue', '- [ ] Implement the handler slice (depends: task-701-1)', '- [ ] Review the result (depends: task-701-2)'].join(
      '\n',
    ),
    labels: ['agent:coordinator', 'state:analyzing'],
    url: 'https://example.invalid/issues/701',
  };

  try {
    const manager = new TaskManager(
      {
        rootDir,
        dryRun: true,
        concurrency: 2,
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
                  id: 'task-701-1',
                  issueNumber: issue.number,
                  title: 'Analyze the issue',
                  type: 'analysis',
                  agent: 'IssueAgent',
                  estimatedMinutes: 15,
                  priority: 'medium',
                  dependencies: [],
                  rawText: 'Analyze the issue',
                  source: 'fallback',
                },
                {
                  id: 'task-701-2',
                  issueNumber: issue.number,
                  title: 'Implement the handler slice',
                  type: 'feature',
                  agent: 'CodeGenAgent',
                  estimatedMinutes: 45,
                  priority: 'high',
                  dependencies: ['task-701-1'],
                  rawText: 'Implement the handler slice',
                  source: 'fallback',
                },
                {
                  id: 'task-701-3',
                  issueNumber: issue.number,
                  title: 'Review the result',
                  type: 'review',
                  agent: 'ReviewAgent',
                  estimatedMinutes: 20,
                  priority: 'medium',
                  dependencies: ['task-701-2'],
                  rawText: 'Review the result',
                  source: 'fallback',
                },
              ],
            };
          },
        } as any,
        agentRegistry: createAgentRegistry({ rootDir: process.cwd() }),
      },
    );

    const result = await manager.runIssue(issue);
    assert(existsSync(result.artifactPaths.plansPath), 'Living plan artifact was not created.');

    const markdown = readFileSync(result.artifactPaths.plansPath, 'utf8');
    assert(markdown.includes('## DAG Visualization'), 'Living plan is missing DAG Visualization.');
    assert(markdown.includes('## Task Breakdown'), 'Living plan is missing Task Breakdown.');
    assert(markdown.includes('## Decisions'), 'Living plan is missing Decisions.');
    assert(markdown.includes('## Artifacts'), 'Living plan is missing Artifacts.');

    const summary = buildExecutionArtifactSummary({
      issueNumber: issue.number,
      rootDir,
      runUrl: 'https://example.invalid/runs/701',
      triggeredBy: 'planning-smoke',
      workflowStatus: 'success',
      outMarkdownPath: path.join(rootDir, 'summary.md'),
      outJsonPath: path.join(rootDir, 'summary.json'),
    });
    assert(summary.plansMarkdownPath === result.artifactPaths.plansPath, 'Summary did not resolve the living plan artifact.');
    assert(summary.markdown.includes('Planning Artifact'), 'Summary markdown did not mention the planning artifact.');

    console.log('[passed] planning-artifact');
    console.log(`  - ${path.basename(result.artifactPaths.plansPath)}`);
    console.log(`  - status=${summary.status}`);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
