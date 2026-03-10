/**
 * SLCK-10: Bolt App listener API tests
 *
 * Tests all 9 listener types (event, message, action, command, options,
 * shortcut, view, function, assistant) via app.processEvent() — no live
 * HTTP receiver required. The twin provides auth.test during App.init().
 *
 * Ack semantics:
 *   - event, message, assistant: auto-acked by Bolt middleware — handlers
 *     run without calling ack() themselves
 *   - action, command, options, shortcut, view, function: listener MUST
 *     call ack() explicitly
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { App, Assistant } from '@slack/bolt';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('Bolt App listener APIs (SLCK-10)', () => {
  let app: App;

  // Track whether each listener was invoked
  const called = {
    event: false,
    message: false,
    action: false,
    command: false,
    options: false,
    shortcut: false,
    view: false,
    function: false,
    assistant: false,
  };

  beforeAll(async () => {
    await resetSlack();
    const token = await seedSlackBotToken();

    app = new App({
      token,
      signingSecret: 'test-secret-slck10',
      signatureVerification: false,
      deferInitialization: true,
      clientOptions: {
        slackApiUrl: process.env.SLACK_API_URL! + '/api/',
      },
    });

    // Register all listeners before init so they're attached when processing begins
    app.event('app_mention', async ({ event }) => {
      expect(event.type).toBe('app_mention');
      called.event = true;
    });

    app.message('hello world', async ({ message }) => {
      expect((message as any).text).toBe('hello world');
      called.message = true;
    });

    app.action('my_button', async ({ action, ack }) => {
      await ack();
      expect((action as any).action_id).toBe('my_button');
      called.action = true;
    });

    app.command('/test', async ({ command, ack }) => {
      await ack();
      expect(command.command).toBe('/test');
      called.command = true;
    });

    app.options('my_options', async ({ options, ack }) => {
      await ack({ options: [] });
      expect((options as any).action_id).toBe('my_options');
      called.options = true;
    });

    app.shortcut('my_shortcut', async ({ shortcut, ack }) => {
      await ack();
      expect(shortcut.callback_id).toBe('my_shortcut');
      called.shortcut = true;
    });

    app.view('my_modal', async ({ view, ack }) => {
      await ack();
      expect(view.callback_id).toBe('my_modal');
      called.view = true;
    });

    app.function('my_function', async ({ complete }) => {
      await complete({ outputs: {} });
      called.function = true;
    });

    const assistant = new Assistant({
      threadStarted: async ({ setSuggestedPrompts, setTitle }) => {
        await setTitle('Test Title');
        await setSuggestedPrompts({ prompts: [] });
        called.assistant = true;
      },
      userMessage: async ({ say }) => {
        await say('hello');
      },
    });
    app.assistant(assistant);

    await app.init();
  });

  it('event listener fires for app_mention event_callback payload', async () => {
    await app.processEvent({
      body: {
        type: 'event_callback',
        team_id: 'T_TWIN',
        api_app_id: 'A_TWIN',
        event: {
          type: 'app_mention',
          text: 'hello',
          user: 'U_TEST',
          ts: '123.456',
          channel: 'C_GENERAL',
        },
        authorizations: [
          {
            enterprise_id: null,
            team_id: 'T_TWIN',
            user_id: 'U_BOT_TWIN',
            is_bot: true,
            is_enterprise_install: false,
          },
        ],
      },
      ack: async () => {},
    });
    expect(called.event).toBe(true);
  });

  it('message listener fires for event_callback with event.type message', async () => {
    await app.processEvent({
      body: {
        type: 'event_callback',
        team_id: 'T_TWIN',
        api_app_id: 'A_TWIN',
        event: {
          type: 'message',
          text: 'hello world',
          user: 'U_TEST',
          ts: '123.457',
          channel: 'C_GENERAL',
        },
        authorizations: [
          {
            enterprise_id: null,
            team_id: 'T_TWIN',
            user_id: 'U_BOT_TWIN',
            is_bot: true,
            is_enterprise_install: false,
          },
        ],
      },
      ack: async () => {},
    });
    expect(called.message).toBe(true);
  });

  it('action listener fires and acks for block_actions payload', async () => {
    await app.processEvent({
      body: {
        type: 'block_actions',
        team: { id: 'T_TWIN', domain: 'twin' },
        user: { id: 'U_TEST', team_id: 'T_TWIN', username: 'testuser' },
        actions: [
          {
            action_id: 'my_button',
            block_id: 'my_block',
            type: 'button',
            value: 'click',
            action_ts: '123.456',
          },
        ],
        token: 'gIkuvaNzQIHg97ATvDxqgjtO',
        trigger_id: 'trigger_id_value',
        api_app_id: 'A_TWIN',
        authorizations: [
          {
            enterprise_id: null,
            team_id: 'T_TWIN',
            user_id: 'U_BOT_TWIN',
            is_bot: true,
            is_enterprise_install: false,
          },
        ],
      },
      ack: async () => {},
    });
    expect(called.action).toBe(true);
  });

  it('command listener fires and acks for slash command payload', async () => {
    await app.processEvent({
      body: {
        command: '/test',
        team_id: 'T_TWIN',
        user_id: 'U_TEST',
        channel_id: 'C_GENERAL',
        text: 'arg1',
        token: 'gIkuvaNzQIHg97ATvDxqgjtO',
        trigger_id: 'trigger_id_value',
        api_app_id: 'A_TWIN',
      },
      ack: async () => {},
    });
    expect(called.command).toBe(true);
  });

  it('options listener fires and acks for block_suggestion payload', async () => {
    await app.processEvent({
      body: {
        type: 'block_suggestion',
        team: { id: 'T_TWIN', domain: 'twin' },
        user: { id: 'U_TEST', team_id: 'T_TWIN', username: 'testuser' },
        action_id: 'my_options',
        block_id: 'my_block',
        value: 'search',
        token: 'gIkuvaNzQIHg97ATvDxqgjtO',
        api_app_id: 'A_TWIN',
      },
      ack: async () => {},
    });
    expect(called.options).toBe(true);
  });

  it('shortcut listener fires and acks for shortcut payload', async () => {
    await app.processEvent({
      body: {
        type: 'shortcut',
        team: { id: 'T_TWIN', domain: 'twin' },
        user: { id: 'U_TEST', team_id: 'T_TWIN', username: 'testuser' },
        callback_id: 'my_shortcut',
        trigger_id: 'trigger_id_value',
        token: 'gIkuvaNzQIHg97ATvDxqgjtO',
        action_ts: '123.456',
        is_enterprise_install: false,
      },
      ack: async () => {},
    });
    expect(called.shortcut).toBe(true);
  });

  it('view listener fires and acks for view_submission payload', async () => {
    await app.processEvent({
      body: {
        type: 'view_submission',
        team: { id: 'T_TWIN', domain: 'twin' },
        user: { id: 'U_TEST', team_id: 'T_TWIN', username: 'testuser' },
        view: {
          callback_id: 'my_modal',
          type: 'modal',
          id: 'V_TEST',
          title: { type: 'plain_text', text: 'Test Modal' },
          submit: { type: 'plain_text', text: 'Submit' },
          state: { values: {} },
          hash: 'abc123',
          app_id: 'A_TWIN',
          bot_id: 'B_BOT_TWIN',
          team_id: 'T_TWIN',
          app_installed_team_id: 'T_TWIN',
          blocks: [],
        },
        token: 'gIkuvaNzQIHg97ATvDxqgjtO',
        trigger_id: 'trigger_id_value',
        api_app_id: 'A_TWIN',
        is_enterprise_install: false,
        enterprise: null,
        authorizations: [
          {
            enterprise_id: null,
            team_id: 'T_TWIN',
            user_id: 'U_BOT_TWIN',
            is_bot: true,
            is_enterprise_install: false,
          },
        ],
      },
      ack: async () => {},
    });
    expect(called.view).toBe(true);
  });

  it('function listener fires and completes for function_executed event_callback', async () => {
    await app.processEvent({
      body: {
        type: 'event_callback',
        team_id: 'T_TWIN',
        api_app_id: 'A_TWIN',
        event: {
          type: 'function_executed',
          function_execution_id: 'Fx_TEST',
          function: {
            callback_id: 'my_function',
            title: 'My Function',
            description: 'A test function',
            type: 'app',
            input_parameters: [],
            output_parameters: [],
            app_id: 'A_TWIN',
            date_updated: 0,
          },
          inputs: { param1: 'value1' },
          bot_access_token: 'xoxb-test-token',
          event_ts: '123.456',
        },
        authorizations: [
          {
            enterprise_id: null,
            team_id: 'T_TWIN',
            user_id: 'U_BOT_TWIN',
            is_bot: true,
            is_enterprise_install: false,
          },
        ],
      },
      ack: async () => {},
    });
    expect(called.function).toBe(true);
  });

  it('assistant middleware routes assistant_thread_started events', async () => {
    await app.processEvent({
      body: {
        type: 'event_callback',
        team_id: 'T_TWIN',
        api_app_id: 'A_TWIN',
        event: {
          type: 'assistant_thread_started',
          assistant_thread: {
            channel_id: 'C_GENERAL',
            thread_ts: '123.456',
            context: {},
          },
          event_ts: '123.456',
        },
        authorizations: [
          {
            enterprise_id: null,
            team_id: 'T_TWIN',
            user_id: 'U_BOT_TWIN',
            is_bot: true,
            is_enterprise_install: false,
          },
        ],
      },
      ack: async () => {},
    });
    expect(called.assistant).toBe(true);
  });
});
