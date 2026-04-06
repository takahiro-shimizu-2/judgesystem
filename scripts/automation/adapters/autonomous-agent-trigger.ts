import path from 'node:path';
import { appendFileSync, readFileSync } from 'node:fs';

export interface AutonomousAgentTriggerDecision {
  shouldExecute: boolean;
  issueNumber: string;
  executionMode: 'planning' | 'execute';
  triggerSource: string;
  triggerNote: string;
}

export interface AutonomousAgentTriggerInput {
  eventName: string;
  payload: Record<string, unknown>;
  inputIssueNumber?: string;
  inputExecutionMode?: string;
  labelExecuteGate?: boolean;
  commentExecuteGate?: boolean;
}

export function evaluateAutonomousAgentTrigger(input: AutonomousAgentTriggerInput): AutonomousAgentTriggerDecision {
  const { eventName, payload } = input;

  const decision: AutonomousAgentTriggerDecision = {
    shouldExecute: false,
    issueNumber: '',
    executionMode: 'planning',
    triggerSource: '',
    triggerNote: '',
  };

  if (eventName === 'workflow_dispatch') {
    decision.shouldExecute = true;
    decision.issueNumber = input.inputIssueNumber || '';
    decision.executionMode = normalizeExecutionMode(input.inputExecutionMode);
    decision.triggerSource = 'workflow_dispatch';
    decision.triggerNote = `manual ${decision.executionMode} run`;
    return decision;
  }

  if (eventName === 'issues') {
    const issue = getRecord(payload.issue);
    const labels = getLabelNames(issue.labels);
    const labeledName = getString(getRecord(payload.label).name);
    const action = getString(payload.action);
    const hasExecuteLabel = labels.includes('🤖agent-execute');

    if (action === 'labeled' && labeledName === '🤖agent-execute') {
      decision.shouldExecute = true;
      decision.issueNumber = getNumberString(issue.number);
      decision.triggerSource = 'issue-label';
      if (input.labelExecuteGate) {
        decision.executionMode = 'execute';
        decision.triggerNote = 'label execute gate enabled';
      } else {
        decision.triggerNote =
          'label trigger defaults to planning; enable AUTONOMOUS_AGENT_LABEL_EXECUTE_ENABLED=true to open execute on labeled events';
      }
      return decision;
    }

    if (action === 'edited' && hasExecuteLabel) {
      decision.shouldExecute = true;
      decision.issueNumber = getNumberString(issue.number);
      decision.triggerSource = 'issue-edit';
      decision.executionMode = 'planning';
      decision.triggerNote = 'issue edited while execute label is present; rerunning planning only';
      return decision;
    }

    return decision;
  }

  if (eventName === 'issue_comment') {
    const issue = getRecord(payload.issue);
    const commentBody = getString(getRecord(payload.comment).body).trim();
    const commentLower = commentBody.toLowerCase();
    const slashAgent = new RegExp(String.raw`^\s*\/agent(?:\s+.+)?$`, 'im').test(commentBody);
    const miyabiMention = commentLower.includes('@miyabi');
    const requestedExecute =
      new RegExp(String.raw`^\s*\/agent\s+execute\b`, 'im').test(commentBody) ||
      new RegExp(String.raw`@miyabi\b.*\bexecute\b`, 'i').test(commentBody);

    if (slashAgent || miyabiMention) {
      decision.shouldExecute = true;
      decision.issueNumber = getNumberString(issue.number);
      decision.triggerSource = 'issue-comment';
      if (requestedExecute && input.commentExecuteGate) {
        decision.executionMode = 'execute';
        decision.triggerNote = 'comment execute gate enabled';
      } else if (requestedExecute) {
        decision.triggerNote = 'comment requested execute but gate is closed; falling back to planning';
      } else {
        decision.triggerNote = 'comment trigger defaults to planning';
      }
    }
  }

  return decision;
}

export async function runAutonomousAgentTriggerCli(env = process.env) {
  const eventName = env.EVENT_NAME || '';
  const payloadPath = env.GITHUB_EVENT_PATH || '';
  const payload = payloadPath ? JSON.parse(readFileSync(payloadPath, 'utf8')) : {};
  const decision = evaluateAutonomousAgentTrigger({
    eventName,
    payload,
    inputIssueNumber: env.INPUT_ISSUE_NUMBER,
    inputExecutionMode: env.INPUT_EXECUTION_MODE,
    labelExecuteGate: env.LABEL_EXECUTE_GATE?.toLowerCase() === 'true',
    commentExecuteGate: env.COMMENT_EXECUTE_GATE?.toLowerCase() === 'true',
  });

  for (const [key, value] of Object.entries(decision)) {
    console.log(`${key}=${value}`);
  }

  const outputPath = env.GITHUB_OUTPUT;
  if (outputPath) {
    const lines = Object.entries(decision).map(([key, value]) => `${key}=${value}`);
    appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  }
}

function normalizeExecutionMode(value?: string) {
  return value === 'execute' ? 'execute' : 'planning';
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getNumberString(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function getLabelNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => getString(getRecord(entry).name))
    .filter(Boolean);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  void runAutonomousAgentTriggerCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
