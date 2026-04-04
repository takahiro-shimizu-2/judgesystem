export type State =
  | 'pending'
  | 'analyzing'
  | 'implementing'
  | 'testing'
  | 'reviewing'
  | 'done'
  | 'blocked'
  | 'failed'
  | 'paused';

export type AgentType =
  | 'coordinator'
  | 'codegen'
  | 'test'
  | 'review'
  | 'issue'
  | 'pr'
  | 'deployment';

export type Priority = 'P0-Critical' | 'P1-High' | 'P2-Medium' | 'P3-Low';
export type Severity = 'Sev.1-Critical' | 'Sev.2-High' | 'Sev.3-Medium' | 'Sev.4-Low';

export interface IssueState {
  number: number;
  title: string;
  state: State | null;
  agent: AgentType | null;
  priority: Priority | null;
  severity: Severity | null;
  labels: string[];
  canTransitionTo: State[];
}

export interface StateTransition {
  from: State;
  to: State;
  trigger: string;
  action: string;
  validation?: (issue: IssueState) => boolean;
}

export const STATE_TRANSITIONS: StateTransition[] = [
  {
    from: 'pending',
    to: 'analyzing',
    trigger: 'Coordinator agent assigned',
    action: 'Analyze dependencies and complexity',
  },
  {
    from: 'analyzing',
    to: 'implementing',
    trigger: 'Specialist agent assigned',
    action: 'Start implementation',
    validation: (issue) => issue.agent !== null && issue.agent !== 'coordinator',
  },
  {
    from: 'implementing',
    to: 'analyzing',
    trigger: 'Retry requested',
    action: 'Restart analysis',
  },
  {
    from: 'implementing',
    to: 'testing',
    trigger: 'Implementation complete',
    action: 'Start automated test execution',
  },
  {
    from: 'implementing',
    to: 'reviewing',
    trigger: 'Pull request created',
    action: 'Start review',
  },
  {
    from: 'testing',
    to: 'implementing',
    trigger: 'Test remediation requested',
    action: 'Return to implementation',
  },
  {
    from: 'testing',
    to: 'reviewing',
    trigger: 'Tests passed',
    action: 'Start review',
  },
  {
    from: 'reviewing',
    to: 'analyzing',
    trigger: 'Retry requested',
    action: 'Restart analysis',
  },
  {
    from: 'reviewing',
    to: 'done',
    trigger: 'Pull request merged',
    action: 'Finish execution',
  },
  {
    from: 'pending',
    to: 'blocked',
    trigger: 'Missing dependencies',
    action: 'Escalate blocker',
  },
  {
    from: 'analyzing',
    to: 'blocked',
    trigger: 'Cannot resolve dependencies',
    action: 'Escalate blocker',
  },
  {
    from: 'implementing',
    to: 'blocked',
    trigger: 'Implementation blocked',
    action: 'Escalate blocker',
  },
  {
    from: 'pending',
    to: 'failed',
    trigger: 'Execution failed before analysis',
    action: 'Record failure',
  },
  {
    from: 'analyzing',
    to: 'failed',
    trigger: 'Analysis failed',
    action: 'Record failure',
  },
  {
    from: 'implementing',
    to: 'failed',
    trigger: 'Implementation failed',
    action: 'Record failure',
  },
  {
    from: 'testing',
    to: 'failed',
    trigger: 'Test execution failed',
    action: 'Record failure',
  },
  {
    from: 'reviewing',
    to: 'failed',
    trigger: 'Review execution failed',
    action: 'Record failure',
  },
  {
    from: 'testing',
    to: 'blocked',
    trigger: 'Critical test failure',
    action: 'Escalate blocker',
  },
  {
    from: 'reviewing',
    to: 'blocked',
    trigger: 'Critical review failure',
    action: 'Escalate blocker',
  },
  {
    from: 'blocked',
    to: 'analyzing',
    trigger: 'Blocker cleared',
    action: 'Restart analysis',
  },
  {
    from: 'failed',
    to: 'analyzing',
    trigger: 'Retry requested',
    action: 'Restart analysis',
  },
  {
    from: 'paused',
    to: 'implementing',
    trigger: 'Resume requested',
    action: 'Continue implementation',
  },
];

