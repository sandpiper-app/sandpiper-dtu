/**
 * Slack-specific field normalizer configuration
 *
 * Strips non-deterministic fields (timestamps, tokens, IDs) before
 * comparing Slack twin responses against live API responses.
 */

import type { FieldNormalizerConfig } from '@dtu/conformance';

export const slackNormalizer: FieldNormalizerConfig = {
  stripFields: [
    'created',           // Channel creation timestamp
    'updated',           // User/channel update timestamp
    'ts',                // Message timestamp (unique per message)
    'event_ts',          // Event timestamp
    'channel.num_members',   // Not returned by default in real Slack API
    'channels.*.num_members', // Not returned by default in real Slack API
  ],
  normalizeFields: {
    'channels.*.id': '<CHANNEL_ID>',
    'channel.id': '<CHANNEL_ID>',
    'members.*.id': '<USER_ID>',
    'user.id': '<USER_ID>',
    'messages.*.ts': '<TS>',
    'messages.*.user': '<USER_ID>',
    'response_metadata.next_cursor': '<CURSOR>',
    'access_token': '<TOKEN>',
    'authed_user.access_token': '<TOKEN>',
    'bot_user_id': '<BOT_USER_ID>',
  },
  // `ok` and `error` are deterministic on Slack API error responses — the
  // twin and live API must agree on both values exactly.  Success-path `ts`
  // and ID fields remain non-deterministic and are excluded here.
  compareValueFields: ['ok', 'error'],
};
