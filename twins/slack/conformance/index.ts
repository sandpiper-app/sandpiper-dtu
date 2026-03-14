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
 * Runs all conversations, chat, users, and oauth tests in sequence.
 */
export const slackConformanceSuite: ConformanceSuite = {
  name: 'Slack Full',
  description:
    'Slack conformance subset covering conversations, chat, users, and OAuth',
  normalizer: slackNormalizer,
  tests: [
    ...conversationsSuite.tests,
    ...chatSuite.tests,
    ...usersSuite.tests,
    ...oauthSuite.tests,
  ],
};

export default slackConformanceSuite;
