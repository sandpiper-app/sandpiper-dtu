/**
 * Tier-based Rate Limiter for Slack Web API
 *
 * Uses sliding window algorithm (not leaky bucket — Slack uses simple per-minute windows).
 * Each method has an assigned tier with different requests-per-minute limits.
 *
 * Tiers (from Slack docs):
 * - Tier 1: 1+ per minute
 * - Tier 2: 20+ per minute
 * - Tier 3: 50+ per minute
 * - Tier 4: 100+ per minute
 * - Special: method-specific limits
 */

export interface MethodRateConfig {
  tier: 1 | 2 | 3 | 4 | 'special';
  requestsPerMinute: number;
}

/** Built-in tier assignments for Phase 5 Web API methods */
const DEFAULT_RATE_TIERS: Record<string, MethodRateConfig> = {
  'chat.postMessage': { tier: 'special', requestsPerMinute: 60 },
  'chat.update': { tier: 3, requestsPerMinute: 50 },
  'conversations.list': { tier: 2, requestsPerMinute: 20 },
  'conversations.info': { tier: 3, requestsPerMinute: 50 },
  'conversations.history': { tier: 3, requestsPerMinute: 50 },
  'users.list': { tier: 2, requestsPerMinute: 20 },
  'users.info': { tier: 4, requestsPerMinute: 100 },
};

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class SlackRateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private tiers: Record<string, MethodRateConfig>;

  constructor(tierOverrides?: Record<string, MethodRateConfig>) {
    this.tiers = { ...DEFAULT_RATE_TIERS, ...tierOverrides };
  }

  /**
   * Check if a request is rate-limited.
   * @returns null if allowed, { retryAfter: seconds } if limited
   */
  check(method: string, token: string): { retryAfter: number } | null {
    const config = this.tiers[method];
    if (!config) return null; // Unknown methods are not rate-limited

    const key = `${method}:${token}`;
    const now = Date.now();
    const entry = this.windows.get(key);

    // Start new window if none exists or current window expired
    if (!entry || now >= entry.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + 60_000 });
      return null;
    }

    // Check if limit exceeded
    if (entry.count >= config.requestsPerMinute) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return { retryAfter };
    }

    // Increment and allow
    entry.count++;
    return null;
  }

  /** Clear all rate limit windows */
  reset(): void {
    this.windows.clear();
  }
}
