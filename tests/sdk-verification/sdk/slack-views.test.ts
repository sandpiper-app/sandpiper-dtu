import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('Slack views family (SLCK-08)', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  const sampleView = {
    type: 'modal' as const,
    title: { type: 'plain_text' as const, text: 'My Modal' },
    blocks: [],
    callback_id: 'my_modal',
  };

  it('views.open returns ok:true and a view object', async () => {
    const client = createSlackClient(token);
    const result = await client.views.open({ trigger_id: 'TRIGGER_FAKE', view: sampleView });
    expect(result.ok).toBe(true);
    expect(result.view?.id).toBeDefined();
    expect(result.view?.type).toBe('modal');
  });

  it('views.publish returns ok:true with a home view', async () => {
    const client = createSlackClient(token);
    const homeView = { type: 'home' as const, blocks: [] };
    const result = await client.views.publish({ user_id: 'U_BOT_TWIN', view: homeView });
    expect(result.ok).toBe(true);
    expect(result.view?.type).toBe('home');
  });

  it('views.push returns ok:true and a view object', async () => {
    const client = createSlackClient(token);
    const result = await client.views.push({ trigger_id: 'TRIGGER_FAKE', view: sampleView });
    expect(result.ok).toBe(true);
    expect(result.view?.id).toBeDefined();
  });

  it('views.update returns ok:true and a view object', async () => {
    const client = createSlackClient(token);
    const result = await client.views.update({ view_id: 'V_FAKE', view: sampleView });
    expect(result.ok).toBe(true);
    expect(result.view?.id).toBeDefined();
  });
});
