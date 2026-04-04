import type { AgentType } from '../../state/task-state-machine.js';
import { resolveRepositoryContext } from '../../reporting/repository-metrics.js';
import { LabelStateMachine } from '../../state/label-state-machine.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface IssueAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

export function createIssueAgentHandler(options: IssueAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'issue-state-sync',
    mode: 'connected',
    description: 'Assigns the issue agent label and transitions the issue into analyzing when GitHub credentials are available.',
    execute: async ({ task, definition, context }) => {
      const token = resolveGitHubToken(options.env);
      if (!token) {
        return {
          status: 'skipped',
          notes: `${definition.name} is connected, but no GitHub token is available. Issue state sync was skipped.`,
        };
      }

      const repository = resolveRepositoryContext(
        options.env.GITHUB_REPOSITORY || options.env.REPOSITORY || process.env.GITHUB_REPOSITORY,
      );
      const stateMachine = new LabelStateMachine(token, repository.owner, repository.repo);

      await stateMachine.assignAgent(context.issueNumber, 'issue' satisfies AgentType);
      await stateMachine.transitionState(
        context.issueNumber,
        'analyzing',
        `Triggered by ${task.id}: ${task.title}`,
      );

      return {
        status: 'completed',
        notes: `${definition.name} synced GitHub labels for issue #${context.issueNumber} and moved it to analyzing.`,
      };
    },
  };
}

function resolveGitHubToken(env: NodeJS.ProcessEnv) {
  return env.GITHUB_TOKEN || env.GH_PROJECT_TOKEN || env.GH_TOKEN || null;
}
