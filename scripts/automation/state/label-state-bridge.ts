import {
  extractAgent,
  extractPriority,
  extractSeverity,
  extractState,
  getValidTransitions,
  type IssueState,
} from './task-state-machine.js';

interface IssueLabelSnapshot {
  number: number;
  title: string;
  labels: string[];
}

export function buildIssueStateFromLabels(issue: IssueLabelSnapshot): IssueState {
  const state = extractState(issue.labels);
  const agent = extractAgent(issue.labels);
  const priority = extractPriority(issue.labels);
  const severity = extractSeverity(issue.labels);

  return {
    number: issue.number,
    title: issue.title,
    state,
    agent,
    priority,
    severity,
    labels: issue.labels,
    canTransitionTo: getValidTransitions(state),
  };
}
