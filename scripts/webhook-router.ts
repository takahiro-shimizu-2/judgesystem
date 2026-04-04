#!/usr/bin/env tsx
/**
 * Webhook Event Router
 *
 * Mirrors the Miyabi webhook routing script while keeping this repository
 * self-contained for GitHub Actions.
 */

import { runWebhookRouterCli } from './automation/adapters/webhook-router.js';

void runWebhookRouterCli();
