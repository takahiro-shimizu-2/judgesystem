import type { DecomposedTask } from '../../decomposition/llm-decomposer.js';
import type {
  AutomationAgentDefinition,
  AutomationAgentHandlerResult,
} from '../handler-contract.js';

interface GenericAgentFallbackOptions {
  task: DecomposedTask;
  definition?: AutomationAgentDefinition;
  reason: 'missing-definition' | 'missing-handler';
}

export async function runGenericAgentFallback({
  task,
  definition,
  reason,
}: GenericAgentFallbackOptions): Promise<AutomationAgentHandlerResult> {
  const notes: string[] = [];

  if (reason === 'missing-definition') {
    notes.push(`${task.agent} has no Claude-side definition under .claude/agents, so execution stays planning-only.`);
  } else {
    notes.push(`${task.agent} is defined in ${definition?.sourcePath ?? '.claude/agents'}, but no runtime handler is connected yet.`);
  }

  if (definition?.summary) {
    notes.push(`Summary: ${definition.summary}`);
  }

  if (definition?.escalation) {
    notes.push(`Escalation path: ${definition.escalation}.`);
  }

  notes.push('This task remains in the execution plan for a human or a future capability binding.');

  return {
    status: 'planned',
    notes: notes.join(' '),
  };
}
