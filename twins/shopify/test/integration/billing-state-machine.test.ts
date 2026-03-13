/**
 * Integration tests for the billing state machine (SHOP-21).
 *
 * Verifies:
 * - SHOP-21a: appSubscriptionCreate returns PENDING status + confirmationUrl with unique id
 * - SHOP-21b: Visiting confirmationUrl transitions subscription to ACTIVE
 * - SHOP-21c: currentAppInstallation returns active subscription data after confirmation
 * - SHOP-21d: appSubscriptionCancel validates ownership and transitions to CANCELLED
 *
 * These tests are written in RED state — they fail against the current stub implementation
 * (hardcoded id 'gid://shopify/AppSubscription/1', no state, no ownership validation)
 * and will be made green by Plan 03 (billing state machine implementation).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/index.js';

/** Helper: send a GraphQL request and parse the response */
async function sendGql(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<any> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/api/2024-01/graphql.json',
    headers: { 'X-Shopify-Access-Token': token },
    payload: { query, variables },
  });
  return JSON.parse(response.body);
}

/** Helper: seed an access token for a given shop domain without going through OAuth */
async function seedToken(
  app: Awaited<ReturnType<typeof buildApp>>,
  shopDomain: string
): Promise<string> {
  const token = randomUUID();
  await app.inject({
    method: 'POST',
    url: '/admin/tokens',
    payload: { token, shopDomain },
  });
  return token;
}

const CREATE_SUBSCRIPTION_MUTATION = `
  mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {
      appSubscription {
        id
        name
        status
        test
        returnUrl
        trialDays
        lineItems { id }
        createdAt
      }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

const CURRENT_APP_INSTALLATION_QUERY = `
  {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        returnUrl
        trialDays
        lineItems { id }
        createdAt
      }
      oneTimePurchases {
        edges { node { id } }
        pageInfo { hasNextPage }
      }
    }
  }
`;

const CANCEL_SUBSCRIPTION_MUTATION = `
  mutation appSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription {
        id
        name
        status
      }
      userErrors { field message }
    }
  }
