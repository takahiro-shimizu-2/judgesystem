import type { AutomationIssue } from '../decomposition/llm-decomposer.js';
import { truncateText, unique } from '../core/utils.js';

export type OmegaCapability = 'analysis' | 'codegen' | 'test' | 'review' | 'pr' | 'deploy';
export type OmegaRunMode = 'planning' | 'execute';

export interface OmegaLearningCarryForward {
  knowledgeId: string;
  sourceSessionId: string;
  createdAt: string;
  sourcePath: string;
  overallLearningScore: number;
  immediateRecommendations: string[];
  lessonPreview: string;
}

export interface OmegaIntent {
  issueNumber: number;
  normalizedGoal: string;
  desiredOutcome: string;
  goals: string[];
  constraints: string[];
  risks: string[];
  preferredCapabilities: OmegaCapability[];
  currentRunMode: OmegaRunMode;
  recommendedNextMode: OmegaRunMode;
  sourceSignals: string[];
}

export interface OmegaStrategicPlanPhase {
  id: string;
  label: string;
  owner: string;
  objective: string;
  capabilities: OmegaCapability[];
  successCriteria: string[];
}

export interface OmegaStrategicPlan {
  summary: string;
  deliverableFocus: string;
  assumptions: string[];
  phases: OmegaStrategicPlanPhase[];
  successCriteria: string[];
  riskMitigations: string[];
}

export interface OmegaPlanningLayer {
  intent: OmegaIntent;
  strategicPlan: OmegaStrategicPlan;
  previousLearning?: OmegaLearningCarryForward;
}

export interface OmegaPlanningOptions {
  dryRun?: boolean;
  previousLearning?: OmegaLearningCarryForward;
}

const GOAL_LIMIT = 5;
const CONSTRAINT_LIMIT = 4;
const RISK_LIMIT = 4;

export function createOmegaPlanningLayer(
  issue: AutomationIssue,
  options: OmegaPlanningOptions = {},
): OmegaPlanningLayer {
  const currentRunMode: OmegaRunMode = options.dryRun ? 'planning' : 'execute';
  const goals = extractGoalCandidates(issue).slice(0, GOAL_LIMIT);
  const preferredCapabilities = inferCapabilities(issue, goals);
  const constraints = inferConstraints(issue, preferredCapabilities, currentRunMode);
  const risks = inferRisks(issue, goals, preferredCapabilities);
  const sourceSignals = inferSourceSignals(issue, goals);
  const normalizedGoal =
    goals[0] || truncateText(issue.title || `Issue #${issue.number}`, 140);
  const desiredOutcome = describeDesiredOutcome(preferredCapabilities, normalizedGoal);
  const recommendedNextMode =
    currentRunMode === 'planning' || preferredCapabilities.includes('deploy') || risks.length > 2 ? 'planning' : 'execute';

  const intent: OmegaIntent = {
    issueNumber: issue.number,
    normalizedGoal,
    desiredOutcome,
    goals,
    constraints,
    risks,
    preferredCapabilities,
    currentRunMode,
    recommendedNextMode,
    sourceSignals,
  };

  return {
    intent,
    strategicPlan: buildStrategicPlan(issue, intent, options.previousLearning),
    previousLearning: options.previousLearning,
  };
}

export function buildStrategicPlanMarkdown(args: {
  sessionId: string;
  createdAt: string;
  issue: AutomationIssue;
  planning: OmegaPlanningLayer;
}) {
  const { issue, planning } = args;
  const sections = [
    `# Omega Strategic Plan: Issue #${issue.number}`,
    [
      `**Title**: ${issue.title}`,
      `**Session**: \`${args.sessionId}\``,
      `**Created**: ${formatTimestamp(args.createdAt)}`,
      `**Current Run Mode**: \`${planning.intent.currentRunMode}\``,
      `**Recommended Next Mode**: \`${planning.intent.recommendedNextMode}\``,
    ].join('\n'),
    `## Intent\n\n- **Normalized Goal**: ${planning.intent.normalizedGoal}\n- **Desired Outcome**: ${planning.intent.desiredOutcome}\n- **Preferred Capabilities**: ${planning.intent.preferredCapabilities
      .map((capability) => `\`${capability}\``)
      .join(', ')}`,
    `## Strategic Summary\n\n${planning.strategicPlan.summary}\n\n- **Deliverable Focus**: ${planning.strategicPlan.deliverableFocus}`,
    `## Phases\n\n${planning.strategicPlan.phases
      .map(
        (phase) => `### ${phase.label}

