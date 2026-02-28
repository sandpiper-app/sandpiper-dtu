/**
 * @dtu/webhooks - Shared webhook types
 *
 * Types for webhook delivery, queueing, retry, and dead letter storage.
 */

/** A webhook delivery request to be enqueued */
export interface WebhookDelivery {
  /** Unique delivery ID (UUID) */
  id: string;
  /** Webhook topic (e.g. 'orders/create') */
  topic: string;
  /** Destination callback URL */
  callbackUrl: string;
  /** JSON payload to deliver */
  payload: Record<string, unknown>;
  /** HMAC signing secret */
  secret: string;
  /** Additional HTTP headers (e.g. shop domain, API version) */
  headers?: Record<string, string>;
}

/** An in-flight webhook job tracked by the queue */
export interface WebhookJob {
  /** The delivery to attempt */
  delivery: WebhookDelivery;
  /** Unique job ID */
  jobId: string;
  /** Current attempt number (0-based, incremented after each failure) */
  attempt: number;
  /** Timestamp of first attempt (ms since epoch) */
  firstAttemptedAt: number;
  /** Timestamp of most recent attempt (ms since epoch) */
  lastAttemptedAt: number;
  /** Error message from last failed attempt */
  lastError?: string;
}

/** A dead letter queue entry for a permanently failed delivery */
export interface DeadLetterEntry {
  /** Auto-increment ID */
  id: number;
  /** Original job ID */
  jobId: string;
  /** Webhook topic */
  topic: string;
  /** Destination callback URL */
  callbackUrl: string;
  /** JSON-serialized payload */
  payload: string;
  /** Error message from final attempt */
  errorMessage: string | null;
  /** Total number of attempts made */
  attempts: number;
  /** Timestamp of first attempt (ms since epoch) */
  firstAttemptedAt: number;
  /** Timestamp of last attempt (ms since epoch) */
  lastAttemptedAt: number;
}

/** Configuration options for WebhookQueue */
export interface WebhookQueueOptions {
  /** Delay multiplier. 1.0 = real timing, 0.001 = compressed for tests. Default: 1.0 */
  timeScale?: number;
  /** Retry delays in ms at timeScale=1.0. Default: [0, 60000, 300000] (immediate, 1min, 5min) */
  retryDelays?: number[];
  /** Dead letter store instance for permanently failed deliveries */
  deadLetterStore: DeadLetterStore;
  /** If true, enqueue() awaits delivery and throws on failure. Default: false */
  syncMode?: boolean;
  /** HTTP delivery timeout in ms. Default: 5000 */
  deliveryTimeoutMs?: number;
  /** Pino-compatible logger instance. Optional. */
  logger?: WebhookLogger;
}

/** Minimal logger interface (pino-compatible) */
export interface WebhookLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Interface for dead letter queue storage */
export interface DeadLetterStore {
  /** Add a failed job to the dead letter queue */
  add(job: WebhookJob): void;
  /** List all dead letter entries */
  list(): DeadLetterEntry[];
  /** Get a single entry by ID */
  get(id: number): DeadLetterEntry | undefined;
  /** Remove an entry by ID. Returns true if removed. */
  remove(id: number): boolean;
  /** Remove all entries */
  clear(): void;
  /** Close resources (no-op if sharing DB) */
  close(): void;
}
