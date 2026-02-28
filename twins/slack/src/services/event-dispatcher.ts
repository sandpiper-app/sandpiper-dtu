/**
 * EventDispatcher - Triggers Events API delivery via WebhookQueue
 *
 * When state mutations occur (e.g., chat.postMessage), the EventDispatcher
 * wraps the event data in Slack's event_callback envelope and enqueues it
 * for delivery to all subscribed apps via WebhookQueue.
 */

import { randomUUID } from 'node:crypto';
import type { WebhookQueue } from '@dtu/webhooks';
import type { SlackStateManager } from '../state/slack-state-manager.js';
import { generateSlackId } from './id-generator.js';

export interface EventDispatcherOptions {
  webhookQueue: WebhookQueue;
  slackStateManager: SlackStateManager;
  signingSecret: string;
}

export class EventDispatcher {
  private webhookQueue: WebhookQueue;
  private slackStateManager: SlackStateManager;
  private signingSecret: string;

  constructor(options: EventDispatcherOptions) {
    this.webhookQueue = options.webhookQueue;
    this.slackStateManager = options.slackStateManager;
    this.signingSecret = options.signingSecret;
  }

  /**
   * Dispatch an event to all subscribed apps.
   * Wraps event data in Slack's event_callback envelope and enqueues via WebhookQueue.
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

      await this.webhookQueue.enqueue({
        id: randomUUID(),
        topic: `slack:${eventType}`,
        callbackUrl: sub.request_url,
        payload: envelope,
        secret: this.signingSecret,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}
