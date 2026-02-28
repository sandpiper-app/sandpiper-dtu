/**
 * @dtu/webhooks - Shared webhook delivery infrastructure
 *
 * Provides async webhook delivery with retry, exponential backoff,
 * and SQLite-backed dead letter queue for failed deliveries.
 */

// Types
export type {
  WebhookDelivery,
  WebhookJob,
  DeadLetterEntry,
  WebhookQueueOptions,
  WebhookLogger,
  DeadLetterStore,
} from './types.js';

// Delivery
export { deliverWebhook, generateHmacSignature } from './webhook-delivery.js';

// Queue
export { WebhookQueue } from './webhook-queue.js';

// Dead Letter Store
export { SqliteDeadLetterStore } from './dead-letter.js';
