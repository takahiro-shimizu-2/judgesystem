#!/usr/bin/env tsx

import { Octokit } from '@octokit/rest';

type State =
  | 'pending'
  | 'analyzing'
  | 'implementing'
  | 'reviewing'
  | 'done'
  | 'blocked'
  | 'failed'
  | 'paused';

type AgentType =
  | 'coordinator'
  | 'codegen'
  | 'review'
  | 'issue'
  | 'pr'
  | 'deployment';

type Priority = 'P0-Critical' | 'P1-High' | 'P2-Medium' | 'P3-Low';
type Severity = 'Sev.1-Critical' | 'Sev.2-High' | 'Sev.3-Medium' | 'Sev.4-Low';

interface IssueState {
  number: number;
  title: string;
  state: State | null;
  agent: AgentType | null;
  priority: Priority | null;
  severity: Severity | null;
  labels: string[];
  canTransitionTo: State[];
}

interface StateTransition {
  from: State;
  to: State;
  trigger: string;
  action: string;
  validation?: (issue: IssueState) => boolean;
}

const STATE_TRANSITIONS: StateTransition[] = [
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
    to: 'reviewing',
    trigger: 'Pull request created',
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
    from: 'reviewing',
    to: 'failed',
    trigger: 'Review execution failed',
    action: 'Record failure',
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

class LabelStateMachine {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  async getIssueState(issueNumber: number): Promise<IssueState> {
    const { data: issue } = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });

    const labels = issue.labels.map((label) => (typeof label === 'string' ? label : label.name || ''));
    const state = this.extractState(labels);
    const agent = this.extractAgent(labels);
    const priority = this.extractPriority(labels);
    const severity = this.extractSeverity(labels);

    return {
      number: issue.number,
      title: issue.title,
      state,
      agent,
      priority,
      severity,
      labels,
      canTransitionTo: this.getValidTransitions(state),
    };
  }

  async transitionState(issueNumber: number, newState: State, reason?: string) {
    const currentState = await this.getIssueState(issueNumber);

    if (currentState.state === newState) {
      return;
    }

    if (currentState.state) {
      const transition = STATE_TRANSITIONS.find(
        (candidate) => candidate.from === currentState.state && candidate.to === newState,
      );

      if (!transition) {
        throw new Error(`Invalid state transition: ${currentState.state} -> ${newState}`);
      }

      if (transition.validation && !transition.validation(currentState)) {
        throw new Error(`Transition validation failed: ${transition.trigger}`);
      }
    }

    for (const label of currentState.labels.filter((label) => label.includes('state:'))) {
      await this.octokit.rest.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        name: label,
      });
    }

    await this.octokit.rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [this.stateToLabel(newState)],
    });

    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: `## State Transition

**From**: ${currentState.state || 'none'}
**To**: ${newState}
${reason ? `**Reason**: ${reason}` : ''}

Automated by \`scripts/label-state-machine.ts\`.`,
    });
  }

  async assignAgent(issueNumber: number, agent: AgentType) {
    const currentState = await this.getIssueState(issueNumber);

    for (const label of currentState.labels.filter((label) => label.includes('agent:'))) {
      await this.octokit.rest.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        name: label,
      });
    }

    await this.octokit.rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [`🤖 agent:${agent}`],
    });
  }

  private extractState(labels: string[]): State | null {
    const stateLabel = labels.find((label) => label.includes('state:'));
    if (!stateLabel) {
      return null;
    }

    if (stateLabel.includes('pending')) return 'pending';
    if (stateLabel.includes('analyzing')) return 'analyzing';
    if (stateLabel.includes('implementing')) return 'implementing';
    if (stateLabel.includes('reviewing')) return 'reviewing';
    if (stateLabel.includes('done')) return 'done';
    if (stateLabel.includes('blocked')) return 'blocked';
    if (stateLabel.includes('failed')) return 'failed';
    if (stateLabel.includes('paused')) return 'paused';
    return null;
  }

  private extractAgent(labels: string[]): AgentType | null {
    const agentLabel = labels.find((label) => label.includes('agent:'));
    if (!agentLabel) {
      return null;
    }

    if (agentLabel.includes('coordinator')) return 'coordinator';
    if (agentLabel.includes('codegen')) return 'codegen';
    if (agentLabel.includes('review')) return 'review';
    if (agentLabel.includes('issue')) return 'issue';
    if (agentLabel.includes('pr')) return 'pr';
    if (agentLabel.includes('deployment')) return 'deployment';
    return null;
  }

  private extractPriority(labels: string[]): Priority | null {
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

  private extractSeverity(labels: string[]): Severity | null {
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

  private stateToLabel(state: State) {
    const labels: Record<State, string> = {
      pending: '📥 state:pending',
      analyzing: '🔍 state:analyzing',
      implementing: '🏗️ state:implementing',
      reviewing: '👀 state:reviewing',
      done: '✅ state:done',
      blocked: '🚫 state:blocked',
      failed: '❌ state:failed',
      paused: '⏸️ state:paused',
    };

    return labels[state];
  }

  private getValidTransitions(currentState: State | null) {
    if (!currentState) {
      return ['pending', 'analyzing'] as State[];
    }

    return STATE_TRANSITIONS
      .filter((transition) => transition.from === currentState)
      .map((transition) => transition.to);
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN or GH_TOKEN is required');
    process.exit(1);
  }

  const repository = process.env.GITHUB_REPOSITORY || process.env.REPOSITORY || 'takahiro-shimizu-1/my-app';
  const [owner, repo] = repository.split('/');
  const command = process.argv[2];
  const issueNumber = parseNumberArg('--issue');
  const targetState = parseStringArg('--to') as State | null;
  const agent = parseStringArg('--agent') as AgentType | null;
  const reason = parseStringArg('--reason') || undefined;

  const stateMachine = new LabelStateMachine(token, owner, repo);

  try {
    switch (command) {
      case 'check':
        if (!issueNumber) {
          throw new Error('--issue=<number> is required');
        }
        console.log(JSON.stringify(await stateMachine.getIssueState(issueNumber), null, 2));
        break;
      case 'transition':
        if (!issueNumber || !targetState) {
          throw new Error('--issue=<number> and --to=<state> are required');
        }
        await stateMachine.transitionState(issueNumber, targetState, reason);
        break;
      case 'assign-agent':
        if (!issueNumber || !agent) {
          throw new Error('--issue=<number> and --agent=<type> are required');
        }
        await stateMachine.assignAgent(issueNumber, agent);
        break;
      default:
        console.log(`Usage:
  npm run state:check -- --issue=<number>
  npm run state:transition -- --issue=<number> --to=<state> [--reason=<text>]
  npm run state:assign-agent -- --issue=<number> --agent=<type>`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function parseStringArg(flag: string) {
  const argument = process.argv.find((value) => value.startsWith(`${flag}=`));
  return argument ? argument.slice(flag.length + 1) : null;
}

function parseNumberArg(flag: string) {
  const value = parseStringArg(flag);
  return value ? parseInt(value, 10) : null;
}

main();
