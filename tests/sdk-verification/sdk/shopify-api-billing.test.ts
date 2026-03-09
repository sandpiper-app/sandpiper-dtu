/**
 * SHOP-13: shopify.billing helpers — live twin tests.
 *
 * 3 tests total:
 *   - billing.request with a subscription plan → returns confirmationUrl string (1)
 *   - billing.check with plans array → returns false (no active payment) (1)
 *   - billing.cancel with subscription ID → returns AppSubscription with CANCELLED status (1)
 *
 * All billing tests require a valid session with accessToken obtained via
 * clientCredentials in beforeEach. The twin returns stub billing responses.
 *
 * billing.request is configured with config.billing['Test Plan'] — a subscription
 * plan with lineItems. The plan name is a STRING that indexes into config.billing.
 *
 * billing.check returns a boolean by default (returnObject: false is the default).
 * billing.cancel returns the AppSubscription object directly (unwrapped).
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
    // cancel() calls appSubscriptionCancel mutation on the twin.
    // The twin's stub resolver returns the AppSubscription with status CANCELLED.
    // cancel() returns AppSubscription directly (unwrapped from appSubscriptionCancel).
    const cancelled = await shopify.billing.cancel({
      session,
      subscriptionId: 'gid://shopify/AppSubscription/1',
      prorate: false,
    });
    // cancel() returns AppSubscription directly (unwrapped)
    expect(cancelled).toBeDefined();
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.id).toBe('gid://shopify/AppSubscription/1');
  });
});
