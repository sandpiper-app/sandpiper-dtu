import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { resetShopify, seedShopifyAccessToken } from '../setup/seeders.js';

const shopifyUrl = () => process.env.SHOPIFY_API_URL!;
const shopifySecret = 'dev-secret'; // default SHOPIFY_WEBHOOK_SECRET in twin index.ts

function signPayload(payload: string): string {
  return createHmac('sha256', shopifySecret).update(payload, 'utf8').digest('base64');
}

/** Helper: execute an authenticated GraphQL mutation against the twin */
async function shopifyGraphQL(token: string, query: string): Promise<any> {
  const res = await fetch(shopifyUrl() + '/admin/api/2024-01/graphql.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

describe('HMAC Signature Verification (INFRA-13)', () => {
  it('generateHmacSignature produces 32-byte base64-encoded SHA256', () => {
    const payload = '{"id":1,"name":"test"}';
    const signature = signPayload(payload);
    const decoded = Buffer.from(signature, 'base64');
    expect(decoded.length).toBe(32);
  });

  it('valid HMAC matches expected signature', () => {
    const payload = '{"id":1}';
    const sig1 = signPayload(payload);
    const sig2 = signPayload(payload);
    expect(sig1).toBe(sig2); // deterministic
  });

  it('tampered payload produces different HMAC', () => {
    const original = '{"id":1,"name":"original"}';
    const tampered = '{"id":1,"name":"tampered"}';
    expect(signPayload(original)).not.toBe(signPayload(tampered));
  });

  describe('twin delivers webhook with valid HMAC', () => {
    let accessToken: string;

    beforeEach(async () => {
      await resetShopify();
      accessToken = await seedShopifyAccessToken();
    });

    it('delivered webhook includes correct X-Shopify-Hmac-Sha256 header', async () => {
      // Start a local listener to receive the webhook
      let receivedHeaders: Record<string, string | string[] | undefined> = {};
      let receivedBody = '';
      let resolveDelivery: () => void;
      const deliveryPromise = new Promise<void>(r => { resolveDelivery = r; });

      const listener = createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          receivedHeaders = req.headers as any;
          receivedBody = body;
          res.writeHead(200); res.end('ok');
          resolveDelivery();
        });
      });
      await new Promise<void>(r => listener.listen(0, '127.0.0.1', r));
      const listenerPort = (listener.address() as any).port;
      const callbackUrl = `http://127.0.0.1:${listenerPort}/webhook`;

      try {
        // Register webhook subscription via authenticated GraphQL mutation
        const subBody = await shopifyGraphQL(accessToken, `mutation {
          webhookSubscriptionCreate(topic: ORDERS_CREATE,
            webhookSubscription: { callbackUrl: "${callbackUrl}" }
          ) { webhookSubscription { id } userErrors { message } }
        }`);
        expect(subBody.data?.webhookSubscriptionCreate?.userErrors).toHaveLength(0);

        // Trigger webhook by creating an order via authenticated GraphQL mutation
        // NOTE: /admin/fixtures/load only inserts state — it does NOT dispatch webhooks.
        // Real GraphQL mutations (orderCreate) trigger the webhook queue.
        // totalPrice and currencyCode are required by the twin's orderCreate resolver.
        await shopifyGraphQL(accessToken, `mutation {
          orderCreate(order: {
            lineItems: [{ title: "Test Item", quantity: 1 }]
            totalPrice: "10.00"
            currencyCode: "USD"
          }) { order { id name } userErrors { field message } }
        }`);

        // Wait for delivery with 5s timeout
        await Promise.race([
          deliveryPromise,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('webhook delivery timeout')), 5000)),
        ]);

        // Verify HMAC
        const expected = signPayload(receivedBody);
        expect(receivedHeaders['x-shopify-hmac-sha256']).toBe(expected);
      } finally {
        await new Promise<void>(r => listener.close(() => r()));
      }
    });
  });
});
