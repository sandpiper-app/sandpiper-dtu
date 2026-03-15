/**
 * Global setup for sdk-verification Vitest project.
 *
 * Boots both Shopify and Slack twins in-process on random ports (unless
 * SHOPIFY_API_URL / SLACK_API_URL env vars are already set, e.g., in CI
 * where external twin processes are running).
 *
 * Follows the Vitest 3.x globalSetup named-export contract:
 *   - setup(ctx): runs once before any test file
 *   - teardown(): runs once after all test files complete
 *
 * process.env mutations made here propagate to all Vitest worker threads.
 * ctx.provide() is used in addition for maximum compatibility with inject().
 *
 * Phase 41, INFRA-25:
 *   At startup, writes a valid empty artifact payload to symbol-execution.json
 *   instead of deleting it. This ensures the file always exists (even if the
 *   process is killed before any afterAll flush runs), so downstream gates
 *   (pnpm coverage:generate, pnpm drift:check) remain runnable after any exit.
 */

import type { GlobalSetupContext } from 'vitest/node';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const symbolExecutionPath = join(__dirname, '../coverage/symbol-execution.json');

// Module-level app references for teardown (set only when booted in-process)
let shopifyApp: Awaited<ReturnType<typeof import('../../../twins/shopify/src/index.js').buildApp>> | null = null;
let slackApp: Awaited<ReturnType<typeof import('../../../twins/slack/src/index.js').buildApp>> | null = null;

export async function setup(ctx: GlobalSetupContext): Promise<void> {
  // Ensure symbol-execution.json exists before tests run.
  // If the file is absent (fresh checkout, cleaned workspace), write a valid empty
  // artifact payload so the file is always present on disk from this point forward.
  // If the file already exists, leave it untouched — the execution-evidence-runtime
  // failure-path hooks and the afterAll flush will overwrite it with real hit data.
  //
  // This replaces the previous destructive unlinkSync (Phase 40) which left the file
  // absent if the process was killed before afterAll ran. A present-and-valid file
  // ensures downstream gates (coverage:generate, drift:check) remain runnable after
  // any exit — green or red.
  mkdirSync(dirname(symbolExecutionPath), { recursive: true });
  if (!existsSync(symbolExecutionPath)) {
    writeFileSync(
      symbolExecutionPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), hitCount: 0, hits: [] }, null, 2) + '\n'
    );
  }

  // --- Shopify twin ---
  const shopifyEnvUrl = process.env.SHOPIFY_API_URL;
  let shopifyBaseUrl: string;

  if (shopifyEnvUrl) {
    shopifyBaseUrl = shopifyEnvUrl.replace(/\/$/, '');
  } else {
    const { buildApp } = await import('../../../twins/shopify/src/index.js');
    shopifyApp = await buildApp({ logger: false });
    await shopifyApp.listen({ port: 0, host: '127.0.0.1' });
    const shopifyAddresses = shopifyApp.addresses();
    shopifyBaseUrl = `http://127.0.0.1:${shopifyAddresses[0].port}`;
    process.env.SHOPIFY_API_URL = shopifyBaseUrl;
  }

  ctx.provide('SHOPIFY_API_URL', shopifyBaseUrl);

  // --- Slack twin ---
  const slackEnvUrl = process.env.SLACK_API_URL;
  let slackBaseUrl: string;

  if (slackEnvUrl) {
    slackBaseUrl = slackEnvUrl.replace(/\/$/, '');
  } else {
    const { buildApp } = await import('../../../twins/slack/src/index.js');
    slackApp = await buildApp({ logger: false });
    await slackApp.listen({ port: 0, host: '127.0.0.1' });
    const slackAddresses = slackApp.addresses();
    slackBaseUrl = `http://127.0.0.1:${slackAddresses[0].port}`;
    process.env.SLACK_API_URL = slackBaseUrl;
  }

  ctx.provide('SLACK_API_URL', slackBaseUrl);

  // --- Reset both twins to a clean initial state ---
  await fetch(`${shopifyBaseUrl}/admin/reset`, { method: 'POST' });
  await fetch(`${slackBaseUrl}/admin/reset`, { method: 'POST' });
}

export async function teardown(): Promise<void> {
  if (shopifyApp) {
    await shopifyApp.close();
    shopifyApp = null;
  }
  if (slackApp) {
    await slackApp.close();
    slackApp = null;
  }
}
