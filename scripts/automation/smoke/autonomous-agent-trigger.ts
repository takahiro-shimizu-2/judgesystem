import { evaluateAutonomousAgentTrigger } from '../adapters/autonomous-agent-trigger.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const labeledExecute = evaluateAutonomousAgentTrigger({
    eventName: 'issues',
    labelExecuteGate: false,
    payload: {
      action: 'labeled',
      label: { name: '🤖agent-execute' },
      issue: {
        number: 182,
        labels: [{ name: '🤖agent-execute' }, { name: '📊 priority:P2-Medium' }],
      },
    },
  });
  assert(labeledExecute.shouldExecute, 'execute label should trigger planning.');
  assert(labeledExecute.executionMode === 'planning', 'execute label should default to planning when the gate is closed.');

  const unrelatedLabel = evaluateAutonomousAgentTrigger({
    eventName: 'issues',
    labelExecuteGate: false,
    payload: {
      action: 'labeled',
      label: { name: '📥 state:pending' },
      issue: {
        number: 182,
        labels: [{ name: '🤖agent-execute' }, { name: '📥 state:pending' }],
      },
    },
  });
  assert(!unrelatedLabel.shouldExecute, 'non-execute labels should not retrigger planning just because the execute label remains present.');

  const editedIssue = evaluateAutonomousAgentTrigger({
    eventName: 'issues',
    payload: {
      action: 'edited',
      issue: {
        number: 182,
        labels: [{ name: '🤖agent-execute' }],
      },
    },
  });
  assert(editedIssue.shouldExecute, 'editing an execute-labeled issue should rerun planning.');
  assert(editedIssue.executionMode === 'planning', 'issue edits should rerun planning, not execute.');

  console.log('[passed] autonomous-agent-trigger');
  console.log(`  - label=${labeledExecute.executionMode}`);
  console.log(`  - unrelated=${unrelatedLabel.shouldExecute}`);
  console.log(`  - edit=${editedIssue.executionMode}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
