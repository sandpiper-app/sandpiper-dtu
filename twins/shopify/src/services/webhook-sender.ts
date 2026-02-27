/**
 * Webhook delivery with HMAC signature
 *
 * Sends webhook POST requests with X-Shopify-Hmac-Sha256 signature
 * for state mutations (orders/create, orders/update, etc.)
 */

import crypto from 'node:crypto';

export interface WebhookPayload {
  id: number;
  admin_graphql_api_id: string; // GID format
  created_at: string; // ISO 8601
  updated_at?: string; // ISO 8601 (for update webhooks)
  [key: string]: any;
}

function generateWebhookSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');
}

export async function sendWebhook(
  url: string,
  topic: string,
  payload: WebhookPayload,
  secret: string
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, secret);

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': topic,
        'X-Shopify-Hmac-Sha256': signature,
        'X-Shopify-Shop-Domain': 'twin.myshopify.com',
        'X-Shopify-API-Version': '2024-01',
        'X-Shopify-Webhook-Id': crypto.randomUUID()
      },
      body,
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
  } catch (error) {
    // Log but don't throw - Phase 2 doesn't retry
    console.error('Webhook delivery failed:', error);
  }
}
