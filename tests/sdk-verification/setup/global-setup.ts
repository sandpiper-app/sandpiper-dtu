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
 */

import type { GlobalSetupContext } from 'vitest/node';

// Module-level app references for teardown (set only when booted in-process)
let shopifyApp: Awaited<ReturnType<typeof import('../../../twins/shopify/src/index.js').buildApp>> | null = null;
let slackApp: Awaited<ReturnType<typeof import('../../../twins/slack/src/index.js').buildApp>> | null = null;

export async function setup(ctx: GlobalSetupContext): Promise<void> {
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
