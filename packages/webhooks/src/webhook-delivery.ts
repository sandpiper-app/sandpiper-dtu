/**
 * Webhook HTTP delivery with HMAC-SHA256 signing
 *
 * Generalized from twins/shopify/src/services/webhook-sender.ts.
 * Throws on non-2xx responses so the queue can retry.
 */

import crypto from 'node:crypto';
import type { WebhookDelivery } from './types.js';

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 * Returns base64-encoded signature matching Shopify's X-Shopify-Hmac-Sha256 format.
 */
export function generateHmacSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');
}

/**
 * Deliver a webhook via HTTP POST with HMAC signature.
 * Throws on non-2xx responses or network errors so the caller can retry.
 *
 * @param delivery - The webhook delivery request
 * @param timeoutMs - HTTP request timeout in milliseconds (default: 5000)
 */
export async function deliverWebhook(
  delivery: WebhookDelivery,
  timeoutMs: number = 5000
): Promise<void> {
  const body = JSON.stringify(delivery.payload);
  const signature = generateHmacSignature(body, delivery.secret);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shopify-Hmac-Sha256': signature,
    'X-Shopify-Topic': delivery.topic,
    'X-Shopify-Webhook-Id': delivery.id,
    ...(delivery.headers ?? {}),
  };

  const response = await fetch(delivery.callbackUrl, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Webhook delivery failed: ${response.status} ${response.statusText}`
    );
  }
}
