import { buildIssueDecompositionPrompt } from './prompt-templates.js';

export type AutomationAgentName =
  | 'CoordinatorAgent'
  | 'IssueAgent'
  | 'CodeGenAgent'
  | 'TestAgent'
  | 'ReviewAgent'
  | 'PRAgent'
  | 'DeploymentAgent';

export type DecompositionTaskType =
  | 'feature'
  | 'bug'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'deployment'
  | 'analysis'
  | 'review'
  | 'release';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskSource = 'llm' | 'checkbox' | 'ordered-list' | 'heading' | 'fallback';

export interface AutomationIssue {
  number: number;
  title: string;
  body?: string | null;
  labels?: string[];
  url?: string;
}

export interface DecomposedTask {
  id: string;
  issueNumber: number;
  title: string;
  type: DecompositionTaskType;
  agent: AutomationAgentName;
  estimatedMinutes: number;
  priority: TaskPriority;
  dependencies: string[];
  rawText: string;
  source: TaskSource;
}

export interface TaskDecomposition {
  issue: AutomationIssue;
  prompt: string;
  tasks: DecomposedTask[];
  warnings: string[];
  strategy: 'llm' | 'heuristic';
}

export interface LLMDecomposerOptions {
  invoke?: (prompt: string, issue: AutomationIssue) => Promise<string>;
  maxTasks?: number;
}

interface TaskCandidate {
  text: string;
  source: TaskSource;
}

const GENERIC_HEADINGS = new Set(['tasks', 'task list', 'task-list', 'tasklist', 'summary', 'overview', 'タスク一覧']);

const AGENT_RULES: Array<{
  type: DecompositionTaskType;
  agent: AutomationAgentName;
  keywords: string[];
}> = [
  { type: 'deployment', agent: 'DeploymentAgent', keywords: ['deploy', 'release', 'ci', 'cd', 'デプロイ', 'リリース'] },
  { type: 'review', agent: 'ReviewAgent', keywords: ['review', 'audit', 'verify', 'quality', 'lint', 'security', 'レビュー', '検証'] },
  { type: 'release', agent: 'PRAgent', keywords: ['pull request', 'pr ', 'draft pr', 'release note', 'changelog', 'pr作成', 'プルリク'] },
  {
    type: 'analysis',
    agent: 'IssueAgent',
    keywords: [
      'analyze',
      'analysis',
      'investigate',
      'research',
      'triage',
      'evaluate',
      'assessment',
      'throughput',
      'bottleneck',
      'architecture',
      'roadmap',
      'estimate',
      'design',
      'strategy',
      '調査',
      '分析',
      '評価',
      '確認',
      '整理',
      '方針',
      '設計',
      '特定',
      '見積',
      '概算',
      'スループット',
      'ボトルネック',
      'アーキテクチャ',
      'ロードマップ',
      '拡張パス',
    ],
  },
  { type: 'test', agent: 'TestAgent', keywords: ['test', 'spec', 'coverage', 'e2e', 'integration', 'unit', 'テスト'] },
  { type: 'docs', agent: 'CodeGenAgent', keywords: ['doc', 'documentation', 'readme', 'guide', 'ドキュメント', '説明'] },
  { type: 'refactor', agent: 'CodeGenAgent', keywords: ['refactor', 'cleanup', 'optimize', 'improve', '整理', '改善'] },
  { type: 'bug', agent: 'CodeGenAgent', keywords: ['bug', 'fix', 'error', 'issue', 'broken', '修正', '不具合'] },
  { type: 'feature', agent: 'CodeGenAgent', keywords: ['feature', 'add', 'new', 'implement', 'create', '対応', '追加', '実装'] },
];

const BASE_ESTIMATE_MINUTES: Record<DecompositionTaskType, number> = {
  feature: 60,
  bug: 30,
  refactor: 45,
  docs: 20,
  test: 30,
  deployment: 15,
  analysis: 30,
  review: 20,
  release: 20,
};

export class LLMDecomposer {
  private readonly invoke?: (prompt: string, issue: AutomationIssue) => Promise<string>;
  private readonly maxTasks: number;

  constructor(options: LLMDecomposerOptions = {}) {
    this.invoke = options.invoke;
    this.maxTasks = options.maxTasks ?? 20;
  }

  async decomposeIssue(issue: AutomationIssue): Promise<TaskDecomposition> {
    const prompt = buildIssueDecompositionPrompt(issue);

    if (this.invoke) {
      const raw = await this.invoke(prompt, issue);
      const decomposition = this.parseLlmResponse(raw, issue, prompt);
      if (decomposition.tasks.length > 0) {
        return decomposition;
      }
    }

    return this.buildHeuristicDecomposition(issue, prompt);
  }

  private parseLlmResponse(raw: string, issue: AutomationIssue, prompt: string): TaskDecomposition {
    const warnings: string[] = [];

    try {
      const parsed = JSON.parse(extractJsonObject(raw)) as {
        tasks?: Array<Partial<DecomposedTask>>;
        warnings?: string[];
      };

      const tasks = (parsed.tasks || [])
        .slice(0, this.maxTasks)
        .map((task, index) => this.normalizeTask(issue, task.title || `Task ${index + 1}`, 'llm', task));

      return {
        issue,
        prompt,
        tasks,
        warnings: parsed.warnings || warnings,
        strategy: 'llm',
      };
    } catch {
      warnings.push('Failed to parse LLM response as JSON; falling back to heuristic decomposition.');
      return {
        issue,
        prompt,
        tasks: [],
        warnings,
        strategy: 'llm',
      };
    }
  }

