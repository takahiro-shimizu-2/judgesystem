import type { AutomationAgentName } from '../decomposition/llm-decomposer.js';

export const AUTOMATION_AGENT_NAMES = [
  'CoordinatorAgent',
  'IssueAgent',
  'CodeGenAgent',
  'ReviewAgent',
  'PRAgent',
  'DeploymentAgent',
] as const satisfies readonly AutomationAgentName[];

export type AutomationHandlerMode = 'planning-only' | 'connected';

export interface AutomationAgentDefinition {
  name: AutomationAgentName;
  slug: string;
  description: string;
  authority?: string;
  escalation?: string;
  summary: string;
  instructions: string;
  sourcePath: string;
}

export interface AgentHandlerBinding {
  id: string;
  mode: AutomationHandlerMode;
  description: string;
}

export interface RegisteredAutomationAgent extends AutomationAgentDefinition {
  handler?: AgentHandlerBinding;
}

export function isAutomationAgentName(value: string): value is AutomationAgentName {
  return (AUTOMATION_AGENT_NAMES as readonly string[]).includes(value);
}
