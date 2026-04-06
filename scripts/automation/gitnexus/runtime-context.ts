import { spawnSync } from 'node:child_process';

import { truncateText, unique } from '../core/utils.js';
import type { AutomationLogger } from '../core/logger.js';
import type { AutomationAgentName, AutomationIssue, DecomposedTask } from '../decomposition/llm-decomposer.js';
import type {
  GitNexusAnchorSnapshot,
  GitNexusContextSnapshot,
  GitNexusDefinitionHit,
  GitNexusImpactSnapshot,
  GitNexusQuerySnapshot,
  GitNexusRuntimeArtifact,
  GitNexusTaskBinding,
} from './runtime-contract.js';

interface GitNexusRuntimeContextOptions {
  gitnexusRootDir: string;
  repo: string;
  issue: AutomationIssue;
  tasks: DecomposedTask[];
  sessionId: string;
  logger?: AutomationLogger;
}

interface RawQueryResult {
  processes?: Array<{
    summary?: string;
  }>;
  definitions?: Array<{
    id?: string;
    name?: string;
    filePath?: string;
    startLine?: number;
    endLine?: number;
    module?: string;
  }>;
}

interface RawContextResult {
  status?: string;
  symbol?: {
    uid?: string;
    name?: string;
    kind?: string;
    filePath?: string;
  };
  incoming?: {
    calls?: Array<{
      name?: string;
      filePath?: string;
    }>;
  };
  outgoing?: {
    calls?: Array<{
      name?: string;
      filePath?: string;
    }>;
  };
  processes?: Array<{
    name?: string;
  }>;
}

interface RawImpactResult {
  risk?: string;
  impactedCount?: number;
  summary?: {
    direct?: number;
    processes_affected?: number;
    modules_affected?: number;
  };
  byDepth?: {
    [depth: string]: Array<{
      name?: string;
      filePath?: string;
    }>;
  };
}

const QUERY_DEFINITION_KINDS = new Set(['Function', 'Method', 'Class', 'Interface', 'TypeAlias', 'Enum']);
const PLANNING_ANCHOR_SYMBOLS = ['TaskManager', 'createOmegaPlanningLayer', 'buildLivingPlanMarkdown'] as const;
const AGENT_ANCHOR_SYMBOLS: Partial<Record<AutomationAgentName, readonly string[]>> = {
  IssueAgent: ['createIssueAgentHandler', 'LLMDecomposer'],
  CodeGenAgent: ['createCodeGenAgentHandler'],
  TestAgent: ['createTestAgentHandler'],
  ReviewAgent: ['createReviewAgentHandler'],
  PRAgent: ['createPrAgentHandler'],
  DeploymentAgent: ['createDeploymentAgentHandler'],
};

export function buildGitNexusRuntimeArtifact(options: GitNexusRuntimeContextOptions): GitNexusRuntimeArtifact {
  const logger = options.logger;
  const generatedAt = new Date().toISOString();
  ensureGitNexusIndex(options.gitnexusRootDir, logger);
  const issueQuery = runIssueQuery(options);
  const planningAnchors = PLANNING_ANCHOR_SYMBOLS.map((symbolName) =>
    loadAnchorSnapshot(symbolName, options.gitnexusRootDir, options.repo),
  );
  const uniqueAgents = unique(options.tasks.map((task) => task.agent));
  const agentAnchors = uniqueAgents.map((agent) => ({
    agent,
    anchors: (AGENT_ANCHOR_SYMBOLS[agent] || []).map((symbolName) =>
      loadAnchorSnapshot(symbolName, options.gitnexusRootDir, options.repo),
    ),
  }));
  const taskBindings = options.tasks.map((task) =>
    buildTaskBinding(task, issueQuery, agentAnchors.find((entry) => entry.agent === task.agent)?.anchors || []),
  );

  logger?.info(
    `GitNexus runtime context captured: ${issueQuery.definitionHits.length} definitions, ${issueQuery.processSummaries.length} processes, ${taskBindings.length} task bindings.`,
  );

  return {
    repo: options.repo,
    issueNumber: options.issue.number,
    sessionId: options.sessionId,
    generatedAt,
    gitnexusRootDir: options.gitnexusRootDir,
    issueQuery,
    planningAnchors,
    agentAnchors,
    taskBindings,
    warnings: [],
  };
}

function runIssueQuery(options: GitNexusRuntimeContextOptions): GitNexusQuerySnapshot {
  const query = truncateText(options.issue.title, 120);
  const goal = `Find execution flows and symbols relevant to Issue #${options.issue.number}`;
  const context = truncateText(
    [options.issue.body || '', ...(options.issue.labels || [])].filter(Boolean).join('\n'),
    280,
  );
  const raw = runGitNexusJson<RawQueryResult>(
    [
      'query',
      query,
      '--repo',
      options.repo,
      '--goal',
      goal,
      '--context',
      context || truncateText(options.issue.title, 120),
      '--limit',
      '5',
    ],
    options.gitnexusRootDir,
  );

  return {
    query,
    goal,
    context,
    processSummaries: (raw.processes || [])
      .map((process) => process.summary?.trim())
      .filter((summary): summary is string => Boolean(summary))
      .slice(0, 5),
    definitionHits: selectDefinitionHits(raw.definitions || []),
  };
}

function selectDefinitionHits(definitions: RawQueryResult['definitions']): GitNexusDefinitionHit[] {
  return (definitions || [])
    .map((definition) => {
      const uid = definition.id || '';
      const kind = uid.split(':', 1)[0] || 'Unknown';

      return {
        uid,
        kind,
        name: definition.name || uid,
        filePath: definition.filePath || '',
        startLine: definition.startLine,
        endLine: definition.endLine,
        module: definition.module,
      };
    })
    .filter((definition) => definition.uid && QUERY_DEFINITION_KINDS.has(definition.kind))
    .filter((definition) => !definition.filePath.includes('/smoke/'))
    .slice(0, 8);
}

