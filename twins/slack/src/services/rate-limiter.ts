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

/** Built-in tier assignments for Phase 5-18 Web API methods */
const DEFAULT_RATE_TIERS: Record<string, MethodRateConfig> = {
  'auth.test': { tier: 1, requestsPerMinute: 20 },
  'chat.postMessage': { tier: 'special', requestsPerMinute: 60 },
  'chat.update': { tier: 3, requestsPerMinute: 50 },
  'conversations.list': { tier: 2, requestsPerMinute: 20 },
  'conversations.info': { tier: 3, requestsPerMinute: 50 },
  'conversations.history': { tier: 3, requestsPerMinute: 50 },
  'users.list': { tier: 2, requestsPerMinute: 20 },
  'users.info': { tier: 4, requestsPerMinute: 100 },
  // Phase 18: auth family
  'auth.revoke': { tier: 1, requestsPerMinute: 20 },
  'auth.teams.list': { tier: 2, requestsPerMinute: 20 },
  // chat family additions
  'chat.delete': { tier: 3, requestsPerMinute: 50 },
  'chat.postEphemeral': { tier: 'special', requestsPerMinute: 100 },
  'chat.getPermalink': { tier: 3, requestsPerMinute: 50 },
  'chat.meMessage': { tier: 'special', requestsPerMinute: 100 },
  'chat.scheduleMessage': { tier: 'special', requestsPerMinute: 1 },
  'chat.scheduledMessages.list': { tier: 3, requestsPerMinute: 50 },
  'chat.deleteScheduledMessage': { tier: 3, requestsPerMinute: 50 },
  'chat.unfurl': { tier: 3, requestsPerMinute: 50 },
  'chat.startStream': { tier: 3, requestsPerMinute: 50 },
  'chat.appendStream': { tier: 3, requestsPerMinute: 50 },
  'chat.stopStream': { tier: 3, requestsPerMinute: 50 },
  // conversations family additions
  'conversations.create': { tier: 2, requestsPerMinute: 20 },
  'conversations.join': { tier: 2, requestsPerMinute: 20 },
  'conversations.leave': { tier: 2, requestsPerMinute: 20 },
  'conversations.archive': { tier: 2, requestsPerMinute: 20 },
  'conversations.unarchive': { tier: 2, requestsPerMinute: 20 },
  'conversations.rename': { tier: 2, requestsPerMinute: 20 },
  'conversations.invite': { tier: 3, requestsPerMinute: 50 },
  'conversations.kick': { tier: 3, requestsPerMinute: 50 },
  'conversations.open': { tier: 3, requestsPerMinute: 50 },
  'conversations.close': { tier: 3, requestsPerMinute: 50 },
  'conversations.mark': { tier: 3, requestsPerMinute: 50 },
  'conversations.setPurpose': { tier: 2, requestsPerMinute: 20 },
  'conversations.setTopic': { tier: 2, requestsPerMinute: 20 },
  'conversations.members': { tier: 4, requestsPerMinute: 100 },
  'conversations.replies': { tier: 3, requestsPerMinute: 50 },
  // users family additions
  'users.conversations': { tier: 3, requestsPerMinute: 50 },
  'users.getPresence': { tier: 3, requestsPerMinute: 50 },
  'users.lookupByEmail': { tier: 3, requestsPerMinute: 50 },
  'users.profile.get': { tier: 4, requestsPerMinute: 100 },
  'users.profile.set': { tier: 2, requestsPerMinute: 20 },
  'users.setPresence': { tier: 2, requestsPerMinute: 20 },
  'users.deletePhoto': { tier: 2, requestsPerMinute: 20 },
  'users.setPhoto': { tier: 2, requestsPerMinute: 20 },
  'users.identity': { tier: 3, requestsPerMinute: 50 },
  // reactions family
  'reactions.add': { tier: 3, requestsPerMinute: 50 },
  'reactions.get': { tier: 3, requestsPerMinute: 50 },
  'reactions.list': { tier: 2, requestsPerMinute: 20 },
  'reactions.remove': { tier: 3, requestsPerMinute: 50 },
  // pins family
  'pins.add': { tier: 2, requestsPerMinute: 20 },
  'pins.list': { tier: 2, requestsPerMinute: 20 },
  'pins.remove': { tier: 2, requestsPerMinute: 20 },
  // views family
  'views.open': { tier: 4, requestsPerMinute: 100 },
  'views.publish': { tier: 4, requestsPerMinute: 100 },
  'views.push': { tier: 4, requestsPerMinute: 100 },
  'views.update': { tier: 4, requestsPerMinute: 100 },
};

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class SlackRateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private tiers: Record<string, MethodRateConfig>;
  readonly enabled: boolean;

  constructor(tierOverrides?: Record<string, MethodRateConfig>, enabled = true) {
    this.tiers = { ...DEFAULT_RATE_TIERS, ...tierOverrides };
    this.enabled = enabled;
  }

  /**
   * Check if a request is rate-limited.
   * @returns null if allowed, { retryAfter: seconds } if limited
   */
  check(method: string, token: string): { retryAfter: number } | null {
    if (!this.enabled) return null;

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
