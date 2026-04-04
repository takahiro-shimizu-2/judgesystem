import { spawnSync } from 'child_process';

import { truncateText } from '../../core/utils.js';
import type { AgentHandlerBinding } from '../handler-contract.js';

interface DeploymentAgentHandlerFactoryOptions {
  rootDir: string;
  env: NodeJS.ProcessEnv;
}

export function createDeploymentAgentHandler(options: DeploymentAgentHandlerFactoryOptions): AgentHandlerBinding {
  return {
    id: 'deployment-command-gate',
    mode: 'connected',
    description: 'Runs an explicitly configured deployment command only when deployment automation is opted in.',
    execute: async ({ definition, context }) => {
      const enabled = options.env.AUTOMATION_ENABLE_DEPLOY === 'true';
      const command = options.env.AUTOMATION_DEPLOY_COMMAND;

      if (!enabled || !command) {
        return {
          status: 'skipped',
          notes: `${definition.name} is connected, but deployment is gated. Set AUTOMATION_ENABLE_DEPLOY=true and AUTOMATION_DEPLOY_COMMAND to enable it.`,
        };
      }

      const result = spawnSync(command, {
        cwd: context.rootDir || options.rootDir,
        env: context.env,
        encoding: 'utf8',
        shell: true,
        timeout: 15 * 60 * 1000,
      });

      if (result.status !== 0) {
        throw new Error(
          `Deployment command failed (${result.status ?? 'signal'}): ${truncateText(
            [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
            240,
          )}`,
        );
      }

      return {
        status: 'completed',
        notes: `${definition.name} executed deployment command successfully: ${command}`,
      };
    },
  };
}
