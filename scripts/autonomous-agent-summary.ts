#!/usr/bin/env tsx

import { runAutonomousAgentSummaryCli } from './automation/adapters/autonomous-agent-summary.js';

void runAutonomousAgentSummaryCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
