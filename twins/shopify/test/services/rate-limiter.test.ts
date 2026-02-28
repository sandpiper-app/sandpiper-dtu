/**
 * Unit tests for the leaky bucket rate limiter.
 *
 * Verifies:
 * - Basic consumption (allowed when bucket is full)
 * - Throttling when bucket is depleted
 * - Bucket refill over time
 * - Per-key bucket isolation
 * - Reset clears all state
 * - retryAfterMs calculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LeakyBucketRateLimiter } from '../../src/services/rate-limiter.js';

describe('LeakyBucketRateLimiter', () => {
  describe('constructor', () => {
    it('uses default values of 1000 maxAvailable and 50 restoreRate', () => {
      const limiter = new LeakyBucketRateLimiter();
      expect(limiter.maxAvailable).toBe(1000);
      expect(limiter.restoreRate).toBe(50);
    });

    it('accepts custom maxAvailable and restoreRate', () => {
      const limiter = new LeakyBucketRateLimiter(500, 25);
      expect(limiter.maxAvailable).toBe(500);
      expect(limiter.restoreRate).toBe(25);
    });
  });

  describe('tryConsume', () => {
    it('allows consumption when bucket is full', () => {
      const limiter = new LeakyBucketRateLimiter(1000, 50);
      const result = limiter.tryConsume('shop1', 100);
      expect(result.allowed).toBe(true);
      expect(result.currentlyAvailable).toBe(900);
      expect(result.retryAfterMs).toBe(0);
    });

    it('deducts cost from available', () => {
      const limiter = new LeakyBucketRateLimiter(1000, 50);
      limiter.tryConsume('shop1', 200);
      const result = limiter.tryConsume('shop1', 300);
      expect(result.allowed).toBe(true);
      expect(result.currentlyAvailable).toBeCloseTo(500, 0);
    });

    it('throttles when cost exceeds available', () => {
      const limiter = new LeakyBucketRateLimiter(100, 50);
      // Drain the bucket
      limiter.tryConsume('shop1', 100);
      // Next request should be denied
      const result = limiter.tryConsume('shop1', 50);
      expect(result.allowed).toBe(false);
    });

    it('returns retryAfterMs when throttled', () => {
      const limiter = new LeakyBucketRateLimiter(100, 50);
      // Drain bucket completely
      limiter.tryConsume('shop1', 100);
      // Try to consume 50 more — deficit = 50, at 50pts/sec => 1000ms
      const result = limiter.tryConsume('shop1', 50);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(1000);
    });

    it('retryAfterMs is ceil of fractional seconds', () => {
      // restoreRate = 100 pts/sec, deficit = 75 pts => 0.75 sec => ceil => 750ms
      const limiter = new LeakyBucketRateLimiter(100, 100);
      limiter.tryConsume('shop1', 100);
      const result = limiter.tryConsume('shop1', 75);
      expect(result.retryAfterMs).toBe(750);
    });

    it('reports currentlyAvailable when throttled', () => {
      const limiter = new LeakyBucketRateLimiter(100, 50);
      limiter.tryConsume('shop1', 80);
      // 20 remaining, try to consume 50 → denied
      const result = limiter.tryConsume('shop1', 50);
      expect(result.allowed).toBe(false);
      expect(result.currentlyAvailable).toBeCloseTo(20, 0);
    });

    it('uses separate buckets per key', () => {
      const limiter = new LeakyBucketRateLimiter(100, 50);
      // Drain shop1
      limiter.tryConsume('shop1', 100);
      // shop2 should be unaffected
      const result = limiter.tryConsume('shop2', 100);
      expect(result.allowed).toBe(true);
    });
  });

  describe('bucket refill', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('refills bucket at restoreRate pts/sec', () => {
      const limiter = new LeakyBucketRateLimiter(1000, 50);

      // Drain 500 points
      limiter.tryConsume('shop1', 500);

      // Advance time by 5 seconds — should restore 250 points
      vi.advanceTimersByTime(5000);

      const result = limiter.tryConsume('shop1', 0);
      // After 5s at 50pts/sec, restored 250 pts → 500 - 0 + 250 = 750
      // Then tryConsume(0) doesn't change anything
      expect(result.currentlyAvailable).toBeCloseTo(750, 0);
    });

    it('caps refill at maxAvailable', () => {
      const limiter = new LeakyBucketRateLimiter(1000, 50);

      // Drain 100 points
      limiter.tryConsume('shop1', 100);

      // Advance time by 100 seconds (would restore 5000 pts without cap)
      vi.advanceTimersByTime(100000);

      // Should be capped at 1000
      const result = limiter.tryConsume('shop1', 0);
      expect(result.currentlyAvailable).toBe(1000);
    });

    it('allows request after sufficient refill time', () => {
      const limiter = new LeakyBucketRateLimiter(100, 50);

      // Drain completely
      limiter.tryConsume('shop1', 100);

      // Verify denied immediately
      const denied = limiter.tryConsume('shop1', 50);
      expect(denied.allowed).toBe(false);

      // Advance 1 second — restores 50 pts (exactly enough)
      vi.advanceTimersByTime(1000);

      const allowed = limiter.tryConsume('shop1', 50);
      expect(allowed.allowed).toBe(true);
    });

    it('initializes new bucket with full capacity', () => {
      const limiter = new LeakyBucketRateLimiter(1000, 50);
      vi.advanceTimersByTime(10000);

      // New key — should start full regardless of elapsed time
      const result = limiter.tryConsume('brand-new-key', 0);
      expect(result.currentlyAvailable).toBe(1000);
    });
  });

  describe('reset', () => {
    it('clears all bucket state', () => {
      const limiter = new LeakyBucketRateLimiter(100, 50);

      // Drain bucket
      limiter.tryConsume('shop1', 100);

      // Verify drained
      const beforeReset = limiter.tryConsume('shop1', 50);
      expect(beforeReset.allowed).toBe(false);

      // Reset
      limiter.reset();

      // Should now have full bucket again (new bucket created)
      const afterReset = limiter.tryConsume('shop1', 100);
      expect(afterReset.allowed).toBe(true);
    });

    it('resets all keys, not just one', () => {
      const limiter = new LeakyBucketRateLimiter(100, 50);

      limiter.tryConsume('shop1', 100);
      limiter.tryConsume('shop2', 100);

      limiter.reset();

      // Both should be restored
      expect(limiter.tryConsume('shop1', 100).allowed).toBe(true);
      expect(limiter.tryConsume('shop2', 100).allowed).toBe(true);
    });
  });
});
