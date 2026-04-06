/**
 * Webhook Event Router
 *
 * Keeps webhook routing logic reusable for GitHub Actions while leaving
 * `scripts/webhook-router.ts` as the stable CLI entrypoint.
 */

import { Octokit } from '@octokit/rest';

import { retryWithBackoff, type RetryConfig } from '../core/retry.js';
import { resolveGitHubToken, resolveRepositoryContext } from '../reporting/repository-metrics.js';

type EventType = 'issue' | 'pr' | 'push' | 'comment';

export interface EventPayload {
  type: EventType;
  action: string;
  number?: number;
  title?: string;
  body?: string;
  labels?: string[];
  labelName?: string;
  author?: string;
  branch?: string;
  commit?: string;
  merged?: boolean;
}

export interface RoutingRule {
  condition: (payload: EventPayload) => boolean;
  agent: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
}

interface RoutingResult {
  success: boolean;
  agent?: string;
  action?: string;
  error?: string;
  retries?: number;
}

const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

const ROUTING_RULES: RoutingRule[] = [
  {
    condition: (payload) =>
      payload.type === 'issue' &&
      payload.action === 'labeled' &&
      payload.labelName === '🤖agent-execute',
    agent: 'CoordinatorAgent',
    priority: 'critical',
    action: 'Execute autonomous task',
  },
  {
    condition: (payload) => payload.type === 'comment' && (payload.body?.startsWith('/agent') ?? false),
    agent: 'CoordinatorAgent',
    priority: 'critical',
    action: 'Parse and execute command',
  },
  {
    condition: (payload) => payload.type === 'issue' && payload.action === 'opened',
    agent: 'IssueAgent',
    priority: 'high',
    action: 'Analyze and auto-label issue',
  },
  {
    condition: (payload) => payload.type === 'issue' && payload.action === 'assigned',
    agent: 'IssueAgent',
    priority: 'high',
    action: 'Transition to implementing state',
  },
  {
    condition: (payload) => payload.type === 'issue' && payload.action === 'closed',
    agent: 'IssueAgent',
    priority: 'medium',
    action: 'Transition to done state',
  },
  {
    condition: (payload) => payload.type === 'pr' && payload.action === 'opened',
    agent: 'ReviewAgent',
    priority: 'high',
    action: 'Run quality checks',
  },
  {
    condition: (payload) => payload.type === 'pr' && payload.action === 'ready_for_review',
    agent: 'ReviewAgent',
    priority: 'high',
    action: 'Run quality checks and request review',
  },
  {
    condition: (payload) => payload.type === 'pr' && payload.action === 'review_requested',
    agent: 'ReviewAgent',
    priority: 'high',
    action: 'Perform automated review',
  },
  {
    condition: (payload) => payload.type === 'pr' && payload.action === 'closed' && payload.merged === true,
    agent: 'DeploymentAgent',
    priority: 'medium',
    action: 'Trigger deployment pipeline',
  },
  {
    condition: (payload) => payload.type === 'push' && payload.branch === 'main',
    agent: 'DeploymentAgent',
    priority: 'medium',
    action: 'Deploy to production',
  },
  {
    condition: (payload) => payload.type === 'issue' && payload.action === 'reopened',
    agent: 'IssueAgent',
    priority: 'low',
    action: 'Re-analyze and update state',
  },
];

export class WebhookEventRouter {
  private octokit: Octokit | null;
  private owner: string;
  private repo: string;

  constructor(token: string | null, repository = process.env.GITHUB_REPOSITORY || process.env.REPOSITORY) {
    const context = resolveRepositoryContext(repository || 'takahiro-shimizu-2/judgesystem');
    this.octokit = token ? new Octokit({ auth: token }) : null;
    this.owner = context.owner;
    this.repo = context.repo;
  }

