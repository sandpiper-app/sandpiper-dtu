/**
 * Leaky Bucket Rate Limiter for Shopify twin
 *
 * Implements Shopify's throttling model:
 * - Each shop (key) has a bucket with a maximum capacity
 * - Bucket refills at a fixed rate (restoreRate pts/sec)
 * - Queries are gated by their calculated cost
 * - If bucket is depleted, requests are rejected with a retryAfterMs hint
 */

interface BucketState {
  available: number;
  lastRefill: number; // Unix timestamp in ms
}

export interface TryConsumeResult {
  allowed: boolean;
  currentlyAvailable: number;
  retryAfterMs: number;
}

export class LeakyBucketRateLimiter {
  readonly maxAvailable: number;
  readonly restoreRate: number; // points per second
  readonly enabled: boolean;

  private buckets: Map<string, BucketState>;

  constructor(maxAvailable = 1000, restoreRate = 50, enabled = true) {
    this.maxAvailable = maxAvailable;
    this.restoreRate = restoreRate;
    this.enabled = enabled;
    this.buckets = new Map();
  }

  /**
   * Attempt to consume `cost` points from the bucket identified by `key`.
   * If allowed, deducts the cost and returns allowed=true.
   * If not allowed, returns allowed=false with retryAfterMs indicating how
   * long to wait before the bucket will have sufficient capacity.
   */
  tryConsume(key: string, cost: number): TryConsumeResult {
    if (!this.enabled) {
      return { allowed: true, currentlyAvailable: this.maxAvailable, retryAfterMs: 0 };
    }

    const now = Date.now();

    // Get or create bucket
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { available: this.maxAvailable, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill based on elapsed time
    const elapsedMs = now - bucket.lastRefill;
    const elapsedSeconds = elapsedMs / 1000;
    const refillAmount = elapsedSeconds * this.restoreRate;

    bucket.available = Math.min(
      this.maxAvailable,
      bucket.available + refillAmount
    );
    bucket.lastRefill = now;

    // Shopify allows requests when bucket has any capacity — deducts full cost, can go negative.
    // Next request is throttled if available <= 0.
    if (bucket.available <= 0) {
      // Throttled — calculate how long until any points are restored
      const deficit = -bucket.available;
      const retryAfterMs = Math.ceil(((deficit + 1) / this.restoreRate) * 1000);
      return {
        allowed: false,
        currentlyAvailable: Math.max(0, bucket.available),
        retryAfterMs,
      };
    }
    // Deduct requestedQueryCost upfront; post-execution refund will credit back the difference.
    bucket.available -= cost;
    return {
      allowed: true,
      currentlyAvailable: bucket.available,
      retryAfterMs: 0,
    };
  }

  /**
   * Refund points back to the bucket (used after post-execution actualQueryCost is known).
   * Refund amount is capped so bucket does not exceed maxAvailable.
   * No-op when rate limiting is disabled.
   */
  refund(key: string, amount: number): void {
    if (!this.enabled || amount <= 0) return;
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    bucket.available = Math.min(this.maxAvailable, bucket.available + amount);
  }

  /**
   * Reset all bucket state. Called when /admin/reset is invoked.
   */
  reset(): void {
    this.buckets.clear();
  }
}
