import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { AutomationLogger } from '../core/logger.js';
import { createDeploymentAgentHandler } from '../agents/handlers/deployment.js';
import { createPrAgentHandler } from '../agents/handlers/pr.js';
import { createReviewAgentHandler } from '../agents/handlers/review.js';

type SmokeStatus = 'passed' | 'failed';

interface SmokeReport {
  name: string;
  status: SmokeStatus;
  notes: string[];
}

interface TempRepo {
  rootDir: string;
  remoteDir?: string;
}

const logger = new AutomationLogger('automation-smoke', {
  writeToFile: false,
});

async function main() {
  const reports: SmokeReport[] = [];

  try {
    reports.push(await runReviewSmoke());
    reports.push(await runPrSmoke());
    reports.push(await runDeploymentSmoke());
  } finally {
    for (const repo of tempRepos) {
      cleanupRepo(repo);
    }
  }

  for (const report of reports) {
    console.log(`[${report.status}] ${report.name}`);
    for (const note of report.notes) {
      console.log(`  - ${note}`);
    }
  }
}

const tempRepos: TempRepo[] = [];

function createRepo(prefix: string, withRemote = false): TempRepo {
  const rootDir = mkdtempSync(path.join(tmpdir(), `${prefix}-`));
  const repo: TempRepo = { rootDir };
  tempRepos.push(repo);

  runGit(['init'], rootDir);
  runGit(['config', 'user.email', 'miyabi@example.invalid'], rootDir);
  runGit(['config', 'user.name', 'Miyabi Smoke'], rootDir);

  writeFileSync(path.join(rootDir, 'README.md'), '# smoke\n', 'utf8');
  runGit(['add', 'README.md'], rootDir);
  runGit(['commit', '-m', 'chore: init smoke repo'], rootDir);
  runGit(['branch', '-M', 'develop'], rootDir);

  if (withRemote) {
    const remoteDir = mkdtempSync(path.join(tmpdir(), `${prefix}-remote-`));
    repo.remoteDir = remoteDir;
    runGit(['init', '--bare', remoteDir], rootDir);
    runGit(['remote', 'add', 'origin', remoteDir], rootDir);
    runGit(['push', '-u', 'origin', 'develop'], rootDir);
  }

  return repo;
}

function cleanupRepo(repo: TempRepo) {
  rmSync(repo.rootDir, { recursive: true, force: true });
  if (repo.remoteDir) {
    rmSync(repo.remoteDir, { recursive: true, force: true });
  }
}

function runGit(args: string[], cwd: string) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runReviewSmoke(): Promise<SmokeReport> {
  const repo = createRepo('judgesystem-review-smoke');
  const handler = createReviewAgentHandler({ rootDir: repo.rootDir, env: {} });

  const result = await handler.execute({
    task: {
      id: 'review-smoke',
      issueNumber: 101,
      title: 'Review smoke',
      type: 'review',
      agent: 'ReviewAgent',
      estimatedMinutes: 10,
      priority: 'medium',
      dependencies: [],
      rawText: 'Review smoke',
      source: 'fallback',
    },
    definition: {
      name: 'ReviewAgent',
      slug: 'review-agent',
      description: 'review',
      summary: 'review',
      instructions: 'review',
      sourcePath: '.claude/agents/review-agent.md',
    },
    context: {
      sessionId: 'review-smoke-session',
      issueNumber: 101,
      rootDir: repo.rootDir,
      dryRun: false,
      logger,
      env: {
        AUTOMATION_REVIEW_MIN_SCORE: '90',
        AUTOMATION_REVIEW_MAX_RETRIES: '0',
        AUTOMATION_REVIEW_COVERAGE_THRESHOLD: '85',
        AUTOMATION_REVIEW_COVERAGE_LABELS: 'coverage',
        AUTOMATION_REVIEW_CHECKS_JSON: JSON.stringify([
          {
            label: 'typecheck',
            command: 'bash',
            args: ['-lc', 'echo typecheck ok'],
            weight: 40,
            required: true,
          },
          {
            label: 'coverage',
            command: 'bash',
            args: ['-lc', 'echo total coverage 92%'],
            weight: 40,
            required: true,
          },
          {
            label: 'security',
            command: 'bash',
            args: ['-lc', 'echo security clean'],
            weight: 20,
            required: false,
            severity: 'security',
          },
        ]),
      },
    },
  });

  const output = result.output as {
    score: number;
    coverage?: { actual?: number; passed?: boolean };
    security: { totalChecks: number };
    artifact: { markdownPath: string; jsonPath: string; commentPath: string };
  };

  assert(result.status === 'completed', 'Review smoke did not complete.');
  assert(output.score === 100, `Expected review score 100, got ${output.score}.`);
  assert(output.coverage?.actual === 92, `Expected coverage 92, got ${output.coverage?.actual}.`);
  assert(output.coverage?.passed === true, 'Expected coverage gate to pass.');
  assert(output.security.totalChecks === 1, `Expected one security check, got ${output.security.totalChecks}.`);
  assert(existsSync(output.artifact.markdownPath), 'Review markdown artifact was not created.');
  assert(existsSync(output.artifact.jsonPath), 'Review JSON artifact was not created.');
  assert(existsSync(output.artifact.commentPath), 'Review comment artifact was not created.');

  return {
    name: 'review-contract',
    status: 'passed',
    notes: [
      `score=${output.score}`,
      `coverage=${output.coverage?.actual}%`,
      `artifacts=${path.basename(output.artifact.markdownPath)}, ${path.basename(output.artifact.commentPath)}`,
    ],
  };
}