- **Owner**: \`${phase.owner}\`
- **Objective**: ${phase.objective}
- **Capabilities**: ${phase.capabilities.map((capability) => `\`${capability}\``).join(', ')}
- **Success Criteria**:
${phase.successCriteria.map((criterion) => `  - ${criterion}`).join('\n')}`,
      )
      .join('\n\n')}`,
    `## Assumptions\n\n${renderList(planning.strategicPlan.assumptions)}`,
    `## Success Criteria\n\n${renderList(planning.strategicPlan.successCriteria)}`,
    `## Risk Mitigations\n\n${renderList(planning.strategicPlan.riskMitigations)}`,
  ];

  return `${sections.join('\n\n')}\n`;
}

function buildStrategicPlan(
  issue: AutomationIssue,
  intent: OmegaIntent,
  previousLearning?: OmegaLearningCarryForward,
): OmegaStrategicPlan {
  const deliverableFocus = describeDeliverableFocus(intent.preferredCapabilities);
  const phases = buildPhases(intent);
  const assumptions = [
    'Existing decomposition, DAG, and handler routing remain the current theta2-theta4 substrate for this slice.',
    intent.currentRunMode === 'planning'
      ? 'This run stays planning-first; write-capable side effects remain gated and are not assumed.'
      : 'This run may execute connected handlers, but each side effect must still satisfy its explicit runtime gates.',
    'Any missing runtime capability should stay truthfully visible in reports instead of being treated as implicitly available.',
    previousLearning
      ? `Carry forward lessons from ${previousLearning.sourceSessionId} (learning score ${previousLearning.overallLearningScore}/100).`
      : null,
  ];
  const successCriteria = [
    `Translate Issue #${issue.number} into an intent-first plan before decomposition begins.`,
    'Preserve explicit handoffs for code generation, testing, review, PR, and deploy when those capabilities are in scope.',
    `Produce a deliverable that is ${deliverableFocus.toLowerCase()} and traceable through runtime artifacts.`,
  ];
  const riskMitigations = [
    ...intent.risks.map((risk) => mitigateRisk(risk)),
    ...(previousLearning?.immediateRecommendations || []),
    intent.preferredCapabilities.includes('deploy')
      ? 'Keep deployment on the protected workflow path or an approved provider preset before any execute run is considered healthy.'
      : 'Use worktree-isolated execution and report artifacts to keep changes auditable across the quality pipeline.',
  ];

  return {
    summary: `Start from the issue intent, then drive the existing DAG/runtime substrate toward ${deliverableFocus.toLowerCase()} with capability-aware handoffs.`,
    deliverableFocus,
    assumptions: unique(assumptions.filter((value): value is string => Boolean(value))),
    phases,
    successCriteria: unique(successCriteria),
    riskMitigations: unique(riskMitigations.filter((value): value is string => Boolean(value))),
  };
}

