/**
 * Slack-style ID generation
 *
 * Generates IDs matching Slack's format:
 * - Team IDs: T + 9 alphanumeric chars (e.g., T9TK3CUKW0)
 * - Channel IDs: C + 9 chars (e.g., C012AB3CD45)
 * - User IDs: U + 9 chars (e.g., U123ABC456)
 * - App IDs: A + 9 chars (e.g., A0KRD7HC3X)
 * - Message timestamps: epoch.sequence (e.g., 1503435956.000247)
 */

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Generate a Slack-style prefixed ID */
export function generateSlackId(prefix: string): string {
  let id = prefix;
  for (let i = 0; i < 9; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}

/** Module-level counter for unique message timestamps within the same second */
let messageCounter = 0;

/** Generate a Slack message timestamp in epoch.sequence format */
export function generateMessageTs(): string {
  const epoch = Math.floor(Date.now() / 1000);
  messageCounter++;
  return `${epoch}.${String(messageCounter).padStart(6, '0')}`;
}

/** Reset message counter (for testing) */
export function resetMessageCounter(): void {
  messageCounter = 0;
}

// Convenience functions
export function generateTeamId(): string {
  return generateSlackId('T');
}

export function generateChannelId(): string {
  return generateSlackId('C');
}

export function generateUserId(): string {
  return generateSlackId('U');
}

export function generateAppId(): string {
  return generateSlackId('A');
}
