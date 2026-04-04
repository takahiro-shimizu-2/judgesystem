import type { AutomationLogger } from '../core/logger.js';
import type { AutomationAgentName, DecomposedTask } from '../decomposition/llm-decomposer.js';
import type { WorktreeAssignment } from '../orchestration/worktree-coordinator.js';

export const AUTOMATION_AGENT_NAMES = [
  'CoordinatorAgent',
  'IssueAgent',
  'CodeGenAgent',
  'ReviewAgent',
  'PRAgent',
  'DeploymentAgent',
] as const satisfies readonly AutomationAgentName[];

export type AutomationHandlerMode = 'planning-only' | 'connected';
export type AutomationHandlerResultStatus = 'planned' | 'completed' | 'skipped';

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

export interface AutomationAgentRuntimeContext {
  sessionId: string;
  issueNumber: number;
  rootDir: string;
  dryRun: boolean;
  logger: AutomationLogger;
  env: NodeJS.ProcessEnv;
  worktree?: WorktreeAssignment;
}

export interface AutomationAgentHandlerRequest {
  task: DecomposedTask;
  definition: AutomationAgentDefinition;
  context: AutomationAgentRuntimeContext;
}

export interface AutomationAgentHandlerResult {
  status?: AutomationHandlerResultStatus;
  notes?: string;
  output?: unknown;
}

export type AutomationAgentHandler = (
  request: AutomationAgentHandlerRequest,
) => Promise<AutomationAgentHandlerResult>;

export interface AgentHandlerBinding {
  id: string;
  mode: AutomationHandlerMode;
  description: string;
  execute: AutomationAgentHandler;
}

export interface RegisteredAutomationAgent extends AutomationAgentDefinition {
  handler?: AgentHandlerBinding;
}

export function isAutomationAgentName(value: string): value is AutomationAgentName {
  return (AUTOMATION_AGENT_NAMES as readonly string[]).includes(value);
}