function buildPhases(intent: OmegaIntent): OmegaStrategicPlanPhase[] {
  const executionOwner = intent.preferredCapabilities.includes('deploy')
    ? 'DeploymentAgent'
    : intent.preferredCapabilities.includes('pr')
      ? 'PRAgent'
      : intent.preferredCapabilities.includes('review')
        ? 'ReviewAgent'
        : 'CodeGenAgent';

  return [
    {
      id: 'theta1-understanding',
      label: 'Theta 1 Understanding',
      owner: 'CoordinatorAgent',
      objective: 'Normalize the issue into an execution-ready intent with explicit goals, constraints, risks, and success signals.',
      capabilities: ['analysis'],
      successCriteria: [
        'Intent captures the primary goal and desired outcome.',
        'Constraints and risks are visible before task decomposition starts.',
      ],
    },
    {
      id: 'theta2-generation',
      label: 'Theta 2 Generation',
      owner: 'CoordinatorAgent',
      objective: 'Translate the strategic intent into DAG-backed tasks and synthetic handoffs that the current runtime can execute truthfully.',
      capabilities: unique(['analysis', ...intent.preferredCapabilities.filter((capability) => capability !== 'deploy')]),
      successCriteria: [
        'Task decomposition remains aligned with the issue while the strategic plan provides the high-level route.',
        'Downstream quality and release stages stay explicit instead of being inferred later.',
      ],
    },
    {
      id: 'theta3-allocation',
      label: 'Theta 3 Allocation',
      owner: 'CoordinatorAgent',
      objective: 'Assign the right agent, worktree, and runtime gate to each phase before execution begins.',
      capabilities: unique(['analysis', ...intent.preferredCapabilities]),
      successCriteria: [
        'Each capability has an owner or an explicit missing-handler warning.',
        'Worktree isolation and execute gates are visible before any write happens.',
      ],
    },
    {
      id: 'theta4-execution',
      label: 'Theta 4 Execution',
      owner: executionOwner,
      objective: 'Run the capability pipeline with artifact preservation so later integration and learning stages can summarize the outcome cleanly.',
      capabilities: intent.preferredCapabilities,
      successCriteria: [
        'Execution artifacts stay replayable and discoverable under .ai/parallel-reports.',
        'Quality, PR, and deploy stages follow explicit handoffs rather than implicit transitions.',
      ],
    },
  ];
}

