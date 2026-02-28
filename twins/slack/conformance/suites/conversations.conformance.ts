/**
 * Conversations conformance suite
 *
 * Tests Slack Web API conversations methods:
 * - conversations.list   — list channels (GET and POST)
 * - conversations.info   — get channel details (GET and POST)
 * - conversations.history — get channel messages with pagination (GET and POST)
 * - Auth error handling  — missing token returns { ok: false, error: 'not_authed' }
 *
 * Runs against the twin (in-process via inject()) or a live Slack workspace.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { slackNormalizer } from '../normalizer.js';

/** Setup: post a message to C_GENERAL so history is non-empty */
const postMessageSetup = {
  name: 'post-message-for-history',
  description: 'Post a message to C_GENERAL so conversations.history is non-empty',
  method: 'POST' as const,
  path: '/api/chat.postMessage',
  body: { channel: 'C_GENERAL', text: 'Conformance test message' },
};

export const conversationsSuite: ConformanceSuite = {
  name: 'Slack Conversations',
  description: 'Validates conversations.list, conversations.info, and conversations.history against Slack Web API',
  normalizer: slackNormalizer,
  tests: [
    {
      id: 'conversations-list',
      name: 'POST conversations.list returns channels array',
      category: 'conversations',
      requirements: ['SLCK-01'],
      operation: {
        name: 'conversations.list-post',
        description: 'POST conversations.list with empty body → list channels',
        method: 'POST',
        path: '/api/conversations.list',
        body: {},
      },
    },

    {
      id: 'conversations-list-get',
      name: 'GET conversations.list returns same response as POST',
      category: 'conversations',
      requirements: ['SLCK-01'],
      operation: {
        name: 'conversations.list-get',
        description: 'GET conversations.list → list channels (real Slack accepts GET for read methods)',
        method: 'GET',
        path: '/api/conversations.list',
      },
    },

    {
      id: 'conversations-info',
      name: 'POST conversations.info returns channel details',
      category: 'conversations',
      requirements: ['SLCK-01'],
      operation: {
        name: 'conversations.info-post',
        description: 'POST conversations.info with { channel: C_GENERAL }',
        method: 'POST',
        path: '/api/conversations.info',
        body: { channel: 'C_GENERAL' },
      },
    },

    {
      id: 'conversations-info-get',
      name: 'GET conversations.info with query param returns channel details',
      category: 'conversations',
      requirements: ['SLCK-01'],
      operation: {
        name: 'conversations.info-get',
        description: 'GET conversations.info?channel=C_GENERAL',
        method: 'GET',
        path: '/api/conversations.info?channel=C_GENERAL',
      },
    },

    {
      id: 'conversations-history',
      name: 'POST conversations.history returns messages array',
      category: 'conversations',
      requirements: ['SLCK-01'],
      setup: [postMessageSetup],
      operation: {
        name: 'conversations.history-post',
        description: 'POST conversations.history with { channel: C_GENERAL } after posting a message',
        method: 'POST',
        path: '/api/conversations.history',
        body: { channel: 'C_GENERAL' },
      },
    },

    {
      id: 'conversations-history-pagination',
      name: 'conversations.history with limit=1 returns has_more=true and next_cursor',
      category: 'conversations',
      requirements: ['SLCK-01'],
      setup: [
        postMessageSetup,
        {
          name: 'post-second-message',
          description: 'Post a second message so there are 2+ messages for pagination',
          method: 'POST',
          path: '/api/chat.postMessage',
          body: { channel: 'C_GENERAL', text: 'Conformance test message 2' },
        },
      ],
      operation: {
        name: 'conversations.history-paginate',
        description: 'POST conversations.history with { channel, limit: 1 } → has_more=true, next_cursor present',
        method: 'POST',
        path: '/api/conversations.history',
        body: { channel: 'C_GENERAL', limit: 1 },
      },
    },

    {
      id: 'conversations-list-no-auth',
      name: 'conversations.list without auth returns { ok: false, error: not_authed }',
      category: 'conversations',
      requirements: ['SLCK-01'],
      operation: {
        name: 'conversations.list-no-auth',
        description: 'POST conversations.list without Authorization header → { ok: false, error: not_authed }',
        method: 'POST',
        path: '/api/conversations.list',
        // Override authorization to be empty — twin-adapter sends bearer by default,
        // so explicitly override with no auth header
        headers: { authorization: '' },
        body: {},
      },
    },
  ],
};

export default conversationsSuite;
