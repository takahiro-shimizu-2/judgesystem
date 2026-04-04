import { Octokit } from '@octokit/rest';

import { replaceIssueLabelsByPrefix } from '../sync/github-label-sync.js';
import { buildIssueStateFromLabels } from './label-state-bridge.js';
import {
  stateToLabel,
  type AgentType,
  type IssueState,
  type State,
  validateTransition,
} from './task-state-machine.js';

export class LabelStateMachine {
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

    return buildIssueStateFromLabels({
      number: issue.number,
      title: issue.title,
      labels: issue.labels.map((label) => (typeof label === 'string' ? label : label.name || '')),
    });
  }

  async transitionState(issueNumber: number, newState: State, reason?: string) {
    const currentState = await this.getIssueState(issueNumber);

    if (currentState.state === newState) {
      return;
    }

    validateTransition(currentState, newState);

    await replaceIssueLabelsByPrefix({
      octokit: this.octokit,
      owner: this.owner,
      repo: this.repo,
      issueNumber,
      existingLabels: currentState.labels,
      prefix: 'state:',
      nextLabels: [stateToLabel(newState)],
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

    await replaceIssueLabelsByPrefix({
      octokit: this.octokit,
      owner: this.owner,
      repo: this.repo,
      issueNumber,
      existingLabels: currentState.labels,
      prefix: 'agent:',
      nextLabels: [`🤖 agent:${agent}`],
    });
  }
}

export async function runLabelStateMachineCli(argv = process.argv, env = process.env) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN or GH_TOKEN is required');
    process.exit(1);
  }

  const repository = env.GITHUB_REPOSITORY || env.REPOSITORY || 'takahiro-shimizu-2/judgesystem';
  const [owner, repo] = repository.split('/');
  const command = argv[2];
  const issueNumber = parseNumberArg(argv, '--issue');
  const targetState = parseStringArg(argv, '--to') as State | null;
  const agent = parseStringArg(argv, '--agent') as AgentType | null;
  const reason = parseStringArg(argv, '--reason') || undefined;

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

function parseStringArg(argv: string[], flag: string) {
  const argument = argv.find((value) => value.startsWith(`${flag}=`));
  return argument ? argument.slice(flag.length + 1) : null;
}

function parseNumberArg(argv: string[], flag: string) {
  const value = parseStringArg(argv, flag);
  return value ? parseInt(value, 10) : null;
}
