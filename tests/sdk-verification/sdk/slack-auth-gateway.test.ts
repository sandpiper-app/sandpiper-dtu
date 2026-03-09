import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('Slack auth gateway (SLCK-06.5)', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  describe('auth.test', () => {
    it('returns ok: true for a valid bot token', async () => {
      const client = createSlackClient(token);
      const result = await client.auth.test();
      expect(result.ok).toBe(true);
    });

    it('returns expected team and user identifiers', async () => {
      const client = createSlackClient(token);
      const result = await client.auth.test();
      expect(result.team_id).toBe('T_TWIN');
      expect(result.user_id).toBe('U_BOT_TWIN');
      expect(result.bot_id).toBe('B_BOT_TWIN');
      expect(result.is_enterprise_install).toBe(false);
    });
  });

  describe('api.test', () => {
    it('echoes args and returns ok: true', async () => {
      const client = createSlackClient(token);
      const result = await client.api.test({ foo: 'bar' });
      expect(result.ok).toBe(true);
      expect((result as any).args?.foo).toBe('bar');
    });

    it('returns ok: true with empty args when no params sent', async () => {
      const client = createSlackClient(token);
      const result = await client.api.test({});
      expect(result.ok).toBe(true);
      expect((result as any).args).toBeDefined();
    });
  });
});
