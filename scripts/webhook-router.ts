#!/usr/bin/env tsx
/**
 * Webhook Event Router
 *
 * Mirrors the Miyabi webhook routing script while keeping this repository
 * self-contained for GitHub Actions.
 */

import { Octokit } from '@octokit/rest';

type EventType = 'issue' | 'pr' | 'push' | 'comment';

interface EventPayload {
  type: EventType;
  action: string;
  number?: number;
  title?: string;
  body?: string;
  labels?: string[];
  author?: string;
  branch?: string;
  commit?: string;
  merged?: boolean;
}

interface RoutingRule {
  condition: (payload: EventPayload) => boolean;
  agent: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
}

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

interface RoutingResult {
  success: boolean;
  agent?: string;
  action?: string;
  error?: string;
  retries?: number;
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPOSITORY = process.env.GITHUB_REPOSITORY || 'ShunsukeHayashi/Autonomous-Operations';
const [owner, repo] = REPOSITORY.split('/');

const octokit: Octokit | null = GITHUB_TOKEN ? new Octokit({ auth: GITHUB_TOKEN }) : null;

const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

const ROUTING_RULES: RoutingRule[] = [
  {
    condition: (payload) => (
      payload.type === 'issue' &&
      payload.action === 'labeled' &&
      (payload.labels?.includes('🤖agent-execute') ?? false)
    ),
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

class WebhookEventRouter {
  async route(payload: EventPayload): Promise<void> {
    console.log(`\nReceived ${payload.type} event: ${payload.action}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const matchedRules = ROUTING_RULES.filter((rule) => rule.condition(payload));

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
        console.error(
          `Failed to route to ${rule.agent} after ${result.retries} retries: ${result.error}`,
        );
      }
    }

    const successful = results.filter((result) => result.success).length;
    const failed = results.filter((result) => !result.success).length;
    console.log(`\nRouting Summary: ${successful} successful, ${failed} failed`);
  }

  private async triggerAgentWithRetry(agent: string, payload: EventPayload, action: string): Promise<RoutingResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        await this.triggerAgent(agent, payload, action);
        return {
          success: true,
          agent,
          action,
          retries: attempt,
        };
      } catch (error) {
        lastError = error as Error;
        console.error(
          `Attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1} failed: ${lastError.message}`,
        );

        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = Math.min(
            RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
            RETRY_CONFIG.maxDelayMs,
          );
          console.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      agent,
      action,
      error: lastError?.message || 'Unknown error',
      retries: RETRY_CONFIG.maxRetries,
    };
  }

  private async triggerAgent(agent: string, payload: EventPayload, action: string): Promise<void> {
    if (payload.number) {
      await this.createRoutingComment(payload.number, agent, action);
    }

    console.log(`Routed to ${agent}: ${action}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async createRoutingComment(issueNumber: number, agent: string, action: string): Promise<void> {
    if (!octokit) {
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
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      console.log(`Created routing comment on #${issueNumber}`);
    } catch (error) {
      console.error('Failed to create comment:', error);
    }
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
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: webhook-router.ts <event-type> <action> [args...]');
    console.error('');
    console.error('Examples:');
    console.error('  webhook-router.ts issue opened 123');
    console.error('  webhook-router.ts pr closed 45');
    console.error('  webhook-router.ts push main abc123');
    console.error('  webhook-router.ts comment 123 username');
    process.exit(1);
  }

  const [eventType, action, ...rest] = args;

  const payload: EventPayload = {
    type: eventType as EventType,
    action,
  };

  if (eventType === 'issue' || eventType === 'pr') {
    payload.number = parseInt(rest[0], 10);
    payload.title = process.env.ISSUE_TITLE || process.env.PR_TITLE;
    payload.merged = eventType === 'pr' ? process.env.PR_MERGED === 'true' : undefined;

    const labelsJson = process.env.ISSUE_LABELS;
    if (labelsJson) {
      try {
        const labels = JSON.parse(labelsJson);
        payload.labels = labels.map((label: { name: string }) => label.name);
      } catch {
        console.warn('Failed to parse ISSUE_LABELS');
      }
    }
  } else if (eventType === 'comment') {
    payload.action = process.env.EVENT_TYPE || 'created';
    payload.number = parseInt(action, 10);
    payload.body = process.env.COMMENT_BODY;
    payload.author = process.env.COMMENT_AUTHOR || rest[0];
  } else if (eventType === 'push') {
    payload.branch = action;
    payload.commit = rest[0];
  }

  const router = new WebhookEventRouter();
  await router.route(payload);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { WebhookEventRouter };
export type { EventPayload, RoutingRule };
