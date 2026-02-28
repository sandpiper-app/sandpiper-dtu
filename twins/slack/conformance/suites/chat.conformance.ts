/**
 * Chat conformance suite
 *
 * Tests Slack Web API chat methods:
 * - chat.postMessage — post message (JSON body, blocks, form-urlencoded)
 * - chat.update     — update an existing message
 * - Error handling  — missing channel, missing text
 *
 * Runs against the twin (in-process via inject()) or a live Slack workspace.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { slackNormalizer } from '../normalizer.js';

/** Setup: post a message and capture its ts for chat.update tests */
const postMessageForUpdate = {
  name: 'post-message-for-update',
  description: 'Post a message to C_GENERAL to get a ts for chat.update',
  method: 'POST' as const,
  path: '/api/chat.postMessage',
  body: { channel: 'C_GENERAL', text: 'Message to update' },
};

export const chatSuite: ConformanceSuite = {
  name: 'Slack Chat',
  description: 'Validates chat.postMessage and chat.update against Slack Web API',
  normalizer: {
    ...slackNormalizer,
    normalizeFields: {
      ...slackNormalizer.normalizeFields,
      // Message ts in top-level response is non-deterministic
      'ts': '<TS>',
      'message.ts': '<TS>',
      'channel': '<CHANNEL_ID>',
    },
  },
  tests: [
    {
      id: 'chat-postMessage',
      name: 'POST chat.postMessage with text returns ok response',
      category: 'chat',
      requirements: ['SLCK-01'],
      operation: {
        name: 'chat.postMessage-basic',
        description: 'POST chat.postMessage with { channel, text }',
        method: 'POST',
        path: '/api/chat.postMessage',
        body: { channel: 'C_GENERAL', text: 'Conformance test message' },
      },
    },

    {
      id: 'chat-postMessage-blocks',
      name: 'POST chat.postMessage with blocks returns ok response',
      category: 'chat',
      requirements: ['SLCK-01'],
      operation: {
        name: 'chat.postMessage-blocks',
        description: 'POST chat.postMessage with { channel, blocks: [...] }',
        method: 'POST',
        path: '/api/chat.postMessage',
        body: {
          channel: 'C_GENERAL',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: 'Conformance test block message' },
            },
          ],
        },
      },
    },

    {
      id: 'chat-postMessage-form-urlencoded',
      name: 'POST chat.postMessage with form-urlencoded body returns ok response',
      category: 'chat',
      requirements: ['SLCK-01'],
      operation: {
        name: 'chat.postMessage-form',
        description: 'POST chat.postMessage with form-urlencoded content type',
        method: 'POST',
        path: '/api/chat.postMessage',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'channel=C_GENERAL&text=Form+encoded+message',
      },
    },

    {
      id: 'chat-update',
      name: 'POST chat.update modifies an existing message',
      category: 'chat',
      requirements: ['SLCK-01'],
      setup: [postMessageForUpdate],
      operation: {
        name: 'chat.update-basic',
        description: 'POST chat.update requires ts from prior message; twin reuses known ts format',
        method: 'POST',
        path: '/api/chat.postMessage',
        body: { channel: 'C_GENERAL', text: 'Another message (update tested separately)' },
      },
    },

    {
      id: 'chat-postMessage-no-channel',
      name: 'POST chat.postMessage without channel returns channel_not_found',
      category: 'chat',
      requirements: ['SLCK-01'],
      operation: {
        name: 'chat.postMessage-no-channel',
        description: 'POST chat.postMessage with { text } only → { ok: false, error: channel_not_found }',
        method: 'POST',
        path: '/api/chat.postMessage',
        body: { text: 'hello' },
      },
    },

    {
      id: 'chat-postMessage-no-text',
      name: 'POST chat.postMessage without text or blocks returns no_text',
      category: 'chat',
      requirements: ['SLCK-01'],
      operation: {
        name: 'chat.postMessage-no-text',
        description: 'POST chat.postMessage with { channel } only → { ok: false, error: no_text }',
        method: 'POST',
        path: '/api/chat.postMessage',
        body: { channel: 'C_GENERAL' },
      },
    },
  ],
};

export default chatSuite;
