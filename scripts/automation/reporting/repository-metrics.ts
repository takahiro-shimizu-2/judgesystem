import * as fs from 'fs';
import * as path from 'path';

import { Octokit } from '@octokit/rest';

export interface RepositoryContext {
  owner: string;
  repo: string;
}

export interface IssueSnapshot {
  number: number;
  title: string;
  state: 'open' | 'closed';
  createdAt: string;
  closedAt?: string | null;
  url: string;
  labels: string[];
}

export interface TrendPoint {
  date: string;
  opened: number;
  closed: number;
}

export interface WorkflowSummary {
  total: number;
  success: number;
  failure: number;
  cancelled: number;
}

export interface SkillBusSummary {
  totalSkills: number;
  healthySkills: number;
  flaggedSkills: number;
  averageScore: number;
  lastUpdated?: string;
  recentRuns: Array<{
    skill: string;
    task: string;
    result: string;
    score: number;
    ts: string;
  }>;
}

export interface RepositoryMetrics {
  generatedAt: string;
  weekLabel: string;
  repository: RepositoryContext;
  issues: {
    total: number;
    open: number;
    closed: number;
    openedThisWeek: number;
    closedThisWeek: number;
    completionRate: number;
    recentClosed: IssueSnapshot[];
    topLabels: Array<{ name: string; count: number }>;
  };
  trends: TrendPoint[];
  workflows: WorkflowSummary;
  skillBus: SkillBusSummary;
}

interface RawSkillHealth {
  lastUpdated?: string;
  skills?: Record<
    string,
    {
      avgScore?: number;
      flagged?: boolean;
    }
  >;
}

interface RawSkillRun {
  ts: string;
  skill: string;
  task: string;
  result: string;
  score?: number;
}

const DEFAULT_REPOSITORY = 'takahiro-shimizu-2/judgesystem';

export function resolveRepositoryContext(
  repository = process.env.GITHUB_REPOSITORY || process.env.REPOSITORY || DEFAULT_REPOSITORY,
): RepositoryContext {
  const [owner, repo] = repository.split('/');

  if (!owner || !repo) {
    throw new Error(`Invalid repository identifier: ${repository}`);
  }

  return { owner, repo };
}

export function resolveGitHubToken(options?: { preferProjectToken?: boolean }) {
  if (options?.preferProjectToken) {
    return process.env.GH_PROJECT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  }

  return process.env.GITHUB_TOKEN || process.env.GH_PROJECT_TOKEN || process.env.GH_TOKEN;
}

export function getSkillBusSummary(rootDir = process.cwd()): SkillBusSummary {
  const healthPath = path.join(rootDir, 'skills', 'self-improving-skills', 'skill-health.json');
  const runsPath = path.join(rootDir, 'skills', 'self-improving-skills', 'skill-runs.jsonl');

  let health: RawSkillHealth = {};
  if (fs.existsSync(healthPath)) {
    health = JSON.parse(fs.readFileSync(healthPath, 'utf-8')) as RawSkillHealth;
  }

  const skillEntries = Object.entries(health.skills || {});
  const totalSkills = skillEntries.length;
  const healthySkills = skillEntries.filter(([, value]) => !value.flagged).length;
  const flaggedSkills = skillEntries.filter(([, value]) => value.flagged).length;
  const averageScore = totalSkills
    ? skillEntries.reduce((sum, [, value]) => sum + (value.avgScore || 0), 0) / totalSkills
    : 0;

  const recentRuns: SkillBusSummary['recentRuns'] = [];
  if (fs.existsSync(runsPath)) {
    const lines = fs
      .readFileSync(runsPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-5)
      .reverse();

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as RawSkillRun;
        recentRuns.push({
          skill: parsed.skill,
          task: parsed.task,
          result: parsed.result,
          score: parsed.score ?? 0,
          ts: parsed.ts,
        });
      } catch {
        // Ignore malformed historical lines.
      }
    }
  }

  return {
    totalSkills,
    healthySkills,
    flaggedSkills,
    averageScore,
    lastUpdated: health.lastUpdated,
    recentRuns,
  };
}