const STATE_LABELS: Record<State, string> = {
  pending: '📥 state:pending',
  analyzing: '🔍 state:analyzing',
  implementing: '🏗️ state:implementing',
  testing: '🧪 state:testing',
  reviewing: '👀 state:reviewing',
  done: '✅ state:done',
  blocked: '🚫 state:blocked',
  failed: '❌ state:failed',
  paused: '⏸️ state:paused',
};

export function extractState(labels: string[]): State | null {
  const stateLabel = labels.find((label) => label.includes('state:'));
  if (!stateLabel) {
    return null;
  }

  if (stateLabel.includes('pending')) return 'pending';
  if (stateLabel.includes('analyzing')) return 'analyzing';
  if (stateLabel.includes('implementing')) return 'implementing';
  if (stateLabel.includes('testing')) return 'testing';
  if (stateLabel.includes('reviewing')) return 'reviewing';
  if (stateLabel.includes('done')) return 'done';
  if (stateLabel.includes('blocked')) return 'blocked';
  if (stateLabel.includes('failed')) return 'failed';
  if (stateLabel.includes('paused')) return 'paused';
  return null;
}

export function extractAgent(labels: string[]): AgentType | null {
  const agentLabel = labels.find((label) => label.includes('agent:'));
  if (!agentLabel) {
    return null;
  }

  if (agentLabel.includes('coordinator')) return 'coordinator';
  if (agentLabel.includes('codegen')) return 'codegen';
  if (agentLabel.includes('test')) return 'test';
  if (agentLabel.includes('review')) return 'review';
  if (agentLabel.includes('issue')) return 'issue';
  if (agentLabel.includes('pr')) return 'pr';
  if (agentLabel.includes('deployment')) return 'deployment';
  return null;
}

export function extractPriority(labels: string[]): Priority | null {
  const priorityLabel = labels.find((label) => label.includes('priority:'));
  if (!priorityLabel) {
    return null;
  }

  if (priorityLabel.includes('P0-Critical')) return 'P0-Critical';
  if (priorityLabel.includes('P1-High')) return 'P1-High';
  if (priorityLabel.includes('P2-Medium')) return 'P2-Medium';
  if (priorityLabel.includes('P3-Low')) return 'P3-Low';
  return null;
}

export function extractSeverity(labels: string[]): Severity | null {
  const severityLabel = labels.find((label) => label.includes('severity:'));
  if (!severityLabel) {
    return null;
  }

  if (severityLabel.includes('Sev.1-Critical')) return 'Sev.1-Critical';
  if (severityLabel.includes('Sev.2-High')) return 'Sev.2-High';
  if (severityLabel.includes('Sev.3-Medium')) return 'Sev.3-Medium';
  if (severityLabel.includes('Sev.4-Low')) return 'Sev.4-Low';
  return null;
}

export function stateToLabel(state: State) {
  return STATE_LABELS[state];
}

export function getValidTransitions(currentState: State | null): State[] {
  if (!currentState) {
    return ['pending', 'analyzing'];
  }

  return STATE_TRANSITIONS
    .filter((transition) => transition.from === currentState)
    .map((transition) => transition.to);
}

export function validateTransition(issue: IssueState, nextState: State) {
  if (!issue.state || issue.state === nextState) {
    return;
  }

  const transition = STATE_TRANSITIONS.find(
    (candidate) => candidate.from === issue.state && candidate.to === nextState,
  );

  if (!transition) {
    throw new Error(`Invalid state transition: ${issue.state} -> ${nextState}`);
  }

  if (transition.validation && !transition.validation(issue)) {
    throw new Error(`Transition validation failed: ${transition.trigger}`);
  }
}
