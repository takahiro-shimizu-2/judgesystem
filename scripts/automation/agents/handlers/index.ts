import type { AutomationAgentName } from '../../decomposition/llm-decomposer.js';
import type { AgentHandlerBinding } from '../handler-contract.js';
import { createCodeGenAgentHandler } from './codegen.js';
import { createDeploymentAgentHandler } from './deployment.js';
import { createIssueAgentHandler } from './issue.js';
import { createPrAgentHandler } from './pr.js';
import { createReviewAgentHandler } from './review.js';
import { createTestAgentHandler } from './test.js';

export interface DefaultAgentHandlerOptions {
  rootDir?: string;
  env?: NodeJS.ProcessEnv;
}

export function buildDefaultAgentHandlers(
  options: DefaultAgentHandlerOptions = {},
): Partial<Record<AutomationAgentName, AgentHandlerBinding>> {
  const rootDir = options.rootDir ?? process.cwd();
  const env = options.env ?? process.env;

  return {
    IssueAgent: createIssueAgentHandler({ rootDir, env }),
    CodeGenAgent: createCodeGenAgentHandler({ rootDir, env }),
    TestAgent: createTestAgentHandler({ rootDir, env }),
    ReviewAgent: createReviewAgentHandler({ rootDir, env }),
    PRAgent: createPrAgentHandler({ rootDir, env }),
    DeploymentAgent: createDeploymentAgentHandler({ rootDir, env }),
  };
}