`;

describe('Billing State Machine', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    process.env.WEBHOOK_TIME_SCALE = '0.001';
    app = await buildApp({ logger: false });
    await app.ready();

    // Seed primary token for default shop domain
    token = await seedToken(app, 'twin.myshopify.com');
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_TIME_SCALE;
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // SHOP-21a: appSubscriptionCreate returns PENDING + confirmationUrl with unique id
  // ---------------------------------------------------------------------------
  describe('SHOP-21a — appSubscriptionCreate returns PENDING and unique confirmationUrl', () => {
    it('returns PENDING status and confirmationUrl containing numeric id in URL path', async () => {
      const result = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, {
        name: 'Test Plan',
        returnUrl: 'https://test-app.example.com/billing/confirm',
        test: true,
        lineItems: [],
      });

      expect(result.data).toBeDefined();
      const { appSubscription, confirmationUrl, userErrors } =
        result.data.appSubscriptionCreate;

      expect(userErrors).toHaveLength(0);
      expect(appSubscription.status).toBe('PENDING');
      expect(appSubscription.id).toMatch(/^gid:\/\/shopify\/AppSubscription\//);

      // confirmationUrl must contain /admin/charges/{numericId}/confirm_recurring
      expect(confirmationUrl).toMatch(/\/admin\/charges\/\d+\/confirm_recurring/);
    });

    it('second call produces a different subscription id (catches hardcoded stub)', async () => {
      const vars = {
        name: 'Test Plan',
        returnUrl: 'https://test-app.example.com/billing/confirm',
        test: true,
        lineItems: [],
      };

      const result1 = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, vars);
      const result2 = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, vars);

      const id1 = result1.data.appSubscriptionCreate.appSubscription.id;
      const id2 = result2.data.appSubscriptionCreate.appSubscription.id;

      // Two separate calls must return different subscription ids
      // The current stub returns 'gid://shopify/AppSubscription/1' for both — this fails
      expect(id1).not.toBe(id2);

      // confirmationUrls must also differ
      const url1 = result1.data.appSubscriptionCreate.confirmationUrl;
      const url2 = result2.data.appSubscriptionCreate.confirmationUrl;
      expect(url1).not.toBe(url2);
    });
  });

  // ---------------------------------------------------------------------------
  // SHOP-21b: Visiting confirmationUrl transitions subscription to ACTIVE
  // ---------------------------------------------------------------------------
  describe('SHOP-21b — visiting confirmationUrl transitions subscription to ACTIVE', () => {
    it('GET confirmationUrl returns 302 or 200 and subscription becomes ACTIVE', async () => {
      // Step 1: Create the subscription
      const createResult = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, {
        name: 'Test Plan',
        returnUrl: 'https://test-app.example.com/billing/confirm',
        test: true,
        lineItems: [],
      });

      const { confirmationUrl } =
        createResult.data.appSubscriptionCreate;

      // Step 2: Extract the path from confirmationUrl
      // Format: https://dev.myshopify.com/admin/charges/{id}/confirm_recurring
      const match = confirmationUrl.match(/\/admin\/charges\/(\d+)\/confirm_recurring/);
      expect(match).not.toBeNull();
      const numericId = match![1];
      const confirmPath = `/admin/charges/${numericId}/confirm_recurring`;

      // Step 3: Visit the confirmation URL via app.inject
      const confirmResponse = await app.inject({
        method: 'GET',
        url: confirmPath,
      });

      // Should respond with redirect (302) or success (200)
      expect([200, 302]).toContain(confirmResponse.statusCode);

      // Step 4: Query currentAppInstallation — should now have one active subscription
      const installResult = await sendGql(app, token, CURRENT_APP_INSTALLATION_QUERY);
      const { activeSubscriptions } = installResult.data.currentAppInstallation;

      expect(activeSubscriptions.length).toBeGreaterThanOrEqual(1);
      const activeSub = activeSubscriptions.find(
        (s: any) => s.id === createResult.data.appSubscriptionCreate.appSubscription.id
      );
      expect(activeSub).toBeDefined();
      expect(activeSub.status).toBe('ACTIVE');
    });
  });

  // ---------------------------------------------------------------------------
  // SHOP-21c: currentAppInstallation returns active subscription data
  // ---------------------------------------------------------------------------
  describe('SHOP-21c — currentAppInstallation returns active subscription data', () => {
    it('returns subscription with ACTIVE status and correct name after confirmation', async () => {
      // Step 1: Create and confirm a subscription
      const createResult = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, {
        name: 'Test Plan',
        returnUrl: 'https://test-app.example.com/billing/confirm',
        test: true,
        lineItems: [],
      });

      const { confirmationUrl } = createResult.data.appSubscriptionCreate;
      const match = confirmationUrl.match(/\/admin\/charges\/(\d+)\/confirm_recurring/);
      expect(match).not.toBeNull();

      await app.inject({
        method: 'GET',
        url: `/admin/charges/${match![1]}/confirm_recurring`,
      });

      // Step 2: Query currentAppInstallation
      const installResult = await sendGql(app, token, CURRENT_APP_INSTALLATION_QUERY);
      expect(installResult.data).toBeDefined();

      const { activeSubscriptions, oneTimePurchases } =
        installResult.data.currentAppInstallation;

      // activeSubscriptions must have exactly one entry
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].status).toBe('ACTIVE');
      expect(activeSubscriptions[0].name).toBe('Test Plan');
      expect(activeSubscriptions[0].id).toMatch(
        /^gid:\/\/shopify\/AppSubscription\//
      );

      // oneTimePurchases must be present (empty in this case)
      expect(oneTimePurchases).toBeDefined();
      expect(oneTimePurchases.pageInfo.hasNextPage).toBe(false);
    });

    it('returns empty activeSubscriptions when no subscription is confirmed', async () => {
      const installResult = await sendGql(app, token, CURRENT_APP_INSTALLATION_QUERY);
      const { activeSubscriptions } = installResult.data.currentAppInstallation;

      // Before any confirmation, should be empty
      // The current stub returns [] but this confirms the behavior is maintained
      expect(activeSubscriptions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // SHOP-21d: appSubscriptionCancel validates ownership and transitions to CANCELLED
  // ---------------------------------------------------------------------------
  describe('SHOP-21d — appSubscriptionCancel validates ownership and cancels subscription', () => {
    it('cancels the subscription and returns CANCELLED status with empty userErrors', async () => {
      // Step 1: Create and confirm a subscription
      const createResult = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, {
        name: 'Test Plan',
        returnUrl: 'https://test-app.example.com/billing/confirm',
        test: true,
        lineItems: [],
      });

      const subscriptionGid =
        createResult.data.appSubscriptionCreate.appSubscription.id;
      const { confirmationUrl } = createResult.data.appSubscriptionCreate;
      const match = confirmationUrl.match(/\/admin\/charges\/(\d+)\/confirm_recurring/);
      expect(match).not.toBeNull();

      await app.inject({
        method: 'GET',
        url: `/admin/charges/${match![1]}/confirm_recurring`,
      });

      // Step 2: Cancel the subscription using the same token (same shop domain)
      const cancelResult = await sendGql(app, token, CANCEL_SUBSCRIPTION_MUTATION, {
        id: subscriptionGid,
      });

      expect(cancelResult.data).toBeDefined();
      const { appSubscription, userErrors } = cancelResult.data.appSubscriptionCancel;

      expect(userErrors).toHaveLength(0);
      expect(appSubscription).not.toBeNull();
      expect(appSubscription.status).toBe('CANCELLED');
    });

    it('rejects cancellation from a different shop domain (ownership validation)', async () => {
      // Step 1: Create and confirm a subscription with the primary token
      const createResult = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, {
        name: 'Test Plan',
        returnUrl: 'https://test-app.example.com/billing/confirm',
        test: true,
        lineItems: [],
      });

      const subscriptionGid =
        createResult.data.appSubscriptionCreate.appSubscription.id;
      const { confirmationUrl } = createResult.data.appSubscriptionCreate;
      const match = confirmationUrl.match(/\/admin\/charges\/(\d+)\/confirm_recurring/);
      expect(match).not.toBeNull();

      await app.inject({
        method: 'GET',
        url: `/admin/charges/${match![1]}/confirm_recurring`,
      });

      // Step 2: Seed a second token for a DIFFERENT shop domain
      const otherToken = await seedToken(app, 'other-shop.myshopify.com');

      // Step 3: Attempt to cancel the first shop's subscription with the second shop's token
      const cancelResult = await sendGql(app, otherToken, CANCEL_SUBSCRIPTION_MUTATION, {
        id: subscriptionGid,
      });

      expect(cancelResult.data).toBeDefined();
      const { appSubscription, userErrors } = cancelResult.data.appSubscriptionCancel;

      // Ownership validation must fail: either userErrors is non-empty or appSubscription is null
      const ownershipRejected =
        userErrors.length > 0 || appSubscription === null;
      expect(ownershipRejected).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // SHOP-21e/21f: appSubscriptionCancel rejects illegal state transitions
  // (SHOP-21e contains) — guard: only ACTIVE subscriptions can be cancelled
  // ---------------------------------------------------------------------------
  describe('SHOP-21e/21f — appSubscriptionCancel rejects illegal state transitions', () => {
    it('SHOP-21e: rejects cancel on a PENDING subscription (never confirmed)', async () => {
      // Step 1: Create a subscription — it starts PENDING
      const createResult = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, {
        name: 'Pending Plan',
        returnUrl: 'https://test-app.example.com/billing/confirm',
        test: true,
        lineItems: [],
      });

      expect(createResult.data).toBeDefined();
      const subscriptionGid =
        createResult.data.appSubscriptionCreate.appSubscription.id;

      // Step 2: Do NOT visit confirmationUrl — subscription stays PENDING

      // Step 3: Attempt to cancel the PENDING subscription
      const cancelResult = await sendGql(app, token, CANCEL_SUBSCRIPTION_MUTATION, {
        id: subscriptionGid,
      });

      expect(cancelResult.data).toBeDefined();
      const { appSubscription, userErrors } = cancelResult.data.appSubscriptionCancel;

      // Guard must reject: userErrors non-empty AND appSubscription null
      expect(userErrors.length).toBeGreaterThan(0);
      expect(appSubscription).toBeNull();

      // Post-condition: subscription must NOT have been mutated to CANCELLED.
      // currentAppInstallation.activeSubscriptions being empty proves the subscription
      // is still PENDING (not ACTIVE and not erroneously visible as active).
      const installResult = await sendGql(app, token, CURRENT_APP_INSTALLATION_QUERY);
      const { activeSubscriptions } = installResult.data.currentAppInstallation;
      expect(activeSubscriptions).toHaveLength(0);
    });

    it('SHOP-21f: rejects double-cancel on an already-CANCELLED subscription', async () => {
      // Step 1: Create a subscription
      const createResult = await sendGql(app, token, CREATE_SUBSCRIPTION_MUTATION, {
        name: 'Double Cancel Plan',
        returnUrl: 'https://test-app.example.com/billing/confirm',
        test: true,
        lineItems: [],
      });

      expect(createResult.data).toBeDefined();
      const subscriptionGid =
        createResult.data.appSubscriptionCreate.appSubscription.id;
      const { confirmationUrl } = createResult.data.appSubscriptionCreate;
      const match = confirmationUrl.match(/\/admin\/charges\/(\d+)\/confirm_recurring/);
      expect(match).not.toBeNull();

      // Step 2: Confirm (PENDING → ACTIVE)
      await app.inject({
        method: 'GET',
        url: `/admin/charges/${match![1]}/confirm_recurring`,
      });

      // Step 3: First cancel (ACTIVE → CANCELLED) — must succeed
      const firstCancel = await sendGql(app, token, CANCEL_SUBSCRIPTION_MUTATION, {
        id: subscriptionGid,
      });
      expect(firstCancel.data).toBeDefined();
      expect(firstCancel.data.appSubscriptionCancel.userErrors).toHaveLength(0);
      expect(firstCancel.data.appSubscriptionCancel.appSubscription).not.toBeNull();

      // Step 4: Second cancel attempt on already-CANCELLED subscription — must be rejected
      const secondCancel = await sendGql(app, token, CANCEL_SUBSCRIPTION_MUTATION, {
        id: subscriptionGid,
      });

      expect(secondCancel.data).toBeDefined();
      const { appSubscription: sub2, userErrors: errors2 } =
        secondCancel.data.appSubscriptionCancel;

      // Guard must reject: userErrors non-empty AND appSubscription null
      expect(errors2.length).toBeGreaterThan(0);
      expect(sub2).toBeNull();

      // Post-condition: subscription must remain CANCELLED (not double-mutated or reset).
      // After a successful first cancel, activeSubscriptions must be empty
      // (CANCELLED subscriptions do not appear in activeSubscriptions).
      const installResult = await sendGql(app, token, CURRENT_APP_INSTALLATION_QUERY);
      const { activeSubscriptions } = installResult.data.currentAppInstallation;
      expect(activeSubscriptions).toHaveLength(0);
    });
  });
});
