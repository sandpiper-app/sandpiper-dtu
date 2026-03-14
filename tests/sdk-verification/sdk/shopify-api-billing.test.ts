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

  // ---------------------------------------------------------------------------
  // Wave 0 RED tests — Finding #11 (billing fidelity gaps)
  // Plans 02-03 must turn these GREEN without regressions.
  // ---------------------------------------------------------------------------

  it('request with returnObject:true returns lineItems from the plan', async () => {
    // billing.request with returnObject:true returns { confirmationUrl, appSubscription }
    const result = await shopify.billing.request({
      session,
      plan: 'Test Plan',
      isTest: true,
      returnObject: true,
    });
    // result.appSubscription (NOT result directly) contains the subscription
    expect(result).toBeDefined();
    const sub = (result as any).appSubscription;
    expect(sub).toBeDefined();
    expect(Array.isArray(sub.lineItems)).toBe(true);
    expect(sub.lineItems.length).toBeGreaterThan(0);
    // Verify the line item has real pricing details (not empty stubs)
    expect(sub.lineItems[0].plan).toBeDefined();
    expect(sub.lineItems[0].plan.pricingDetails).toBeDefined();
  });

  it('billing.check oneTimePurchases reflects persistent appPurchaseOneTimeCreate', async () => {
    // Use direct GraphQL to create a one-time purchase (billing SDK doesn't have a direct one-time request helper)
    const twinBaseUrl = process.env.SHOPIFY_API_URL ?? 'http://127.0.0.1:9999';
    const token = session.accessToken;
    const mutation = `
      mutation {
        appPurchaseOneTimeCreate(
          name: "One Time Plan"
          price: { amount: "5.00", currencyCode: USD }
          returnUrl: "https://example.com"
          test: true
        ) {
          appPurchaseOneTime { id name status }
          userErrors { field message }
        }
      }
    `;
    const res = await fetch(`${twinBaseUrl}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token!,
      },
      body: JSON.stringify({ query: mutation }),
    });
    const { data } = await res.json() as any;
    // Verify the GID is a valid persistent format (not a hardcoded string value)
    expect(data.appPurchaseOneTimeCreate.appPurchaseOneTime.id).toMatch(/^gid:\/\/shopify\/AppPurchaseOneTime\/\d+$/);
    // Second call should get a different GID (persistence, not hardcoded stub)
    const res2 = await fetch(`${twinBaseUrl}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token!,
      },
      body: JSON.stringify({ query: mutation }),
    });
    const { data: data2 } = await res2.json() as any;
    // Two separate one-time purchases must have different GIDs
    expect(data2.appPurchaseOneTimeCreate.appPurchaseOneTime.id).not.toBe(
      data.appPurchaseOneTimeCreate.appPurchaseOneTime.id
    );
  });

  it('currentAppInstallation.oneTimePurchases returns created one-time purchases', async () => {
    const twinBaseUrl = process.env.SHOPIFY_API_URL ?? 'http://127.0.0.1:9999';
    const token = session.accessToken;
    // Create a one-time purchase
    const createMutation = `
      mutation {
        appPurchaseOneTimeCreate(
          name: "Persistent Plan"
          price: { amount: "9.99", currencyCode: USD }
          returnUrl: "https://example.com"
          test: true
        ) {
          appPurchaseOneTime { id }
        }
      }
    `;
    await fetch(`${twinBaseUrl}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token! },
      body: JSON.stringify({ query: createMutation }),
    });
    // Now query currentAppInstallation.oneTimePurchases
    const query = `
      query {
        currentAppInstallation {
          oneTimePurchases(first: 10) {
            edges { node { id name status } }
          }
        }
      }
    `;
    const res = await fetch(`${twinBaseUrl}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token! },
      body: JSON.stringify({ query }),
    });
    const { data } = await res.json() as any;
    expect(data.currentAppInstallation.oneTimePurchases.edges.length).toBeGreaterThan(0);
    expect(data.currentAppInstallation.oneTimePurchases.edges[0].node.name).toBe('Persistent Plan');
  });

  it('currentAppInstallation.activeSubscriptions includes lineItems after subscription confirmed', async () => {
    const twinBaseUrl = process.env.SHOPIFY_API_URL ?? 'http://127.0.0.1:9999';
    const token = session.accessToken;
    // Create a subscription with lineItems via billing.request
    const result = await shopify.billing.request({
      session,
      plan: 'Test Plan',
      isTest: true,
      returnObject: true,
    });
    // Confirm the subscription via the confirmationUrl
    const confirmUrl = (result as any).confirmationUrl;
    if (confirmUrl) {
      const confirmPath = new URL(confirmUrl).pathname;
      await fetch(`${twinBaseUrl}${confirmPath}`, { redirect: 'manual' });
    }
    // Query currentAppInstallation for activeSubscriptions
    const query = `
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            lineItems {
              id
              plan { pricingDetails { ... on AppRecurringPricing { interval price { amount currencyCode } } } }
            }
          }
        }
      }
    `;
    const res = await fetch(`${twinBaseUrl}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token! },
      body: JSON.stringify({ query }),
    });
    const { data } = await res.json() as any;
    const activeSubs = data.currentAppInstallation.activeSubscriptions;
    expect(activeSubs.length).toBeGreaterThan(0);
    const firstSub = activeSubs[0];
    expect(firstSub.lineItems.length).toBeGreaterThan(0);
    expect(firstSub.lineItems[0].plan.pricingDetails.interval).toBeDefined();
  });
});
