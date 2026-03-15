/**
 * Slack conformance suite index
 *
 * Exports all suites and adapters for CLI consumption.
 * Individual suites can be run separately or combined into a full suite.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { slackNormalizer } from './normalizer.js';
import { conversationsSuite } from './suites/conversations.conformance.js';
import { chatSuite } from './suites/chat.conformance.js';
import { usersSuite } from './suites/users.conformance.js';
import { oauthSuite } from './suites/oauth.conformance.js';

// Re-export individual suites
export { conversationsSuite } from './suites/conversations.conformance.js';
export { chatSuite } from './suites/chat.conformance.js';
export { usersSuite } from './suites/users.conformance.js';
export { oauthSuite } from './suites/oauth.conformance.js';

// Re-export adapters
export { SlackTwinAdapter } from './adapters/twin-adapter.js';
export { SlackLiveAdapter } from './adapters/live-adapter.js';

// Re-export normalizer
export { slackNormalizer } from './normalizer.js';

/**
 * Full Slack conformance suite combining all individual suites.
 *
 * Proof scope:
 * - Twin mode (pnpm conformance:twin): structural smoke — confirms the twin responds
 *   with the correct shape and status codes. Tests marked comparisonMode: 'exact' also
 *   value-compare deterministic fields (ok, error) and declared compareHeaders
 *   (x-oauth-scopes, x-accepted-oauth-scopes). This is NOT full 1:1 live-API parity.
 * - Live mode: structural comparison against real Slack API responses.
 */
export const slackConformanceSuite: ConformanceSuite = {
  name: 'Slack Full',
  description:
    'Slack conformance structural smoke: response shape, status codes, and deterministic value seams (ok, error, oauth scope headers). Not full 1:1 live-API parity.',
  normalizer: slackNormalizer,
  tests: [
    ...conversationsSuite.tests,
    ...chatSuite.tests,
    ...usersSuite.tests,
    ...oauthSuite.tests,
  ],
};

export default slackConformanceSuite;