export async function collectRepositoryMetrics(
  token: string,
  context = resolveRepositoryContext(),
  options?: { trendDays?: number },
): Promise<RepositoryMetrics> {
  const trendDays = options?.trendDays ?? 7;
  const octokit = new Octokit({ auth: token });
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: context.owner,
    repo: context.repo,
    state: 'all',
    per_page: 100,
  });

  const repoIssues = issues
    .filter((issue) => !('pull_request' in issue && issue.pull_request))
    .map<IssueSnapshot>((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state as 'open' | 'closed',
      createdAt: issue.created_at,
      closedAt: issue.closed_at,
      url: issue.html_url,
      labels: issue.labels.map((label) => (typeof label === 'string' ? label : label.name || '')),
    }));

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  const closedIssues = repoIssues.filter((issue) => issue.state === 'closed');
  const openedThisWeek = repoIssues.filter((issue) => new Date(issue.createdAt) >= weekStart).length;
  const closedThisWeek = closedIssues.filter(
    (issue) => issue.closedAt && new Date(issue.closedAt) >= weekStart,
  ).length;

  const labelCounts = new Map<string, number>();
  for (const issue of repoIssues) {
    for (const label of issue.labels) {
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    }
  }

  const trends = buildIssueTrend(repoIssues, trendDays);
  const workflows = await getWorkflowSummary(octokit, context);

  return {
    generatedAt: now.toISOString(),
    weekLabel: formatWeekLabel(now),
    repository: context,
    issues: {
      total: repoIssues.length,
      open: repoIssues.filter((issue) => issue.state === 'open').length,
      closed: closedIssues.length,
      openedThisWeek,
      closedThisWeek,
      completionRate: repoIssues.length > 0 ? closedIssues.length / repoIssues.length : 0,
      recentClosed: closedIssues
        .sort((left, right) => {
          const leftValue = left.closedAt ? Date.parse(left.closedAt) : 0;
          const rightValue = right.closedAt ? Date.parse(right.closedAt) : 0;
          return rightValue - leftValue;
        })
        .slice(0, 5),
      topLabels: [...labelCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6)
        .map(([name, count]) => ({ name, count })),
    },
    trends,
    workflows,
    skillBus: getSkillBusSummary(),
  };
}

function buildIssueTrend(issues: IssueSnapshot[], trendDays: number) {
  const counts = new Map<string, TrendPoint>();
  const today = new Date();

  for (let index = trendDays - 1; index >= 0; index--) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - index);
    const key = date.toISOString().slice(0, 10);
    counts.set(key, { date: key, opened: 0, closed: 0 });
  }

  for (const issue of issues) {
    const openedKey = issue.createdAt.slice(0, 10);
    const opened = counts.get(openedKey);
    if (opened) {
      opened.opened += 1;
    }

    if (issue.closedAt) {
      const closedKey = issue.closedAt.slice(0, 10);
      const closed = counts.get(closedKey);
      if (closed) {
        closed.closed += 1;
      }
    }
  }

  return [...counts.values()];
}

async function getWorkflowSummary(octokit: Octokit, context: RepositoryContext): Promise<WorkflowSummary> {
  try {
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner: context.owner,
      repo: context.repo,
      per_page: 50,
    });

    let success = 0;
    let failure = 0;
    let cancelled = 0;

    for (const run of data.workflow_runs) {
      if (run.conclusion === 'success') {
        success++;
      } else if (run.conclusion === 'cancelled') {
        cancelled++;
      } else if (run.conclusion) {
        failure++;
      }
    }

    return {
      total: data.total_count,
      success,
      failure,
      cancelled,
    };
  } catch {
    return {
      total: 0,
      success: 0,
      failure: 0,
      cancelled: 0,
    };
  }
}

function formatWeekLabel(now: Date) {
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - 7);

  return `${start.toISOString().slice(0, 10)} - ${now.toISOString().slice(0, 10)}`;
}
