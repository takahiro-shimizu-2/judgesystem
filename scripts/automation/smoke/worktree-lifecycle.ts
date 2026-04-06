import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import { createCodeGenAgentHandler } from '../agents/handlers/codegen.js';
import { AutomationLogger } from '../core/logger.js';
import type { GitNexusTaskBinding } from '../gitnexus/runtime-contract.js';
import { WorktreeCoordinator, type WorktreeAssignment } from '../orchestration/worktree-coordinator.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runGit(args: string[], cwd: string) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function main() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'judgesystem-worktree-smoke-'));
  const logger = new AutomationLogger('worktree-smoke', {
    writeToFile: false,
    level: 'error',
  });

  try {
    runGit(['init'], rootDir);
    runGit(['config', 'user.email', 'miyabi@example.invalid'], rootDir);
    runGit(['config', 'user.name', 'Miyabi Smoke'], rootDir);
    writeFileSync(path.join(rootDir, '.gitignore'), '.ai/\n', 'utf8');
    writeFileSync(path.join(rootDir, 'README.md'), '# worktree smoke\n', 'utf8');
    runGit(['add', '.'], rootDir);
    runGit(['commit', '-m', 'chore: init worktree smoke'], rootDir);
    runGit(['branch', '-M', 'develop'], rootDir);

    const coordinator = new WorktreeCoordinator({
      rootDir,
      useWorktree: true,
      createDirectories: true,
      autoCleanup: true,
    });
    const planned = coordinator.planAssignments(801, [
      {
        id: 'task-801-1',
        issueNumber: 801,
        title: 'Implement worktree-aware change',
        type: 'feature',
        agent: 'CodeGenAgent',
        estimatedMinutes: 45,
        priority: 'high',
        dependencies: [],
        rawText: 'Implement worktree-aware change',
        source: 'fallback',
      },
    ]);

    const materialized = coordinator.materializeAssignments(planned);
    const assignment = materialized[0] as WorktreeAssignment;
    assert(assignment.mode === 'git-worktree', 'Expected git-worktree mode.');
    assert(assignment.lifecycle === 'created', `Expected created lifecycle, got ${assignment.lifecycle}.`);
    assert(existsSync(path.join(assignment.worktreePath, '.git')), 'Materialized worktree is missing its .git file.');

    const handler = createCodeGenAgentHandler({ rootDir, env: {} });
    const gitnexusBinding: GitNexusTaskBinding = {
      taskId: 'task-801-1',
      taskTitle: 'Implement worktree-aware change',
      agent: 'CodeGenAgent',
      queryHighlights: ['Function createCodeGenAgentHandler (scripts/automation/agents/handlers/codegen.ts)'],
      anchorSymbols: [
        {
          symbolName: 'createCodeGenAgentHandler',
          context: {
            uid: 'Function:scripts/automation/agents/handlers/codegen.ts:createCodeGenAgentHandler',
            name: 'createCodeGenAgentHandler',
            kind: 'Function',
            filePath: 'scripts/automation/agents/handlers/codegen.ts',
            incomingCalls: ['buildDefaultAgentHandlers (scripts/automation/agents/handlers/index.ts)'],
            outgoingCalls: [],
            processes: [],
          },
          impact: {
            target: 'createCodeGenAgentHandler',
            risk: 'CRITICAL',
            impactedCount: 8,
            directCount: 3,
            processesAffected: 3,
            modulesAffected: 2,
            depthOneBreakers: ['buildDefaultAgentHandlers (scripts/automation/agents/handlers/index.ts)'],
          },
        },
      ],
      notes: ['Use the issue-level GitNexus query hits before touching CodeGenAgent.'],
    };
    const result = await handler.execute({
      task: {
        id: 'task-801-1',
        issueNumber: 801,
        title: 'Implement worktree-aware change',
        type: 'feature',
        agent: 'CodeGenAgent',
        estimatedMinutes: 45,
        priority: 'high',
        dependencies: [],
        rawText: 'Implement worktree-aware change',
        source: 'fallback',
      },
      definition: {
        name: 'CodeGenAgent',
        slug: 'codegen-agent',
        description: 'codegen',
        summary: 'codegen',
        instructions: 'codegen',
        sourcePath: '.claude/agents/codegen-agent.md',
      },
      context: {
        sessionId: 'worktree-smoke-session',
        issueNumber: 801,
        rootDir,
        dryRun: false,
        logger,
        gitnexusArtifactPath: '.ai/parallel-reports/gitnexus-runtime-worktree-smoke.json',
        gitnexusTaskBinding: gitnexusBinding,
        env: {
          AUTOMATION_ENABLE_CODEGEN_WRITE: 'true',
          AUTOMATION_CODEGEN_COMMAND: "bash -lc 'printf worktree-smoke > generated.txt'",
          AUTOMATION_CODEGEN_REQUIRE_CHANGES: 'true',
        },
        worktree: assignment,
      },
    });

    const output = result.output as {
      artifactPath: string;
      worktreePath: string;
      changedFiles: string[];
    };

    assert(output.worktreePath === assignment.worktreePath, 'Handler did not keep the worktree path.');
    assert(existsSync(path.join(assignment.worktreePath, 'generated.txt')), 'Generated file was not written inside the worktree.');
    assert(!existsSync(path.join(rootDir, 'generated.txt')), 'Generated file leaked into the main repository root.');
    assert(
      output.changedFiles.includes('generated.txt'),
      `Expected changed files to include generated.txt, got ${output.changedFiles.join(', ') || 'none'}.`,
    );
    const briefWasGenerated = readFileSync(output.artifactPath, 'utf8').includes('Code Generation Brief');

    const rootStatus = runGit(['status', '--short'], rootDir);
    assert(rootStatus.trim().length === 0, `Main repository should stay clean, got: ${rootStatus}`);

    const reused = coordinator.materializeAssignments(planned);
    assert(reused[0]?.lifecycle === 'reused', `Expected reuse lifecycle, got ${reused[0]?.lifecycle}.`);

    const cleaned = coordinator.cleanupAssignments(materialized);
    assert(cleaned[0]?.lifecycle === 'cleaned', `Expected cleaned lifecycle, got ${cleaned[0]?.lifecycle}.`);
    assert(!existsSync(assignment.worktreePath), 'Worktree path still exists after cleanup.');

    const worktreeList = runGit(['worktree', 'list', '--porcelain'], rootDir);
    assert(!worktreeList.includes(assignment.worktreePath), 'git worktree list still contains the cleaned worktree.');

    console.log('[passed] worktree-lifecycle');
    console.log(`  - branch=${assignment.branchName}`);
    console.log(`  - brief=${briefWasGenerated}`);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
