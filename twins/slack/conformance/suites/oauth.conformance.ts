/**
 * OAuth conformance suite
 *
 * Tests Slack OAuth v2 error handling — both twin and live APIs should
 * reject invalid/missing codes with the same error format.
 *
 * Success-path OAuth tests are not feasible in live mode (can't generate
 * real Slack authorization codes in CI), so these tests focus on error
 * behavior which is verifiable against both twin and live.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { slackNormalizer } from '../normalizer.js';

export const oauthSuite: ConformanceSuite = {
  name: 'Slack OAuth',
  description: 'Validates oauth.v2.access error handling against Slack Web API',
  normalizer: slackNormalizer,
  tests: [
    {
      id: 'oauth-access-invalid-code',
      name: 'POST oauth.v2.access with invalid code returns invalid_code error',
      category: 'oauth',
      requirements: ['SLCK-03'],
      // Deterministic error response — both ok and error values are fixed;
      // exact mode proves the twin returns the same error string, not just the same shape.
      comparisonMode: 'exact',
      operation: {
        name: 'oauth.v2.access-invalid',
        description: 'POST oauth.v2.access with a fake code → { ok: false, error: invalid_code }',
        method: 'POST',
        path: '/api/oauth.v2.access',
        headers: {
          authorization: '',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'code=invalid-conformance-test-code',
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