async function runPrSmoke(): Promise<SmokeReport> {
  const repo = createRepo('judgesystem-pr-smoke', true);
  writeFileSync(path.join(repo.rootDir, 'feature.txt'), 'smoke\n', 'utf8');
  runGit(['checkout', '-b', 'feat/pr-smoke'], repo.rootDir);
  runGit(['add', 'feature.txt'], repo.rootDir);
  runGit(['commit', '-m', 'feat: add smoke change'], repo.rootDir);
  runGit(['push', '-u', 'origin', 'feat/pr-smoke'], repo.rootDir);

  const requestedRoutes: string[] = [];
  const handler = createPrAgentHandler({
    rootDir: repo.rootDir,
    env: {},
    octokitFactory: () =>
      ({
        rest: {
          pulls: {
            async list() {
              requestedRoutes.push('pulls.list');
              return { data: [] };
            },
            async create() {
              requestedRoutes.push('pulls.create');
              return { data: { number: 88, html_url: 'https://example.invalid/pulls/88' } };
            },
            async update() {
              throw new Error('Unexpected update call in PR smoke.');
            },
            async requestReviewers() {
              requestedRoutes.push('pulls.requestReviewers');
              return { data: {} };
            },
            async get() {
              requestedRoutes.push('pulls.get');
              return { data: { mergeable: true, mergeable_state: 'clean' } };
            },
          },
          issues: {
            async addLabels() {
              requestedRoutes.push('issues.addLabels');
              return { data: [] };
            },
          },
        },
      }) as any,
  });

  const result = await handler.execute({
    task: {
      id: 'pr-smoke',
      issueNumber: 202,
      title: 'PR smoke',
      type: 'feature',
      agent: 'PRAgent',
      estimatedMinutes: 10,
      priority: 'medium',
      dependencies: [],
      rawText: 'PR smoke',
      source: 'fallback',
    },
    definition: {
      name: 'PRAgent',
      slug: 'pr-agent',
      description: 'pr',
      summary: 'pr',
      instructions: 'pr',
      sourcePath: '.claude/agents/pr-agent.md',
    },
    context: {
      sessionId: 'pr-smoke-session',
      issueNumber: 202,
      rootDir: repo.rootDir,
      dryRun: false,
      logger,
      env: {
        GITHUB_TOKEN: 'dummy-token',
        REPOSITORY: 'owner/repo',
        AUTOMATION_ENABLE_PR_WRITE: 'true',
        AUTOMATION_PR_BASE: 'develop',
        AUTOMATION_PR_REVIEWERS: 'alice,bob',
        AUTOMATION_PR_LABELS: 'agent:pr ready-for-review',
        AUTOMATION_PR_REQUIRE_MERGEABLE: 'true',
      },
    },
  });

  const output = result.output as {
    artifactPath: string;
    prNumber?: number;
    reviewersRequested: string[];
    labelsApplied: string[];
    mergeability?: { mergeable?: boolean | null };
  };

  assert(result.status === 'completed', 'PR smoke did not complete.');
  assert(output.prNumber === 88, `Expected PR number 88, got ${output.prNumber}.`);
  assert(output.reviewersRequested.length === 2, 'Expected two reviewers to be requested.');
  assert(output.labelsApplied.length === 2, 'Expected two labels to be applied.');
  assert(output.mergeability?.mergeable === true, 'Expected mergeability gate to pass.');
  assert(existsSync(output.artifactPath), 'PR draft artifact was not created.');
  assert(
    ['pulls.list', 'pulls.create', 'issues.addLabels', 'pulls.requestReviewers', 'pulls.get'].every((route) =>
      requestedRoutes.includes(route),
    ),
    `PR smoke did not exercise all expected Octokit routes: ${requestedRoutes.join(', ')}`,
  );

  return {
    name: 'pr-contract',
    status: 'passed',
    notes: [
      `prNumber=${output.prNumber}`,
      `reviewers=${output.reviewersRequested.join(',')}`,
      `labels=${output.labelsApplied.join(',')}`,
    ],
  };
}