function extractGoalCandidates(issue: AutomationIssue) {
  const body = issue.body || '';
  const lines = body.split('\n');
  const checklist = lines
    .map((line) => line.match(/^\s*[-*]\s*\[(?: |x|X)\]\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[1].trim());
  if (checklist.length > 0) {
    return checklist;
  }

  const ordered = lines
    .map((line) => line.match(/^\s*\d+\.\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[1].trim());
  if (ordered.length > 0) {
    return ordered;
  }

  const headings = lines
    .map((line) => line.match(/^\s{0,3}#{2,6}\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (headings.length > 0) {
    return headings;
  }

  const bodySentences = body
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => truncateText(line, 140));

  return unique([issue.title, ...bodySentences].filter(Boolean));
}

function inferCapabilities(issue: AutomationIssue, goals: string[]): OmegaCapability[] {
  const haystack = [issue.title, issue.body || '', ...goals, ...(issue.labels || [])].join('\n').toLowerCase();
  const capabilities: OmegaCapability[] = ['analysis'];

  if (matchesAny(haystack, ['feature', 'add', 'new', 'implement', 'fix', 'bug', 'refactor', 'cleanup', 'improve', 'docs', 'readme', 'guide', '実装', '追加', '修正', '改善', 'ドキュメント'])) {
    capabilities.push('codegen');
  }

  if (matchesAny(haystack, ['test', 'coverage', 'integration', 'unit', 'e2e', 'spec', 'benchmark', 'テスト'])) {
    capabilities.push('test');
  }

  if (matchesAny(haystack, ['review', 'security', 'lint', 'quality', 'audit', 'verify', 'レビュー', '検証'])) {
    capabilities.push('review');
  }

  if (matchesAny(haystack, ['pull request', 'draft pr', 'reviewer', 'merge', 'label', 'release note', 'pr', 'プルリク'])) {
    capabilities.push('pr');
  }

  if (matchesAny(haystack, ['deploy', 'release', 'production', 'cloud run', 'github pages', 'デプロイ', 'リリース'])) {
    capabilities.push('deploy');
  }

  if ((capabilities.includes('codegen') || capabilities.includes('test') || capabilities.includes('review')) && !capabilities.includes('pr')) {
    capabilities.push('pr');
  }

  if (!capabilities.includes('codegen') && !capabilities.includes('deploy')) {
    capabilities.push('codegen');
  }

  return unique(capabilities);
}

function inferConstraints(
  issue: AutomationIssue,
  capabilities: OmegaCapability[],
  currentRunMode: OmegaRunMode,
) {
  const constraints: string[] = [];

  if (issue.labels && issue.labels.length > 0) {
    constraints.push(`Respect the active issue labels: ${issue.labels.join(', ')}.`);
  }

  constraints.push(
    currentRunMode === 'planning'
      ? 'This session is planning-only, so code, PR, and deploy side effects remain gated.'
      : 'This session may execute connected handlers, but each side effect still requires its explicit runtime gate.',
  );

  if (capabilities.includes('pr')) {
    constraints.push('Remote PR creation, reviewer assignment, and mergeability checks are optional write surfaces and must stay gate-controlled.');
  }

  if (capabilities.includes('deploy')) {
    constraints.push('Deploy steps require approval, provider contract, and healthcheck handling before they can be treated as successful.');
  }

  const bodyConstraints = extractPolicyLines(issue.body || '');
  constraints.push(...bodyConstraints);

  return unique(constraints).slice(0, CONSTRAINT_LIMIT);
}

function inferRisks(issue: AutomationIssue, goals: string[], capabilities: OmegaCapability[]) {
  const risks: string[] = [];

  if (!issue.body || extractGoalCandidates(issue).length === 1) {
    risks.push('The issue does not provide a rich structured task list, so decomposition may need coordinator interpretation.');
  }

  if (goals.length >= 4) {
    risks.push('Multiple explicit goals increase coordination pressure across the DAG and quality handoffs.');
  }

  if (capabilities.includes('deploy')) {
    risks.push('Deployment scope introduces side-effect risk, so approval and healthcheck expectations must stay explicit.');
  }

  if (capabilities.includes('pr')) {
    risks.push('PR-side actions depend on repository permissions and branch/write gates that may not be open in every run.');
  }

  return unique(risks).slice(0, RISK_LIMIT);
}

function inferSourceSignals(issue: AutomationIssue, goals: string[]) {
  const signals = [
    issue.body && /\[[ xX]\]/.test(issue.body) ? 'issue-checklist' : null,
    issue.body && /^\s*\d+\./m.test(issue.body) ? 'issue-ordered-list' : null,
    issue.labels && issue.labels.length > 0 ? 'issue-labels' : null,
    goals.length > 1 ? 'multi-goal-issue' : 'single-goal-issue',
  ].filter((value): value is string => Boolean(value));

  return unique(signals);
}

function describeDesiredOutcome(capabilities: OmegaCapability[], normalizedGoal: string) {
  const deliverableFocus = describeDeliverableFocus(capabilities).toLowerCase();
  return `${truncateText(normalizedGoal, 120)} -> ${deliverableFocus}`;
}

function describeDeliverableFocus(capabilities: OmegaCapability[]) {
  if (capabilities.includes('deploy')) {
    return 'a validated implementation, PR handoff, and deploy-ready artifact set';
  }

  if (capabilities.includes('pr')) {
    return 'a validated implementation with PR-ready artifacts';
  }

  if (capabilities.includes('review') || capabilities.includes('test')) {
    return 'a change set with explicit quality and review evidence';
  }

  return 'an execution-ready implementation plan and artifact set';
}

function mitigateRisk(risk: string) {
  if (risk.includes('structured task list')) {
    return 'Keep the strategic plan explicit so decomposition warnings stay visible and the coordinator can hand off intent cleanly.';
  }

  if (risk.includes('coordination pressure')) {
    return 'Use the DAG and shared worktree handoffs to keep multi-goal execution ordered and replayable.';
  }

  if (risk.includes('Deployment scope')) {
    return 'Route deploy work through protected workflows or provider presets with approval and healthcheck gates.';
  }

  if (risk.includes('PR-side actions')) {
    return 'Leave PR-side writes as optional gates and preserve a local draft artifact even when GitHub writes are unavailable.';
  }

  return `Mitigate explicitly: ${risk}`;
}

function extractPolicyLines(body: string) {
  return body
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => /must|should|without|do not|before|avoid|必須|禁止|避け/.test(line.toLowerCase()))
    .slice(0, 2)
    .map((line) => `Constraint inferred from issue body: ${truncateText(line, 140)}`);
}

function matchesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function renderList(values: string[]) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- None';
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
