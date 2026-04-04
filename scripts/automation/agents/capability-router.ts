import type { DecomposedTask } from '../decomposition/llm-decomposer.js';
import { runGenericAgentFallback } from './fallback/generic-agent.js';
import type {
  AutomationAgentHandlerResult,
  AutomationAgentRuntimeContext,
} from './handler-contract.js';
import type { AgentRegistry } from './registry.js';

export async function executeTaskWithAgent(
  task: DecomposedTask,
  context: AutomationAgentRuntimeContext & { agentRegistry?: AgentRegistry },
): Promise<AutomationAgentHandlerResult> {
  const definition = context.agentRegistry?.agents.get(task.agent);

  if (!definition) {
    return runGenericAgentFallback({
      task,
      reason: 'missing-definition',
    });
  }

  if (!definition.handler) {
    return runGenericAgentFallback({
      task,
      definition,
      reason: 'missing-handler',
    });
  }

  context.logger.info(`Routing ${task.id} to ${definition.handler.id}`);
  return definition.handler.execute({
    task,
    definition,
    context,
  });
}
