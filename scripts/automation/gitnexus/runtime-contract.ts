import type { AutomationAgentName, DecomposedTask } from '../decomposition/llm-decomposer.js';

export interface GitNexusDefinitionHit {
  uid: string;
  kind: string;
  name: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  module?: string;
}

export interface GitNexusQuerySnapshot {
  query: string;
  goal: string;
  context: string;
  processSummaries: string[];
  definitionHits: GitNexusDefinitionHit[];
}

export interface GitNexusContextSnapshot {
  uid: string;
  name: string;
  kind: string;
  filePath: string;
  incomingCalls: string[];
  outgoingCalls: string[];
  processes: string[];
}

export interface GitNexusImpactSnapshot {
  target: string;
  risk: string;
  impactedCount: number;
  directCount: number;
  processesAffected: number;
  modulesAffected: number;
  depthOneBreakers: string[];
}

export interface GitNexusAnchorSnapshot {
  symbolName: string;
  context: GitNexusContextSnapshot;
  impact: GitNexusImpactSnapshot;
}

export interface GitNexusTaskBinding {
  taskId: string;
  taskTitle: string;
  agent: AutomationAgentName;
  queryHighlights: string[];
  anchorSymbols: GitNexusAnchorSnapshot[];
  notes: string[];
}

export interface GitNexusRuntimeArtifact {
  repo: string;
  issueNumber: number;
  sessionId: string;
  generatedAt: string;
  gitnexusRootDir: string;
  issueQuery: GitNexusQuerySnapshot;
  planningAnchors: GitNexusAnchorSnapshot[];
  agentAnchors: Array<{
    agent: AutomationAgentName;
    anchors: GitNexusAnchorSnapshot[];
  }>;
  taskBindings: GitNexusTaskBinding[];
  warnings: string[];
}

export function findGitNexusTaskBinding(
  artifact: GitNexusRuntimeArtifact,
  taskId: string,
): GitNexusTaskBinding | undefined {
  return artifact.taskBindings.find((binding) => binding.taskId === taskId);
}

export function requireGitNexusTaskBinding(
  task: Pick<DecomposedTask, 'id' | 'agent' | 'title'>,
  context: {
    gitnexusTaskBinding?: GitNexusTaskBinding;
    gitnexusArtifactPath?: string;
  },
): GitNexusTaskBinding {
  const binding = context.gitnexusTaskBinding;
  if (!binding) {
    throw new Error(
      `GitNexus runtime context is missing for ${task.id}. Planning must create a GitNexus artifact before ${task.agent} can run.`,
    );
  }

  if (binding.agent !== task.agent) {
    throw new Error(
      `GitNexus runtime context mismatch for ${task.id}: expected ${task.agent}, got ${binding.agent}.`,
    );
  }

  return binding;
}

export function renderGitNexusBindingNote(binding: GitNexusTaskBinding, artifactPath?: string) {
  const anchors = binding.anchorSymbols
    .map((anchor) => `${anchor.symbolName} (${anchor.impact.risk}, blast radius ${anchor.impact.impactedCount})`)
    .join(', ');
  const query = binding.queryHighlights.length > 0 ? binding.queryHighlights.join(' / ') : 'no issue-level query highlights';
  const artifactNote = artifactPath ? `GitNexus artifact: ${artifactPath}.` : '';

  return [`GitNexus highlights: ${query}.`, anchors ? `Anchor symbols: ${anchors}.` : '', artifactNote]
    .filter(Boolean)
    .join(' ');
}
