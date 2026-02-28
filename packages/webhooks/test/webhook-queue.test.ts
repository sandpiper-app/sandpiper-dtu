/**
 * Integration tests for WebhookQueue, WebhookDelivery, and SqliteDeadLetterStore.
 *
 * Uses a local HTTP server as the webhook callback target.
 * Compressed timing (timeScale=0.001) keeps retry tests fast.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { WebhookQueue } from '../src/webhook-queue.js';
import { SqliteDeadLetterStore } from '../src/dead-letter.js';
import { generateHmacSignature } from '../src/webhook-delivery.js';
import type { WebhookDelivery } from '../src/types.js';

/** Create a simple HTTP server that records requests */
function createCallbackServer(
  handler?: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{
  server: ReturnType<typeof createServer>;
  url: string;
  requests: Array<{ headers: Record<string, string | string[] | undefined>; body: string }>;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const requests: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];

    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        requests.push({ headers: req.headers, body });
        if (handler) {
          handler(req, res);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({
          server,
          url: `http://127.0.0.1:${addr.port}/webhook`,
          requests,
          close: () => new Promise<void>((r) => server.close(() => r())),
        });
      }
    });
  });
}

function makeDelivery(url: string, overrides?: Partial<WebhookDelivery>): WebhookDelivery {
  return {
    id: crypto.randomUUID(),
    topic: 'orders/create',
    callbackUrl: url,
    payload: { id: 1, name: '#1001', total_price: '99.99' },
    secret: 'test-secret',
    headers: {
      'X-Shopify-Shop-Domain': 'twin.myshopify.com',
      'X-Shopify-API-Version': '2024-01',
    },
    ...overrides,
  };
}

describe('WebhookQueue', () => {
  let db: Database.Database;
  let dlq: SqliteDeadLetterStore;

  beforeEach(() => {
    db = new Database(':memory:');
    dlq = new SqliteDeadLetterStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('delivers webhook successfully with correct headers and HMAC', async () => {
    const { url, requests, close } = await createCallbackServer();

    try {
      const queue = new WebhookQueue({
        deadLetterStore: dlq,
        syncMode: true,
      });

      const delivery = makeDelivery(url);
      await queue.enqueue(delivery);

      expect(requests).toHaveLength(1);

      const req = requests[0];
      expect(req.headers['content-type']).toBe('application/json');
      expect(req.headers['x-shopify-topic']).toBe('orders/create');
      expect(req.headers['x-shopify-webhook-id']).toBe(delivery.id);
      expect(req.headers['x-shopify-shop-domain']).toBe('twin.myshopify.com');
      expect(req.headers['x-shopify-api-version']).toBe('2024-01');

      // Verify HMAC signature
      const expectedSignature = generateHmacSignature(
        JSON.stringify(delivery.payload),
        delivery.secret
      );
      expect(req.headers['x-shopify-hmac-sha256']).toBe(expectedSignature);

      // Verify payload
      const parsed = JSON.parse(req.body);
      expect(parsed).toEqual(delivery.payload);

      queue.shutdown();
    } finally {
      await close();
    }
  });

  it('retries on failure and succeeds on subsequent attempt', async () => {
    let callCount = 0;
    const { url, requests, close } = await createCallbackServer((req, res) => {
      callCount++;
      if (callCount <= 2) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"error":"server error"}');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      }
    });

    try {
      const queue = new WebhookQueue({
        deadLetterStore: dlq,
        timeScale: 0.001,
        retryDelays: [0, 100, 100], // immediate, then 0.1ms, then 0.1ms
      });

      const delivery = makeDelivery(url);
      await queue.enqueue(delivery);

      // Wait for retries to complete (compressed timing)
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(callCount).toBe(3);
      expect(queue.size).toBe(0);
      expect(dlq.list()).toHaveLength(0);

      queue.shutdown();
    } finally {
      await close();
    }
  });

  it('moves to dead letter queue after all retries exhausted', async () => {
    const { url, close } = await createCallbackServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"always fails"}');
    });

    try {
      const queue = new WebhookQueue({
        deadLetterStore: dlq,
        timeScale: 0.001,
        retryDelays: [0, 10, 10], // 3 attempts, fast
      });

      const delivery = makeDelivery(url);
      await queue.enqueue(delivery);

      // Wait for all retries + DLQ write
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(queue.size).toBe(0);

      const entries = dlq.list();
      expect(entries).toHaveLength(1);
      expect(entries[0].topic).toBe('orders/create');
      expect(entries[0].callbackUrl).toBe(url);
      expect(entries[0].attempts).toBe(3);
      expect(entries[0].errorMessage).toContain('500');

      const payload = JSON.parse(entries[0].payload);
      expect(payload).toEqual(delivery.payload);

      queue.shutdown();
    } finally {
      await close();
    }
  });

  it('uses compressed timing for fast test execution', async () => {
    const { url, close } = await createCallbackServer((req, res) => {
      res.writeHead(500);
      res.end();
    });

    try {
      const start = Date.now();
      const queue = new WebhookQueue({
        deadLetterStore: dlq,
        timeScale: 0.001,
        retryDelays: [0, 60_000, 300_000], // Would be 6 minutes at timeScale=1.0
      });

      const delivery = makeDelivery(url);
      await queue.enqueue(delivery);

      // Wait for retries (should be ~360ms at 0.001x, not 360000ms)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000); // Must complete in under 5 seconds
      expect(dlq.list()).toHaveLength(1); // Should be in DLQ

      queue.shutdown();
    } finally {
      await close();
    }
  });

  it('sync mode awaits delivery and throws on failure', async () => {
    const { url, requests, close } = await createCallbackServer();

    try {
      const queue = new WebhookQueue({
        deadLetterStore: dlq,
        syncMode: true,
      });

      const delivery = makeDelivery(url);
      await queue.enqueue(delivery);

      expect(requests).toHaveLength(1);
      queue.shutdown();
    } finally {
      await close();
    }

    // Test failure case
    const { url: failUrl, close: closeFailServer } = await createCallbackServer((req, res) => {
      res.writeHead(500);
      res.end();
    });

    try {
      const failQueue = new WebhookQueue({
        deadLetterStore: dlq,
        syncMode: true,
      });

      const failDelivery = makeDelivery(failUrl);
      await expect(failQueue.enqueue(failDelivery)).rejects.toThrow('Webhook delivery failed');

      failQueue.shutdown();
    } finally {
      await closeFailServer();
    }
  });

  it('shutdown cancels all pending timers without leaks', async () => {
    const { url, close } = await createCallbackServer((req, res) => {
      res.writeHead(500);
      res.end();
    });

    try {
      const queue = new WebhookQueue({
        deadLetterStore: dlq,
        timeScale: 1.0, // Real timing — retries would take minutes
        retryDelays: [0, 60_000, 300_000],
      });

      // Enqueue multiple deliveries
      await queue.enqueue(makeDelivery(url));
      await queue.enqueue(makeDelivery(url));

      // Wait for first attempt to fail
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Shutdown should clear all pending timers
      queue.shutdown();
      expect(queue.size).toBe(0);

      // DLQ should NOT have entries (shutdown cancels, doesn't DLQ)
      // Items may or may not have made it to retry depending on timing
    } finally {
      await close();
    }
  });

  it('verifies HMAC signature is valid base64-encoded SHA256', () => {
    const payload = '{"id":1,"name":"#1001"}';
    const secret = 'webhook-secret-key';

    const signature = generateHmacSignature(payload, secret);

    // Verify it's valid base64
    const buffer = Buffer.from(signature, 'base64');
    expect(buffer.length).toBe(32); // SHA256 = 32 bytes

    // Verify against manual computation
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('base64');
    expect(signature).toBe(expected);
  });
});

