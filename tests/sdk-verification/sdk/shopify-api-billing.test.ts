/**
 * SHOP-13: shopify.billing helpers — live twin tests.
 *
 * 3 tests total:
 *   - billing.request with a subscription plan → returns confirmationUrl string (1)
 *   - billing.check with plans array → returns false (no active payment) (1)
 *   - billing.cancel with subscription ID → returns AppSubscription with CANCELLED status (1)
 *
 * All billing tests require a valid session with accessToken obtained via
 * clientCredentials in beforeEach. The twin maintains persistent billing state.
 *
 * billing.request is configured with config.billing['Test Plan'] — a subscription
 * plan with lineItems. The plan name is a STRING that indexes into config.billing.
 *
 * billing.check returns a boolean by default (returnObject: false is the default).
 * billing.cancel returns the AppSubscription object directly (unwrapped).
 *
 * The cancel test creates a real subscription via billing.request, confirms it via
 * GET /admin/charges/:id/confirm_recurring (the browser confirmation flow), then
 * cancels it. This is the realistic billing state machine flow (PENDING → ACTIVE → CANCELLED).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BillingInterval } from '@shopify/shopify-api';
import type { Session } from '@shopify/shopify-api';
import { createShopifyApiClient } from '../helpers/shopify-api-client.js';
import { resetShopify } from '../setup/seeders.js';

// Create a shopify instance with billing config — required by billing.request()
// to look up the plan definition from config.billing['Test Plan'].
const shopify = createShopifyApiClient({
  billing: {
    'Test Plan': {
      lineItems: [
        {
          interval: BillingInterval.Every30Days,
          amount: 10.0,
          currencyCode: 'USD',
        },
      ],
    },
  },
});

// ---------------------------------------------------------------------------
// shopify.billing — SHOP-13 (live twin)
// ---------------------------------------------------------------------------

describe('shopify.billing — SHOP-13 (live twin)', () => {
  let session: Session;

  beforeEach(async () => {
    await resetShopify();
    // clientCredentials is the simplest way to get a valid session after reset.
    // Returns a Session with an accessToken from the twin's stateManager.
    const result = await shopify.auth.clientCredentials({ shop: 'dev.myshopify.com' });
    session = result.session;
  });

  it('request returns confirmationUrl for a subscription plan', async () => {
    // plan is a STRING name that references config.billing['Test Plan'].
    // Default returnObject is false — returns the confirmationUrl string directly.
    const confirmationUrl = await shopify.billing.request({
      session,
      plan: 'Test Plan',
      isTest: true,
    });
    // Default return is the confirmationUrl string (not an object)
    expect(typeof confirmationUrl).toBe('string');
    expect(confirmationUrl).toContain('confirm');
  });

  it('check returns false (no active payment) on empty twin state', async () => {
    // Without returnObject: true, check() returns a boolean.
    // Twin returns empty activeSubscriptions and oneTimePurchases → hasActivePayment: false.
    const hasPayment = await shopify.billing.check({
      session,
      plans: ['Test Plan'],
      isTest: true,
    });
    expect(hasPayment).toBe(false);
  });

  it('cancel returns the cancelled subscription', async () => {
    // Step 1: Create a subscription via billing.request to get the confirmationUrl.
    // billing.request calls appSubscriptionCreate → returns confirmationUrl string.
    const confirmationUrl = await shopify.billing.request({
      session,
      plan: 'Test Plan',
      isTest: true,
    }) as string;

    expect(typeof confirmationUrl).toBe('string');

    // Step 2: Extract the numeric ID from confirmationUrl and confirm via the
    // browser confirmation endpoint (GET /admin/charges/:id/confirm_recurring).
    // This transitions the subscription from PENDING → ACTIVE.
    const twinBaseUrl = process.env.SHOPIFY_API_URL ?? 'http://127.0.0.1:9999';
    const match = confirmationUrl.match(/\/admin\/charges\/(\d+)\/confirm_recurring/);
    expect(match).not.toBeNull();
    const numericId = match![1];
    const confirmPath = `/admin/charges/${numericId}/confirm_recurring`;

    const confirmResponse = await fetch(twinBaseUrl + confirmPath, {
      redirect: 'manual', // Don't follow redirect — just confirm 302 status
    });
    // Should be 302 (redirect to returnUrl) after transitioning to ACTIVE
    expect([200, 302]).toContain(confirmResponse.status);

    // Step 3: Build the GID from the numeric ID to pass to billing.cancel.
    const subscriptionGid = `gid://shopify/AppSubscription/${numericId}`;

    // Step 4: Cancel the subscription.
    // cancel() calls appSubscriptionCancel mutation on the twin.
    // cancel() returns AppSubscription directly (unwrapped from appSubscriptionCancel).
    const cancelled = await shopify.billing.cancel({
      session,
      subscriptionId: subscriptionGid,
      prorate: false,
    });
    // cancel() returns AppSubscription directly (unwrapped)
    expect(cancelled).toBeDefined();
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.id).toBe(subscriptionGid);
  });
});