function loadAnchorSnapshot(symbolName: string, gitnexusRootDir: string, repo: string): GitNexusAnchorSnapshot {
  const context = runGitNexusJson<RawContextResult>(['context', symbolName, '--repo', repo], gitnexusRootDir);
  if (context.status !== 'found' || !context.symbol?.name || !context.symbol.filePath) {
    throw new Error(`GitNexus context for ${symbolName} was not found.`);
  }

  const impact = runGitNexusJson<RawImpactResult>(
    ['impact', symbolName, '--repo', repo, '--direction', 'upstream'],
    gitnexusRootDir,
  );

  return {
    symbolName,
    context: {
      uid: context.symbol.uid || symbolName,
      name: context.symbol.name,
      kind: context.symbol.kind || 'Unknown',
      filePath: context.symbol.filePath,
      incomingCalls: (context.incoming?.calls || [])
        .map((call) => formatCallable(call.name, call.filePath))
        .filter(Boolean) as string[],
      outgoingCalls: (context.outgoing?.calls || [])
        .map((call) => formatCallable(call.name, call.filePath))
        .filter(Boolean) as string[],
      processes: (context.processes || []).map((process) => process.name || '').filter(Boolean),
    },
    impact: {
      target: symbolName,
      risk: impact.risk || 'UNKNOWN',
      impactedCount: impact.impactedCount || 0,
      directCount: impact.summary?.direct || 0,
      processesAffected: impact.summary?.processes_affected || 0,
      modulesAffected: impact.summary?.modules_affected || 0,
      depthOneBreakers: (impact.byDepth?.['1'] || [])
        .map((entry) => formatCallable(entry.name, entry.filePath))
        .filter(Boolean) as string[],
    },
  };
}

function buildTaskBinding(
  task: DecomposedTask,
  issueQuery: GitNexusQuerySnapshot,
  anchorSymbols: GitNexusAnchorSnapshot[],
): GitNexusTaskBinding {
  const queryHighlights = selectQueryHighlights(task, issueQuery);
  const notes = [
    queryHighlights.length > 0
      ? `Use the issue-level GitNexus query hits before touching ${task.agent}.`
      : 'Issue-level GitNexus query returned no task-specific highlights, so rely on the runtime anchor symbols.',
    anchorSymbols.length > 0
      ? `Anchor on ${anchorSymbols.map((anchor) => anchor.symbolName).join(', ')} before changing runtime behavior.`
      : `No runtime anchor symbols are configured for ${task.agent}.`,
  ];

  return {
    taskId: task.id,
    taskTitle: task.title,
    agent: task.agent,
    queryHighlights,
    anchorSymbols,
    notes,
  };
}

function selectQueryHighlights(task: DecomposedTask, issueQuery: GitNexusQuerySnapshot) {
  const tokens = tokenize(task.title);
  const definitionHighlights = issueQuery.definitionHits
    .filter((definition) => matchesTokens(tokens, `${definition.name} ${definition.filePath}`))
    .slice(0, 2)
    .map((definition) => `${definition.kind} ${definition.name} (${definition.filePath})`);
  const processHighlights = issueQuery.processSummaries
    .filter((summary) => matchesTokens(tokens, summary))
    .slice(0, 2);
  const merged = unique([...definitionHighlights, ...processHighlights]);

  if (merged.length > 0) {
    return merged;
  }

  return unique([
    ...issueQuery.processSummaries.slice(0, 2),
    ...issueQuery.definitionHits.slice(0, 2).map((definition) => `${definition.kind} ${definition.name} (${definition.filePath})`),
  ]).slice(0, 3);
}

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function matchesTokens(tokens: string[], haystack: string) {
  if (tokens.length === 0) {
    return false;
  }

  const normalized = haystack.toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

function formatCallable(name?: string, filePath?: string) {
  if (!name && !filePath) {
    return '';
  }

  if (name && filePath) {
    return `${name} (${filePath})`;
  }

  return name || filePath || '';
}

function ensureGitNexusIndex(cwd: string, logger?: AutomationLogger) {
  const status = runGitNexusCommand(['status'], cwd, { tolerateFailure: true });
  const output = [status.stdout, status.stderr].filter(Boolean).join('\n');

  if (status.status === 0 && output.includes('Status: ✅ up-to-date')) {
    return;
  }

  logger?.warn(
    `GitNexus index is unavailable or stale for ${cwd}; bootstrapping with analyze before runtime planning.`,
  );

  const analyze = runGitNexusCommand(['analyze'], cwd);
  if (analyze.status !== 0) {
    throw new Error(
      [`GitNexus analyze failed: npx gitnexus analyze`, analyze.stderr?.trim(), analyze.stdout?.trim()]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

function runGitNexusJson<T>(args: string[], cwd: string): T {
  const result = runGitNexusCommand(args, cwd);

  if (result.status !== 0) {
    throw new Error(
      [`GitNexus command failed: npx gitnexus ${args.join(' ')}`, result.stderr?.trim(), result.stdout?.trim()]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const stdout = result.stdout?.trim();
  if (!stdout) {
    throw new Error(`GitNexus command produced no JSON output: npx gitnexus ${args.join(' ')}`);
  }

  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new Error(
      `GitNexus command returned non-JSON output for "${args.join(' ')}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function runGitNexusCommand(args: string[], cwd: string, options?: { tolerateFailure?: boolean }) {
  const result = spawnSync('npx', ['gitnexus', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (!options?.tolerateFailure && result.error) {
    throw result.error;
  }

  return result;
}
