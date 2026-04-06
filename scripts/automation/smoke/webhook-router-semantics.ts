import { getMatchingRoutingRules, parseWebhookRouterArgs } from '../adapters/webhook-router.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const pendingPayload = parseWebhookRouterArgs(
    ['node', 'webhook-router.ts', 'issue', 'labeled', '182'],
    {
      ISSUE_LABELS: JSON.stringify([{ name: '🤖agent-execute' }, { name: '📥 state:pending' }]),
      EVENT_LABEL_NAME: '📥 state:pending',
    } as NodeJS.ProcessEnv,
  );
  const pendingRules = getMatchingRoutingRules(pendingPayload);
  assert(
    !pendingRules.some((rule) => rule.agent === 'CoordinatorAgent'),
    'state/phase labels should not retrigger CoordinatorAgent when execute label already exists.',
  );

  const executePayload = parseWebhookRouterArgs(
    ['node', 'webhook-router.ts', 'issue', 'labeled', '182'],
    {
      ISSUE_LABELS: JSON.stringify([{ name: '🤖agent-execute' }, { name: '📥 state:pending' }]),
      EVENT_LABEL_NAME: '🤖agent-execute',
    } as NodeJS.ProcessEnv,
  );
  const executeRules = getMatchingRoutingRules(executePayload);
  assert(
    executeRules.some((rule) => rule.agent === 'CoordinatorAgent'),
    'execute label should still route to CoordinatorAgent.',
  );

  console.log('[passed] webhook-router-semantics');
  console.log(`  - pending=${pendingRules.length}`);
  console.log(`  - execute=${executeRules.length}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
