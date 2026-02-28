/**
 * OAuth conformance suite
 *
 * Tests Slack OAuth v2 token exchange:
 * - oauth.v2.access — exchange code for tokens (form-urlencoded)
 * - Response shape  — verify all required fields present
 * - Error handling  — missing code returns invalid_code
 *
 * Runs against the twin (in-process via inject()) or a live Slack workspace.
 *
 * Note: OAuth tests do NOT use the bot token injected by the adapter
 * (oauth.v2.access is an unauthenticated endpoint). The adapter's bearer
 * header is overridden to empty for these tests.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { slackNormalizer } from '../normalizer.js';

export const oauthSuite: ConformanceSuite = {
  name: 'Slack OAuth',
  description: 'Validates oauth.v2.access token exchange against Slack Web API',
  normalizer: {
    ...slackNormalizer,
    normalizeFields: {
      ...slackNormalizer.normalizeFields,
      // OAuth response tokens are always non-deterministic
      'access_token': '<TOKEN>',
      'authed_user.access_token': '<TOKEN>',
      'bot_user_id': '<BOT_USER_ID>',
      'team.id': '<TEAM_ID>',
      'authed_user.id': '<USER_ID>',
    },
  },
  tests: [
    {
      id: 'oauth-access-form',
      name: 'POST oauth.v2.access with form-urlencoded code returns ok response',
      category: 'oauth',
      requirements: ['SLCK-03'],
      operation: {
        name: 'oauth.v2.access-form',
        description: 'POST oauth.v2.access with form-urlencoded body (code=xxx) → token exchange',
        method: 'POST',
        path: '/api/oauth.v2.access',
        headers: {
          // OAuth endpoint does not require bearer token
          authorization: '',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'code=conformance-oauth-test-code',
      },
    },

    {
      id: 'oauth-access-response-shape',
      name: 'oauth.v2.access response has required shape: ok, access_token, token_type, scope, bot_user_id, app_id, team, authed_user',
      category: 'oauth',
      requirements: ['SLCK-03'],
      operation: {
        name: 'oauth.v2.access-shape',
        description: 'POST oauth.v2.access → verify response has all required Slack OAuth v2 fields',
        method: 'POST',
        path: '/api/oauth.v2.access',
        headers: {
          authorization: '',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'code=conformance-shape-test-code',
      },
    },

    {
      id: 'oauth-access-no-code',
      name: 'POST oauth.v2.access without code returns invalid_code error',
      category: 'oauth',
      requirements: ['SLCK-03'],
      operation: {
        name: 'oauth.v2.access-no-code',
        description: 'POST oauth.v2.access with empty body → { ok: false, error: invalid_code }',
        method: 'POST',
        path: '/api/oauth.v2.access',
        headers: {
          authorization: '',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: '',
      },
    },
  ],
};

export default oauthSuite;