  private buildHeuristicDecomposition(issue: AutomationIssue, prompt: string): TaskDecomposition {
    const warnings: string[] = [];
    const candidates = extractTaskCandidates(issue.body || '');

    if (candidates.length === 0) {
      warnings.push('No structured task list found in issue body; generated a single fallback task from the issue title.');
    }

    const tasks = (candidates.length > 0
      ? candidates
      : [{ text: issue.title, source: 'fallback' as const }])
      .slice(0, this.maxTasks)
      .map((candidate, index) => this.normalizeTask(issue, candidate.text, candidate.source, undefined, index));

    if (candidates.length > this.maxTasks) {
      warnings.push(`Task list was truncated to ${this.maxTasks} items.`);
    }

    return {
      issue,
      prompt,
      tasks,
      warnings,
      strategy: 'heuristic',
    };
  }

  private normalizeTask(
    issue: AutomationIssue,
    rawText: string,
    source: TaskSource,
    seed?: Partial<DecomposedTask>,
    index = 0,
  ): DecomposedTask {
    const title = stripDependencyHints(rawText).trim();
    const dependencies = seed?.dependencies?.length ? seed.dependencies : extractDependencies(rawText);
    const type = seed?.type || inferTaskType(title);
    const agent = seed?.agent || inferAgent(title, type);
    const priority = seed?.priority || inferPriority(title, issue.labels || []);
    const estimatedMinutes = seed?.estimatedMinutes || estimateTaskMinutes(type, title);
    const linkedIssue = extractLinkedIssueNumber(title);
    const id = seed?.id || (linkedIssue ? `task-${linkedIssue}` : `task-${issue.number}-${index + 1}`);

    return {
      id,
      issueNumber: issue.number,
      title,
      type,
      agent,
      estimatedMinutes,
      priority,
      dependencies,
      rawText,
      source,
    };
  }
}

function extractTaskCandidates(body: string): TaskCandidate[] {
  const lines = body.split('\n');

  const checklist = lines
    .map((line) => line.match(/^\s*[-*]\s*\[(?: |x|X)\]\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ text: match[1].trim(), source: 'checkbox' as const }));
  if (checklist.length > 0) {
    return checklist;
  }

  const ordered = lines
    .map((line) => line.match(/^\s*\d+\.\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ text: match[1].trim(), source: 'ordered-list' as const }));
  if (ordered.length > 0) {
    return ordered;
  }

  return lines
    .map((line) => line.match(/^\s{0,3}#{2,6}\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[1].trim())
    .filter((heading) => !GENERIC_HEADINGS.has(heading.toLowerCase()))
    .map((heading) => ({ text: heading, source: 'heading' as const }));
}

function stripDependencyHints(text: string) {
  return text
    .replace(/\(\s*depends?:[^)]+\)/gi, '')
    .replace(/\[\s*depends?:[^\]]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDependencies(text: string) {
  const matches = [...text.matchAll(/depends?:\s*([^)]+)\)?/gi)];
  const dependencies: string[] = [];

  for (const match of matches) {
    const raw = match[1];
    const tokens = raw
      .split(/[,\s]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    for (const token of tokens) {
      if (token.startsWith('#')) {
        dependencies.push(`task-${token.slice(1)}`);
        continue;
      }

      if (token.startsWith('task-')) {
        dependencies.push(token);
      }
    }
  }

  return [...new Set(dependencies)];
}

function extractLinkedIssueNumber(text: string) {
  const match = text.match(/#(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function inferTaskType(title: string): DecompositionTaskType {
  const normalized = title.toLowerCase();

  for (const rule of AGENT_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.type;
    }
  }

  return 'feature';
}

function inferAgent(title: string, type: DecompositionTaskType): AutomationAgentName {
  const normalized = title.toLowerCase();

  for (const rule of AGENT_RULES) {
    if (rule.type === type && rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.agent;
    }
  }

  return type === 'deployment' ? 'DeploymentAgent' : 'CodeGenAgent';
}

function inferPriority(title: string, labels: string[]): TaskPriority {
  const normalized = `${title} ${labels.join(' ')}`.toLowerCase();

  if (/(critical|urgent|blocking|sev\.?1|sev\.?2|高優先|至急)/.test(normalized)) {
    return normalized.includes('sev.1') || normalized.includes('critical') ? 'critical' : 'high';
  }

  if (/(important|priority|sev\.?3|medium|中優先)/.test(normalized)) {
    return 'medium';
  }

  return /(minor|small|nice to have|sev\.?4|sev\.?5|低優先)/.test(normalized) ? 'low' : 'medium';
}

function estimateTaskMinutes(type: DecompositionTaskType, title: string) {
  const base = BASE_ESTIMATE_MINUTES[type];
  const normalized = title.toLowerCase();

  if (/(large|complex|major|大規模|複雑)/.test(normalized)) {
    return base * 2;
  }

  if (/(quick|minor|small|軽微|簡易)/.test(normalized)) {
    return Math.max(10, Math.round(base * 0.5));
  }

  return base;
}

function extractJsonObject(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]+?)```/i);
  if (fenced) {
    return fenced[1];
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }

  throw new Error('No JSON object found in response');
}
