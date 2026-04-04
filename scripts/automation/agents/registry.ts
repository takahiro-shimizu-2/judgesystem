import type { AutomationAgentName, DecomposedTask } from '../decomposition/llm-decomposer.js';
import {
  AUTOMATION_AGENT_NAMES,
  type AgentHandlerBinding,
  type RegisteredAutomationAgent,
} from './handler-contract.js';
import { loadClaudeAgentDefinitions } from './markdown-loader.js';

export interface AgentRegistry {
  agents: Map<AutomationAgentName, RegisteredAutomationAgent>;
  warnings: string[];
  missingDefinitions: AutomationAgentName[];
}

export interface AgentRegistryOptions {
  rootDir?: string;
  handlers?: Partial<Record<AutomationAgentName, AgentHandlerBinding>>;
}

export function createAgentRegistry(options: AgentRegistryOptions = {}): AgentRegistry {
  const loadResult = loadClaudeAgentDefinitions(options.rootDir);
  const warnings = [...loadResult.warnings];
  const agents = new Map<AutomationAgentName, RegisteredAutomationAgent>();

  for (const definition of loadResult.agents) {
    agents.set(definition.name, {
      ...definition,
      handler: options.handlers?.[definition.name],
    });
  }

  const missingDefinitions = AUTOMATION_AGENT_NAMES.filter((name) => !agents.has(name));
  for (const missing of missingDefinitions) {
    warnings.push(`Claude agent definition for ${missing} is not available under .claude/agents.`);
  }

  return {
    agents,
    warnings,
    missingDefinitions,
  };
}

export function describeAgentForTask(task: Pick<DecomposedTask, 'agent'>, registry: AgentRegistry | undefined) {
  if (!registry) {
    return '';
  }

  const agent = registry.agents.get(task.agent);
  if (!agent) {
    return `${task.agent} has no matching Claude-side definition in .claude/agents, so runtime execution remains undefined.`;
  }

  if (!agent.handler) {
    return `${task.agent} is defined in ${agent.sourcePath}, but no runtime handler is connected yet; this task remains planning-only.`;
  }

  return `${task.agent} is defined in ${agent.sourcePath} and is connected to runtime handler ${agent.handler.id}.`;
}
