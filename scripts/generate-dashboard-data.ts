#!/usr/bin/env tsx
/**
 * Generate Dashboard Data
 *
 * Mirrors the Miyabi dashboard reporting script while keeping this repository
 * self-contained for GitHub Actions.
 */

import { runDashboardDataCli } from './automation/adapters/dashboard-data.js';

void runDashboardDataCli();