  async route(payload: EventPayload): Promise<void> {
    console.log(`\nReceived ${payload.type} event: ${payload.action}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const matchedRules = getMatchingRoutingRules(payload);

    if (matchedRules.length === 0) {
      console.log('No routing rules matched for this event');
      return;
    }

    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    matchedRules.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);

    console.log(`\nMatched ${matchedRules.length} routing rule(s):`);

    const results: RoutingResult[] = [];
    for (const rule of matchedRules) {
      console.log(`\nRouting to ${rule.agent}`);
      console.log(`  Priority: ${rule.priority}`);
      console.log(`  Action: ${rule.action}`);

      const result = await this.triggerAgentWithRetry(rule.agent, payload, rule.action);
      results.push(result);

      if (!result.success) {
        console.error(`Failed to route to ${rule.agent} after ${result.retries} retries: ${result.error}`);
      }
    }

    const successful = results.filter((result) => result.success).length;
    const failed = results.filter((result) => !result.success).length;
    console.log(`\nRouting Summary: ${successful} successful, ${failed} failed`);
  }

  public testParseCommand(body: string) {
    const match = body.match(/^\/(\w+)(?:\s+(.+))?/);
    if (!match) {
      return null;
    }

    const [, command, argsString] = match;
    const args = argsString ? argsString.split(/\s+/) : [];

    return { command, args };
  }

  private async triggerAgentWithRetry(agent: string, payload: EventPayload, action: string): Promise<RoutingResult> {
    try {
      const outcome = await retryWithBackoff(
        async () => {
          await this.triggerAgent(agent, payload, action);
        },
        RETRY_CONFIG,
        (error, attempt, delayMs) => {
          console.error(`Attempt ${attempt}/${RETRY_CONFIG.maxRetries + 1} failed: ${error.message}`);
          console.log(`Retrying in ${delayMs}ms...`);
        },
      );

      return {
        success: true,
        agent,
        action,
        retries: outcome.retries,
      };
    } catch (error) {
      return {
        success: false,
        agent,
        action,
        error: error instanceof Error ? error.message : String(error),
        retries: RETRY_CONFIG.maxRetries,
      };
    }
  }

  private async triggerAgent(agent: string, payload: EventPayload, action: string): Promise<void> {
    if (payload.number) {
      await this.createRoutingComment(payload.number, agent, action);
    }

    console.log(`Routed to ${agent}: ${action}`);
  }

  private async createRoutingComment(issueNumber: number, agent: string, action: string): Promise<void> {
    if (!this.octokit) {
      console.warn('Skipping routing comment because GITHUB_TOKEN is not configured.');
      return;
    }

    const body = `## Event Router

**Agent**: ${agent}
**Action**: ${action}
**Timestamp**: ${new Date().toISOString()}

---

Automated by Webhook Event Router (Issue #5 Phase B)`;

    try {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body,
      });
      console.log(`Created routing comment on #${issueNumber}`);
    } catch (error) {
      console.error('Failed to create comment:', error);
    }
  }
}

export function parseWebhookRouterArgs(argv = process.argv, env = process.env): EventPayload {
  const args = argv.slice(2);

  if (args.length < 2) {
    throw new Error(`Usage:
  webhook-router.ts <event-type> <action> [args...]

Examples:
  webhook-router.ts issue opened 123
  webhook-router.ts pr closed 45
  webhook-router.ts push main abc123
  webhook-router.ts comment 123 username`);
  }

  const [eventType, action, ...rest] = args;
  const payload: EventPayload = {
    type: eventType as EventType,
    action,
  };

  if (eventType === 'issue' || eventType === 'pr') {
    payload.number = parseInt(rest[0], 10);
    payload.title = env.ISSUE_TITLE || env.PR_TITLE;
    payload.merged = eventType === 'pr' ? env.PR_MERGED === 'true' : undefined;
    payload.labelName = env.EVENT_LABEL_NAME;

    const labelsJson = env.ISSUE_LABELS;
    if (labelsJson) {
      try {
        const labels = JSON.parse(labelsJson) as Array<{ name: string }>;
        payload.labels = labels.map((label) => label.name);
      } catch {
        console.warn('Failed to parse ISSUE_LABELS');
      }
    }
  } else if (eventType === 'comment') {
    payload.action = env.EVENT_TYPE || 'created';
    payload.number = parseInt(action, 10);
    payload.body = env.COMMENT_BODY;
    payload.author = env.COMMENT_AUTHOR || rest[0];
  } else if (eventType === 'push') {
    payload.branch = action;
    payload.commit = rest[0];
  }

  return payload;
}

export function getMatchingRoutingRules(payload: EventPayload) {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  return ROUTING_RULES.filter((rule) => rule.condition(payload)).sort(
    (left, right) => priorityOrder[left.priority] - priorityOrder[right.priority],
  );
}

export async function runWebhookRouterCli(argv = process.argv, env = process.env) {
  const token = resolveGitHubToken();
  if (!token) {
    console.error('GITHUB_TOKEN or GH_TOKEN is required');
    process.exit(1);
  }

  try {
    const payload = parseWebhookRouterArgs(argv, env);
    const router = new WebhookEventRouter(token, env.GITHUB_REPOSITORY || env.REPOSITORY);
    await router.route(payload);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
