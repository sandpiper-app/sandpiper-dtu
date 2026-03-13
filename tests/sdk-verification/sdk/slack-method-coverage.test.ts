/**
 * SLCK-14: All bound WebClient methods return ok:true
 *
 * Wave 0 failing tests — these tests call one representative method from each
 * missing WebClient method family. They are expected to FAIL against the current
 * twin because the routes do not exist yet. Plans 02-04 will implement them.
 *
 * Missing families (from @slack/web-api@7.14.1 manifest analysis):
 *   admin.*       (~95 methods)
 *   workflows.*   (7 methods)
 *   canvases.*    (6 methods)
 *   openid.*      (2 methods)
 *   stars.*       (3 methods)
 *   slackLists.*  (13 methods)
 *   rtm.*         (2 methods)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('SLCK-14: All bound WebClient methods return ok:true', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  // -------------------------------------------------------------------------
  // admin.* family (~95 methods)
  // -------------------------------------------------------------------------

  it('admin.users.list returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(client.admin.users.list({ team_id: 'T_TWIN' })).resolves.toMatchObject({ ok: true });
  });

  it('admin.conversations.search returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(client.admin.conversations.search({})).resolves.toMatchObject({ ok: true });
  });

  it('admin.teams.list returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(client.admin.teams.list({})).resolves.toMatchObject({ ok: true });
  });

  it('admin.apps.approved.list returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(client.admin.apps.approved.list({})).resolves.toMatchObject({ ok: true });
  });

  it('admin.users.invite returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(
      client.admin.users.invite({ channel_ids: ['C_GENERAL'], email: 'test@example.com', team_id: 'T_TWIN' })
    ).resolves.toMatchObject({ ok: true });
  });

  it('admin.conversations.create returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(
      client.admin.conversations.create({ is_private: false, name: 'test-admin-chan', team_id: 'T_TWIN' })
    ).resolves.toMatchObject({ ok: true });
  });

  // -------------------------------------------------------------------------
  // workflows.* family
  // -------------------------------------------------------------------------

  it('workflows.stepCompleted returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(
      client.workflows.stepCompleted({ workflow_step_execute_id: 'WS_FAKE_123' })
    ).resolves.toMatchObject({ ok: true });
  });

  it('workflows.stepFailed returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(
      client.workflows.stepFailed({
        workflow_step_execute_id: 'WS_FAKE_123',
        error: { message: 'something went wrong' },
      })
    ).resolves.toMatchObject({ ok: true });
  });

  it('workflows.updateStep returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(
      client.workflows.updateStep({ workflow_step_edit_id: 'WE_FAKE_123' })
    ).resolves.toMatchObject({ ok: true });
  });

  // -------------------------------------------------------------------------
  // canvases.* family
  // -------------------------------------------------------------------------

  it('canvases.create returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(client.canvases.create({})).resolves.toMatchObject({ ok: true });
  });

  it('canvases.delete returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(client.canvases.delete({ canvas_id: 'F_FAKE_CANVAS' })).resolves.toMatchObject({ ok: true });
  });

  // -------------------------------------------------------------------------
  // openid.connect.* family
  // -------------------------------------------------------------------------

  it('openid.connect.token returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(
      client.openid.connect.token({
        code: 'oidc-fake-code',
        client_id: 'A_TWIN',
        client_secret: 'test-client-secret',
      })
    ).resolves.toMatchObject({ ok: true });
  });

  it('openid.connect.userInfo returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(client.openid.connect.userInfo()).resolves.toMatchObject({ ok: true });
  });

  // -------------------------------------------------------------------------
  // stars.* family
  // -------------------------------------------------------------------------

  it('stars.list returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(client.stars.list({})).resolves.toMatchObject({ ok: true });
  });

  it('stars.add returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(
      client.stars.add({ channel: 'C_GENERAL', timestamp: '1234567890.000001' })
    ).resolves.toMatchObject({ ok: true });
  });

  it('stars.remove returns ok:true', async () => {
    const client = createSlackClient(token);
    await expect(
      client.stars.remove({ channel: 'C_GENERAL', timestamp: '1234567890.000001' })
    ).resolves.toMatchObject({ ok: true });
  });
});
