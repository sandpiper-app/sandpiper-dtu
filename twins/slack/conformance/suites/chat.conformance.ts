/**
 * Chat conformance suite
 *
 * Tests Slack Web API chat methods:
 * - chat.postMessage — post message (JSON body, blocks, form-urlencoded, second message)
 * - Error handling  — missing channel, missing text
 *
 * Runs against the twin (in-process via inject()) or a live Slack workspace.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { slackNormalizer } from '../normalizer.js';

export const chatSuite: ConformanceSuite = {
  name: 'Slack Chat',
  description: 'Validates chat.postMessage (and error cases) against Slack Web API',
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
      id: 'chat-postMessage-second',
      name: 'POST chat.postMessage (second message in channel)',
      category: 'chat',
      requirements: ['SLCK-01'],
      operation: {
        name: 'chat.postMessage-second',
        description: 'POST chat.postMessage with text to C_GENERAL — second message in channel',
        method: 'POST',
        path: '/api/chat.postMessage',
        body: { channel: 'C_GENERAL', text: 'Another message in channel' },
      },
    },

    {
      id: 'chat-postMessage-no-channel',
      name: 'POST chat.postMessage without channel returns channel_not_found',
      category: 'chat',
      requirements: ['SLCK-01'],
      // Deterministic error response — both ok and error values are fixed;
      // exact mode proves the twin returns the same error string, not just the same shape.
      comparisonMode: 'exact',
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
