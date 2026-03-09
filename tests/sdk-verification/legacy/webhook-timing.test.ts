import { describe, it, expect, beforeEach } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { resetShopify, seedShopifyAccessToken } from '../setup/seeders.js';

const shopifyUrl = () => process.env.SHOPIFY_API_URL!;

/** Helper: execute an authenticated GraphQL mutation against the twin */
async function shopifyGraphQL(token: string, query: string): Promise<any> {
  const res = await fetch(shopifyUrl() + '/admin/api/2024-01/graphql.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

describe('Async Webhook Delivery Timing (INFRA-13)', () => {
  let accessToken: string;

  beforeEach(async () => {
    await resetShopify();
    accessToken = await seedShopifyAccessToken();
  });

  it('webhook subscription appears in admin state after registration', async () => {
    const callbackUrl = 'http://127.0.0.1:9999/fake'; // non-listening — just for registration
    await shopifyGraphQL(accessToken, `mutation {
      webhookSubscriptionCreate(topic: "products/create",
        webhookSubscription: { callbackUrl: "${callbackUrl}" }
      ) { webhookSubscription { id topic } userErrors { message } }
    }`);

    const stateRes = await fetch(shopifyUrl() + '/admin/state');
    const state = await stateRes.json() as any;
    expect(state.webhooks).toBeGreaterThanOrEqual(1);
  });

  it('delivered webhook arrives within 5 seconds via POST with JSON content-type', async () => {
    let receivedRequest: { method?: string; contentType?: string; body: any } | null = null;
    let resolveDelivery: () => void;
    const deliveryPromise = new Promise<void>(r => { resolveDelivery = r; });
    const triggerTime = { sent: 0, received: 0 };

    const listener = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        triggerTime.received = Date.now();
        try {
          receivedRequest = {
            method: req.method,
            contentType: req.headers['content-type'],
            body: body.length > 0 ? JSON.parse(body) : {},
          };
        } catch {
          receivedRequest = { method: req.method, contentType: req.headers['content-type'], body: {} };
        }
        res.writeHead(200); res.end('ok');
        resolveDelivery();
      });
    });
    await new Promise<void>(r => listener.listen(0, '127.0.0.1', r));
    const port = (listener.address() as any).port;
    const callbackUrl = `http://127.0.0.1:${port}/webhook`;

    try {
      // Register subscription for products/create via authenticated mutation
      await shopifyGraphQL(accessToken, `mutation {
        webhookSubscriptionCreate(topic: "products/create",
          webhookSubscription: { callbackUrl: "${callbackUrl}" }
        ) { webhookSubscription { id } userErrors { message } }
      }`);

      // Trigger by creating a product via authenticated GraphQL mutation
      // NOTE: /admin/fixtures/load only inserts state — it does NOT dispatch webhooks.
      triggerTime.sent = Date.now();
      const createResult = await shopifyGraphQL(accessToken, `mutation {
        productCreate(input: { title: "Webhook Timing Test" }) {
          product { id title }
          userErrors { field message }
        }
      }`);
      // Ensure product was created and webhook was enqueued
      expect(createResult.data?.productCreate?.product).toBeDefined();

      await Promise.race([
        deliveryPromise,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('webhook timing: delivery timeout after 5s')), 5000)),
      ]);

      // Assert delivery method, content-type, timing, and payload
      expect(receivedRequest).toBeDefined();
      expect(receivedRequest!.method).toBe('POST');
      expect(receivedRequest!.contentType).toContain('application/json');
      expect(receivedRequest!.body).toBeDefined();

      // Timing: webhook should arrive within 5 seconds of trigger
      const elapsed = triggerTime.received - triggerTime.sent;
      expect(elapsed).toBeLessThan(5000);
      expect(elapsed).toBeGreaterThanOrEqual(0);
    } finally {
      await new Promise<void>(r => listener.close(() => r()));
    }
  });
});
