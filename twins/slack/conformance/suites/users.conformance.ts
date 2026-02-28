/**
 * Users conformance suite
 *
 * Tests Slack Web API users methods:
 * - users.list — list workspace members (GET and POST)
 * - users.info — get user details (GET and POST)
 * - Error handling — user not found
 *
 * Runs against the twin (in-process via inject()) or a live Slack workspace.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { slackNormalizer } from '../normalizer.js';

export const usersSuite: ConformanceSuite = {
  name: 'Slack Users',
  description: 'Validates users.list and users.info against Slack Web API',
  normalizer: slackNormalizer,
  tests: [
    {
      id: 'users-list',
      name: 'POST users.list returns members array with U_BOT_TWIN',
      category: 'users',
      requirements: ['SLCK-01'],
      operation: {
        name: 'users.list-post',
        description: 'POST users.list → members array with at least U_BOT_TWIN seeded user',
        method: 'POST',
        path: '/api/users.list',
        body: {},
      },
    },

    {
      id: 'users-list-get',
      name: 'GET users.list returns same response as POST',
      category: 'users',
      requirements: ['SLCK-01'],
      operation: {
        name: 'users.list-get',
        description: 'GET users.list → same response (real Slack accepts GET for read methods)',
        method: 'GET',
        path: '/api/users.list',
      },
    },

    {
      id: 'users-info',
      name: 'POST users.info returns user details for U_BOT_TWIN',
      category: 'users',
      requirements: ['SLCK-01'],
      operation: {
        name: 'users.info-post',
        description: 'POST users.info with { user: U_BOT_TWIN }',
        method: 'POST',
        path: '/api/users.info',
        body: { user: 'U_BOT_TWIN' },
      },
    },

    {
      id: 'users-info-get',
      name: 'GET users.info with query param returns user details',
      category: 'users',
      requirements: ['SLCK-01'],
      operation: {
        name: 'users.info-get',
        description: 'GET users.info?user=U_BOT_TWIN',
        method: 'GET',
        path: '/api/users.info?user=U_BOT_TWIN',
      },
    },

    {
      id: 'users-info-not-found',
      name: 'POST users.info with unknown user returns user_not_found',
      category: 'users',
      requirements: ['SLCK-01'],
      operation: {
        name: 'users.info-not-found',
        description: 'POST users.info with { user: NONEXISTENT } → { ok: false, error: user_not_found }',
        method: 'POST',
        path: '/api/users.info',
        body: { user: 'NONEXISTENT' },
      },
    },
  ],
};

export default usersSuite;
