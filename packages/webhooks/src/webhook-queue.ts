/**
 * In-memory webhook delivery queue with configurable retry and backoff.
 *
 * Features:
 * - Exponential backoff with configurable delays (default: immediate, 1min, 5min)
 * - Configurable time scale for compressed testing (0.001x = ms instead of minutes)
 * - Sync mode for simpler test assertions
 * - Dead letter queue for permanently failed deliveries
 * - Clean shutdown without timer leaks
 */

import { randomUUID } from 'node:crypto';
import { deliverWebhook } from './webhook-delivery.js';
import type {
  WebhookDelivery,
  WebhookJob,
  WebhookQueueOptions,
  DeadLetterStore,
  WebhookLogger,
} from './types.js';

interface PendingEntry {
  job: WebhookJob;
  timer: ReturnType<typeof setTimeout> | null;
}

export class WebhookQueue {
  private pending: Map<string, PendingEntry> = new Map();
  private readonly timeScale: number;
  private readonly retryDelays: number[];
  private readonly deadLetterStore: DeadLetterStore;
  private readonly syncMode: boolean;
  private readonly deliveryTimeoutMs: number;
  private readonly logger?: WebhookLogger;

  constructor(options: WebhookQueueOptions) {
    this.timeScale = options.timeScale ?? 1.0;
    this.retryDelays = options.retryDelays ?? [0, 60_000, 300_000];
    this.deadLetterStore = options.deadLetterStore;
    this.syncMode = options.syncMode ?? false;
    this.deliveryTimeoutMs = options.deliveryTimeoutMs ?? 5000;
    this.logger = options.logger;
  }

  /**
   * Enqueue a webhook delivery.
   *
   * In async mode (default): schedules delivery and returns immediately.
   * In sync mode: awaits delivery and throws on failure (no retry).
   *
   * @returns The job ID for tracking
   */
  async enqueue(delivery: WebhookDelivery): Promise<string> {
    const jobId = delivery.id || randomUUID();
    const now = Date.now();
    const job: WebhookJob = {
      delivery,
      jobId,
      attempt: 0,
      firstAttemptedAt: now,
      lastAttemptedAt: now,
    };

    if (this.syncMode) {
      await this.executeAttempt(job);
      return jobId;
    }

    this.pending.set(jobId, { job, timer: null });
    this.scheduleAttempt(jobId);
    return jobId;
  }

  /** Get count of in-flight deliveries */
  get size(): number {
    return this.pending.size;
  }

  /**
   * Drain all pending jobs. Cancels timers without moving to DLQ.
   * Use for graceful shutdown when you don't care about in-flight deliveries.
   */
  async drain(): Promise<void> {
    for (const [, entry] of this.pending) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.pending.clear();
  }

  /**
   * Shutdown cleanly. Cancels all pending timers.
   * Identical to drain() — provided as a semantic alias.
   */
  shutdown(): void {
    for (const [, entry] of this.pending) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.pending.clear();
  }

  private scheduleAttempt(jobId: string): void {
    const entry = this.pending.get(jobId);
    if (!entry) return;

    const { job } = entry;

    // First attempt (attempt=0) uses retryDelays[0] (which is 0 = immediate)
    // Subsequent retries use retryDelays[attempt] scaled by timeScale
    const delayIndex = job.attempt;
    const baseDelay =
      delayIndex < this.retryDelays.length
        ? this.retryDelays[delayIndex]
        : this.retryDelays[this.retryDelays.length - 1];
    const delay = baseDelay * this.timeScale;

    if (delay === 0) {
      // Immediate execution
      this.executeAttempt(job).catch(() => {});
    } else {
      entry.timer = setTimeout(() => {
        this.executeAttempt(job).catch(() => {});
      }, delay);
    }
  }

  private async executeAttempt(job: WebhookJob): Promise<void> {
    job.lastAttemptedAt = Date.now();

    try {
      await deliverWebhook(job.delivery, this.deliveryTimeoutMs);
      // Success — remove from pending
      this.pending.delete(job.jobId);
      this.logger?.info(
        {
          jobId: job.jobId,
          topic: job.delivery.topic,
          attempt: job.attempt,
        },
        'Webhook delivered'
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      job.lastError = errorMsg;
      job.attempt++;

      if (job.attempt >= this.retryDelays.length) {
        // Max retries exhausted — move to dead letter queue
        this.deadLetterStore.add(job);
        this.pending.delete(job.jobId);
        this.logger?.warn(
          {
            jobId: job.jobId,
            topic: job.delivery.topic,
            attempts: job.attempt,
            error: errorMsg,
          },
          'Webhook moved to dead letter queue'
        );
      } else {
        // Schedule retry
        this.logger?.info(
          {
            jobId: job.jobId,
            topic: job.delivery.topic,
            attempt: job.attempt,
            nextRetryDelayMs:
              this.retryDelays[job.attempt] * this.timeScale,
          },
          'Webhook delivery failed, scheduling retry'
        );
        this.scheduleAttempt(job.jobId);
      }

      // In sync mode, propagate the error
      if (this.syncMode) {
        throw error;
      }
    }
  }
}
