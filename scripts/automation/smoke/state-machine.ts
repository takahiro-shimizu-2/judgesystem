import { buildIssueStateFromLabels } from '../state/label-state-bridge.js';
import { getValidTransitions, validateTransition } from '../state/task-state-machine.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const pendingIssue = buildIssueStateFromLabels({
    number: 177,
    title: 'State machine smoke',
    labels: ['📥 state:pending', '📊 priority:P2-Medium'],
  });

  const pendingTransitions = getValidTransitions('pending');
  assert(
    pendingTransitions.includes('reviewing'),
    `Expected pending transitions to include reviewing, got: ${pendingTransitions.join(', ')}`,
  );

  validateTransition(pendingIssue, 'reviewing');

  let rejected = false;
  try {
    validateTransition(pendingIssue, 'done');
  } catch {
    rejected = true;
  }

  assert(rejected, 'Expected pending -> done to remain invalid.');

  console.log('[passed] state-machine');
  console.log(`  - pending=${pendingTransitions.join(',')}`);
  console.log('  - linked-pr path allows pending -> reviewing');
}

main();
