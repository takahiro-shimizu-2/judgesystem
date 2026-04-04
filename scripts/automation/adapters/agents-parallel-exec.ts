import { Octokit } from '@octokit/rest';

import { TaskManager } from '../orchestration/task-manager.js';
import type { AutomationIssue } from '../decomposition/llm-decomposer.js';
import { resolveRepositoryContext, resolveGitHubToken } from '../reporting/repository-metrics.js';

interface ParsedArgs {
  issueNumbers: number[];
  concurrency: number;
  dryRun: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  help: boolean;
}

export async function runAgentsParallelExecCli(argv = process.argv, env = process.env) {
  const args = parseArgs(argv);

  if (args.help) {
    printUsage();
    return;
  }

  if (args.issueNumbers.length === 0) {
    throw new Error('At least one issue number is required. Use --issue <number> or --issues <n1,n2>.');
  }

  const repository = env.GITHUB_REPOSITORY || env.REPOSITORY || 'takahiro-shimizu-2/judgesystem';
  const context = resolveRepositoryContext(repository);
  const token = resolveGitHubToken();
  const issues = await fetchIssues(args.issueNumbers, context.owner, context.repo, token);
  const manager = new TaskManager({
    rootDir: process.cwd(),
    concurrency: args.concurrency,
    dryRun: args.dryRun,
    useWorktree: env.USE_WORKTREE === 'true',
    autoCleanupWorktrees: env.AUTOMATION_WORKTREE_AUTOCLEANUP === 'true',
    logLevel: args.logLevel,
    deviceIdentifier: env.DEVICE_IDENTIFIER || 'local-runner',
  });

  console.log('🤖 Autonomous Operations - Parallel Executor');
  console.log(`   Repository: ${context.owner}/${context.repo}`);
  console.log(`   Issue Count: ${issues.length}`);
  console.log(`   Concurrency: ${args.concurrency}`);
  console.log(`   Dry Run: ${args.dryRun ? 'Yes' : 'No (registry handlers and fallback routing enabled)'}`);

  let hasFailures = false;

  for (const issue of issues) {
    console.log(`\n================================================================================`);
    console.log(`🚀 Executing Issue #${issue.number}: ${issue.title}`);
    console.log(`================================================================================`);

    try {
      const result = await manager.runIssue(issue);
      const report = result.report;

      console.log(
        `✅ Issue #${issue.number} ${report.executionMode === 'planning' ? 'planned' : 'executed'}: ${report.graph.nodes} tasks, ${report.graph.edges} edges, ${report.graph.levels} levels`,
      );
      console.log(
        `   Summary: completed=${report.summary.completed}, planned=${report.summary.planned}, skipped=${report.summary.skipped}, failed=${report.summary.failed}`,
      );
      console.log(`   Report: ${result.artifactPaths.reportPath}`);
      console.log(`   Plan:   ${result.artifactPaths.planPath}`);
      console.log(`   Plans:  ${result.artifactPaths.plansPath}`);

      if (report.warnings.length > 0) {
        console.log('   Warnings:');
        for (const warning of report.warnings) {
          console.log(`   - ${warning}`);
        }
      }
    } catch (error) {
      hasFailures = true;
      console.error(`❌ Failed to process issue #${issue.number}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (hasFailures) {
    process.exit(1);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const issue = parseNumberFlag(argv, '--issue');
  const issuesFlag = parseStringFlag(argv, '--issues');
  const issueNumbers = issuesFlag
    ? issuesFlag
        .split(',')
        .map((value) => parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value))
    : issue
      ? [issue]
      : [];

  return {
    issueNumbers,
    concurrency: parseNumberFlag(argv, '--concurrency') || 2,
    dryRun: hasFlag(argv, '--dry-run'),
    logLevel: (parseStringFlag(argv, '--log-level') as ParsedArgs['logLevel'] | null) || 'info',
    help: hasFlag(argv, '--help'),
  };
}

async function fetchIssues(issueNumbers: number[], owner: string, repo: string, token?: string | null) {
  const octokit = token ? new Octokit({ auth: token }) : new Octokit();
  const issues: AutomationIssue[] = [];

  for (const issueNumber of issueNumbers) {
    const { data } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    issues.push({
      number: data.number,
      title: data.title,
      body: data.body,
      labels: data.labels.map((label) => (typeof label === 'string' ? label : label.name || '')),
      url: data.html_url,
    });
  }

  return issues;
}

function parseStringFlag(argv: string[], flag: string) {
  const inline = argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }

  const index = argv.findIndex((value) => value === flag);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }

  return null;
}

function parseNumberFlag(argv: string[], flag: string) {
  const value = parseStringFlag(argv, flag);
  if (!value) {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFlag(argv: string[], flag: string) {
  return argv.includes(flag);
}

function printUsage() {
  console.log(`Usage:
  npm run agents:parallel:exec -- --issue <number> [--concurrency <n>] [--dry-run]
  npm run agents:parallel:exec -- --issues <n1,n2,...> [--concurrency <n>] [--dry-run]

Options:
  --issue <number>         Execute one issue
  --issues <n1,n2,...>     Execute multiple issues
  --concurrency <number>   Max parallel tasks per DAG level (default: 2)
  --dry-run                Build plans only without executing task runners
  --log-level <level>      debug | info | warn | error
  --help                   Show this message`);
}
