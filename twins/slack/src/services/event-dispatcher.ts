/**
 * EventDispatcher - Triggers Events API delivery via direct fetch()
 *
 * When state mutations occur (e.g., chat.postMessage), the EventDispatcher
 * wraps the event data in Slack's event_callback envelope and delivers it
 * directly to all subscribed apps using Slack HMAC signature headers.
 */

import { createHmac } from 'node:crypto';
import type { SlackStateManager } from '../state/slack-state-manager.js';
import { generateSlackId } from './id-generator.js';

export interface EventDispatcherOptions {
  slackStateManager: SlackStateManager;
  signingSecret: string;
}

export class EventDispatcher {
  private slackStateManager: SlackStateManager;
  private signingSecret: string;

  constructor(options: EventDispatcherOptions) {
    this.slackStateManager = options.slackStateManager;
    this.signingSecret = options.signingSecret;
  }

  /**
   * Dispatch an event to all subscribed apps.
   * Wraps event data in Slack's event_callback envelope and delivers via
   * direct fetch() with Slack HMAC signature headers (not WebhookQueue).
   */
  async dispatch(eventType: string, eventData: Record<string, unknown>): Promise<void> {
    const subscriptions = this.slackStateManager.listEventSubscriptions();
    if (subscriptions.length === 0) return;

    const eventId = generateSlackId('Ev');
    const eventTime = Math.floor(Date.now() / 1000);

    const envelope = {
      token: 'twin-verification-token',
      team_id: 'T_TWIN',
      api_app_id: 'A_TWIN',
      event: {
        type: eventType,
        ...eventData,
        event_ts: String(eventTime),
      },
      type: 'event_callback',
      event_id: eventId,
      event_time: eventTime,
      authorizations: [
        {
          enterprise_id: 'E0',
          team_id: 'T_TWIN',
          user_id: 'U_BOT_TWIN',
          is_bot: true,
        },
      ],
    };

    for (const sub of subscriptions) {
      // Check if this subscription is interested in this event type
      let eventTypes: string[];
      try {
        eventTypes = JSON.parse(sub.event_types);
      } catch {
        eventTypes = [sub.event_types];
      }

      if (!eventTypes.includes('*') && !eventTypes.includes(eventType)) {
        continue;
      }

      const bodyStr = JSON.stringify(envelope);
      const ts = Math.floor(Date.now() / 1000);
      const sig = `v0=${createHmac('sha256', this.signingSecret)
        .update(`v0:${ts}:${bodyStr}`)
        .digest('hex')}`;

      try {
        const response = await fetch(sub.request_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Slack-Signature': sig,
            'X-Slack-Request-Timestamp': String(ts),
          },
          body: bodyStr,
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          console.warn(`[EventDispatcher] delivery to ${sub.request_url} returned ${response.status}`);
        }
      } catch {
        // Network error — log and continue, individual delivery failure is non-fatal
        console.warn(`[EventDispatcher] delivery to ${sub.request_url} failed (network error)`);
      }
    }
  }
}