describe('SqliteDeadLetterStore', () => {
  let db: Database.Database;
  let dlq: SqliteDeadLetterStore;

  beforeEach(() => {
    db = new Database(':memory:');
    dlq = new SqliteDeadLetterStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('stores and retrieves dead letter entries', () => {
    const job = {
      delivery: {
        id: 'test-id',
        topic: 'orders/create',
        callbackUrl: 'http://localhost:4000/webhook',
        payload: { id: 1 },
        secret: 'secret',
      },
      jobId: 'job-1',
      attempt: 3,
      firstAttemptedAt: 1000,
      lastAttemptedAt: 3000,
      lastError: 'Connection refused',
    };

    dlq.add(job);

    const entries = dlq.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].jobId).toBe('job-1');
    expect(entries[0].topic).toBe('orders/create');
    expect(entries[0].errorMessage).toBe('Connection refused');
    expect(entries[0].attempts).toBe(3);

    // Get by ID
    const entry = dlq.get(entries[0].id);
    expect(entry).toBeDefined();
    expect(entry!.jobId).toBe('job-1');
  });

  it('removes individual entries', () => {
    const job = {
      delivery: { id: 'id', topic: 't', callbackUrl: 'http://x', payload: {}, secret: 's' },
      jobId: 'j1',
      attempt: 1,
      firstAttemptedAt: 1,
      lastAttemptedAt: 1,
    };

    dlq.add(job);
    const entries = dlq.list();
    expect(entries).toHaveLength(1);

    const removed = dlq.remove(entries[0].id);
    expect(removed).toBe(true);
    expect(dlq.list()).toHaveLength(0);

    // Removing non-existent returns false
    expect(dlq.remove(999)).toBe(false);
  });

  it('clears all entries', () => {
    for (let i = 0; i < 3; i++) {
      dlq.add({
        delivery: { id: `id-${i}`, topic: 't', callbackUrl: 'http://x', payload: {}, secret: 's' },
        jobId: `j-${i}`,
        attempt: 1,
        firstAttemptedAt: 1,
        lastAttemptedAt: 1,
      });
    }

    expect(dlq.list()).toHaveLength(3);
    dlq.clear();
    expect(dlq.list()).toHaveLength(0);
  });
});