async function runDeploymentSmoke(): Promise<SmokeReport> {
  const repo = createRepo('judgesystem-deploy-smoke');
  const handler = createDeploymentAgentHandler({
    rootDir: repo.rootDir,
    env: {},
    octokitFactory: () =>
      ({
        async request(route: string) {
          if (route.startsWith('POST /repos/')) {
            return { data: {} };
          }
          if (route.includes('/workflows/') && route.endsWith('/runs')) {
            return {
              data: {
                workflow_runs: [
                  {
                    id: 301,
                    head_branch: 'develop',
                    html_url: 'https://example.invalid/runs/301',
                    created_at: new Date().toISOString(),
                  },
                ],
              },
            };
          }
          if (route.includes('/actions/runs/')) {
            return {
              data: {
                id: 301,
                status: 'completed',
                conclusion: 'success',
                html_url: 'https://example.invalid/runs/301',
              },
            };
          }
          throw new Error(`Unexpected deployment route: ${route}`);
        },
      }) as any,
  });

  const result = await handler.execute({
    task: {
      id: 'deploy-smoke',
      issueNumber: 303,
      title: 'Deploy smoke',
      type: 'deployment',
      agent: 'DeploymentAgent',
      estimatedMinutes: 10,
      priority: 'medium',
      dependencies: [],
      rawText: 'Deploy smoke',
      source: 'fallback',
    },
    definition: {
      name: 'DeploymentAgent',
      slug: 'deployment-agent',
      description: 'deploy',
      summary: 'deploy',
      instructions: 'deploy',
      sourcePath: '.claude/agents/deployment-agent.md',
    },
    context: {
      sessionId: 'deploy-smoke-session',
      issueNumber: 303,
      rootDir: repo.rootDir,
      dryRun: false,
      logger,
      env: {
        GITHUB_TOKEN: 'dummy-token',
        REPOSITORY: 'owner/repo',
        AUTOMATION_ENABLE_DEPLOY: 'true',
        AUTOMATION_DEPLOY_PROVIDER: 'github-pages',
        AUTOMATION_DEPLOY_TARGET: 'dashboard',
        AUTOMATION_DEPLOY_USE_PROVIDER_PRESET: 'true',
        AUTOMATION_DEPLOY_REQUIRE_APPROVAL: 'disabled',
        AUTOMATION_GITHUB_PAGES_ENABLED: 'true',
        AUTOMATION_GITHUB_PAGES_WAIT_FOR_RUN: 'true',
        AUTOMATION_GITHUB_PAGES_REF: 'develop',
      },
    },
  });

  const output = result.output as {
    commandSource: string;
    providerRun?: { status?: string; runId?: number; conclusion?: string | null };
    artifact: { markdownPath: string; jsonPath: string };
  };
  const artifactJson = JSON.parse(readFileSync(output.artifact.jsonPath, 'utf8')) as {
    providerRun?: { workflowId?: string };
  };

  assert(result.status === 'completed', 'Deployment smoke did not complete.');
  assert(output.commandSource === 'github-pages-preset', `Expected github-pages preset, got ${output.commandSource}.`);
  assert(output.providerRun?.status === 'completed', `Expected completed provider run, got ${output.providerRun?.status}.`);
  assert(output.providerRun?.runId === 301, `Expected provider run id 301, got ${output.providerRun?.runId}.`);
  assert(output.providerRun?.conclusion === 'success', 'Expected provider workflow conclusion=success.');
  assert(existsSync(output.artifact.markdownPath), 'Deployment markdown artifact was not created.');
  assert(existsSync(output.artifact.jsonPath), 'Deployment JSON artifact was not created.');
  assert(artifactJson.providerRun?.workflowId === 'deploy-pages.yml', 'Expected deployment artifact to record deploy-pages.yml.');

  return {
    name: 'deployment-contract',
    status: 'passed',
    notes: [
      `commandSource=${output.commandSource}`,
      `providerRun=${output.providerRun?.runId}`,
      `workflow=${artifactJson.providerRun?.workflowId}`,
    ],
  };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
