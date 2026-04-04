#!/usr/bin/env tsx

import { runAgentsParallelExecCli } from './automation/adapters/agents-parallel-exec.js';

void runAgentsParallelExecCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
