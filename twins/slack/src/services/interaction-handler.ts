/**
 * InteractionHandler - Generates block_actions payloads and manages response URLs
 *
 * When an admin triggers an interaction (button click simulation), this handler
 * builds a proper block_actions payload and manages response URL lifecycle
 * (usable 5 times within 30 minutes).
 */

import { randomUUID } from 'node:crypto';
import type { SlackStateManager } from '../state/slack-state-manager.js';
import { generateMessageTs } from './id-generator.js';

interface ResponseUrlEntry {
  channelId: string;
  messageTs: string;
  usesRemaining: number;
  expiresAt: number;
}

export interface InteractionHandlerOptions {
  slackStateManager: SlackStateManager;
  signingSecret: string;
  baseUrl?: string;
}

export class InteractionHandler {
  private slackStateManager: SlackStateManager;
  private signingSecret: string;
  private baseUrl: string;
  private responseUrls: Map<string, ResponseUrlEntry> = new Map();

  constructor(options: InteractionHandlerOptions) {
    this.slackStateManager = options.slackStateManager;
    this.signingSecret = options.signingSecret;
    this.baseUrl = options.baseUrl ?? 'http://localhost:3001';
  }

  /**
   * Generate a block_actions interaction payload for a button click.
   * Returns the payload and a functional response URL.
   */
  generateInteractionPayload(opts: {
    messageTs: string;
    channelId: string;
    actionId: string;
    userId: string;
    blockId?: string;
  }): { payload: any; responseUrl: string } {
    const message = this.slackStateManager.getMessage(opts.messageTs);
    const channel = this.slackStateManager.getChannel(opts.channelId);
    const user = this.slackStateManager.getUser(opts.userId);

    // Generate response URL ID and store entry
    const responseUrlId = randomUUID();
    this.responseUrls.set(responseUrlId, {
      channelId: opts.channelId,
      messageTs: opts.messageTs,
      usesRemaining: 5,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
    });

    const responseUrl = `${this.baseUrl}/response-url/${responseUrlId}`;

    // Build block_actions payload matching Slack's format
    const payload = {
      type: 'block_actions',
      trigger_id: `${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
      user: {
        id: opts.userId,
        username: user?.name ?? 'unknown',
        name: user?.real_name ?? 'Unknown',
      },
      team: { id: 'T_TWIN', domain: 'twin-workspace' },
      api_app_id: 'A_TWIN',
      token: 'twin-verification-token',
      container: {
        type: 'message',
        message_ts: opts.messageTs,
        channel_id: opts.channelId,
      },
      channel: {
        id: opts.channelId,
        name: channel?.name ?? 'unknown',
      },
      message: message
        ? {
            type: 'message',
            ts: message.ts,
            text: message.text ?? '',
            user: message.user_id,
            blocks: message.blocks ? JSON.parse(message.blocks) : undefined,
          }
        : undefined,
      actions: [
        {
          type: 'button',
          block_id: opts.blockId ?? 'actions_block',
          action_id: opts.actionId,
          text: { type: 'plain_text', text: opts.actionId },
          value: opts.actionId,
          action_ts: String(Date.now() / 1000),
        },
      ],
      response_url: responseUrl,
    };

    return { payload, responseUrl };
  }

  /**
   * Handle a response URL call — post follow-up message to original channel.
   * Response URLs are usable 5 times within 30 minutes.
   */
  handleResponseUrl(responseUrlId: string, body: any): { ok: boolean; error?: string } {
    const entry = this.responseUrls.get(responseUrlId);
    if (!entry) {
      return { ok: false, error: 'expired_url' };
    }

    // Check expiry
    if (Date.now() > entry.expiresAt) {
      this.responseUrls.delete(responseUrlId);
      return { ok: false, error: 'expired_url' };
    }

    // Check uses remaining
    if (entry.usesRemaining <= 0) {
      this.responseUrls.delete(responseUrlId);
      return { ok: false, error: 'expired_url' };
    }

    // Decrement uses
    entry.usesRemaining--;

    // Post the body content as a message in the original channel
    const ts = generateMessageTs();
    this.slackStateManager.createMessage({
      channel_id: entry.channelId,
      user_id: 'U_BOT_TWIN',
      text: body.text ?? '',
      blocks: body.blocks ? JSON.stringify(body.blocks) : undefined,
      ts,
    });

    return { ok: true };
  }
}
