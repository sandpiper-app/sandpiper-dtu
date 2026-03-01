/**
 * UI plugin for Slack twin
 * Serves web UI at /ui for inspecting and manipulating Slack twin state.
 * Uses shared @dtu/ui partials for consistent styling.
 *
 * Key differentiator from Shopify twin: channel detail shows a message
 * timeline with an inline "Post Message" form — matching the Slack UX metaphor.
 */

/// <reference types="@fastify/view" />
import type { FastifyPluginAsync } from 'fastify';
import { registerUI, formatDate, formatJson } from '@dtu/ui';
import {
  generateChannelId,
  generateUserId,
  generateMessageTs,
} from '../services/id-generator.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const navItems = [
  { label: 'Channels', href: '/ui/channels' },
  { label: 'Users', href: '/ui/users' },
];

const adminItems = [
  { label: 'Admin', href: '/ui/admin' },
  { label: 'Events', href: '/ui/admin/events' },
];

function pageData(nav: string, pageTitle: string, extra: Record<string, any> = {}) {
  return {
    twin: 'slack',
    twinName: 'Slack',
    navItems,
    adminItems,
    nav,
    pageTitle,
    formatDate,
    formatJson,
    ...extra,
  };
}

const uiPlugin: FastifyPluginAsync = async (fastify) => {
  await registerUI(fastify, {
    viewsDir: path.join(__dirname, '../views'),
    twin: 'slack',
  });

  // Root redirect
  fastify.get('/ui', async (_req, reply) => {
    return reply.redirect('/ui/channels');
  });

  // ========================
  // CHANNELS
  // ========================

  // IMPORTANT: Register /new BEFORE /:id to avoid route conflicts
  fastify.get('/ui/channels/new', async (_req, reply) => {
    return reply.viewAsync('channels/form.eta', pageData('channels', 'New Channel', {
      formTitle: 'New Channel',
      action: '/ui/channels',
      submitLabel: 'Create Channel',
      cancelHref: '/ui/channels',
      fields: [
        { name: 'name', label: 'Channel Name', type: 'text', required: true, placeholder: 'e.g. general' },
        { name: 'is_private', label: 'Private Channel', type: 'checkbox' },
        { name: 'topic', label: 'Topic', type: 'text', placeholder: 'What this channel is about' },
        { name: 'purpose', label: 'Purpose', type: 'text', placeholder: 'The broader purpose' },
      ],
    }));
  });

  fastify.get('/ui/channels', async (_req, reply) => {
    const channels = fastify.slackStateManager.listChannels();
    return reply.viewAsync('channels/list.eta', pageData('channels', 'Channels', {
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'is_private', label: 'Private' },
        { key: 'topic', label: 'Topic' },
        { key: 'num_members', label: 'Members' },
      ],
      rows: channels,
      basePath: '/ui/channels',
      idKey: 'id',
      createHref: '/ui/channels/new',
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/channels/:id/edit', async (req, reply) => {
    const channel = fastify.slackStateManager.getChannel(req.params.id);
    if (!channel) return reply.status(404).send('Channel not found');
    return reply.viewAsync('channels/form.eta', pageData('channels', 'Edit Channel', {
      formTitle: `Edit #${channel.name}`,
      action: `/ui/channels/${channel.id}`,
      submitLabel: 'Update Channel',
      cancelHref: `/ui/channels/${channel.id}`,
      fields: [
        { name: 'name', label: 'Channel Name', type: 'text', value: channel.name, required: true },
        { name: 'topic', label: 'Topic', type: 'text', value: channel.topic },
        { name: 'purpose', label: 'Purpose', type: 'text', value: channel.purpose },
      ],
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/channels/:id', async (req, reply) => {
    const channel = fastify.slackStateManager.getChannel(req.params.id);
    if (!channel) return reply.status(404).send('Channel not found');

    // Fetch messages in chronological order (API returns DESC, we want ASC for timeline)
    const messagesDesc = fastify.slackStateManager.listMessages(req.params.id, { limit: 100 });
    const messages = messagesDesc.slice().reverse(); // chronological order

    // Build user name lookup map
    const users = fastify.slackStateManager.listUsers();
    const userNames: Record<string, string> = {};
    for (const user of users) {
      userNames[user.id] = user.name;
    }

    return reply.viewAsync('channels/detail.eta', pageData('channels', `#${channel.name}`, {
      channel,
      messages,
      userNames,
      users,
      rawJson: formatJson(channel),
    }));
  });

  fastify.post('/ui/channels', async (req, reply) => {
    const data = req.body as Record<string, string>;
    const id = generateChannelId();
    fastify.slackStateManager.createChannel({
      id,
      name: data.name,
      is_private: data.is_private === 'on' || data.is_private === 'true',
      topic: data.topic || '',
      purpose: data.purpose || '',
      creator: 'U_BOT_TWIN',
    });

    // Dispatch channel_created event if subscriptions exist
    fastify.eventDispatcher.dispatch('channel_created', {
      channel: {
        id,
        name: data.name,
        is_private: data.is_private === 'on' || data.is_private === 'true',
      },
    });

    return reply.redirect('/ui/channels');
  });

  fastify.post<{ Params: { id: string } }>('/ui/channels/:id/message', async (req, reply) => {
    const { id } = req.params;
    const data = req.body as Record<string, string>;
    const text = data.text || '';
    const user_id = data.user_id || 'U_BOT_TWIN';
    const ts = generateMessageTs();

    fastify.slackStateManager.createMessage({
      ts,
      channel_id: id,
      user_id,
      text,
    });

    // Dispatch message event
    fastify.eventDispatcher.dispatch('message', {
      channel: id,
      user: user_id,
      text,
      ts,
    });

    return reply.redirect(`/ui/channels/${id}`);
  });

  fastify.post<{ Params: { id: string } }>('/ui/channels/:id', async (req, reply) => {
    const { id } = req.params;
    const data = req.body as Record<string, string>;
    fastify.slackStateManager.updateChannel(id, {
      name: data.name,
      topic: data.topic,
      purpose: data.purpose,
    });
    return reply.redirect(`/ui/channels/${id}`);
  });

  fastify.delete<{ Params: { id: string } }>('/ui/channels/:id', async (req, reply) => {
    fastify.slackStateManager.database.prepare('DELETE FROM slack_channels WHERE id = ?').run(req.params.id);
    return reply.send('');
  });

  // ========================
  // USERS
  // ========================

  // IMPORTANT: Register /new BEFORE /:id to avoid route conflicts
  fastify.get('/ui/users/new', async (_req, reply) => {
    return reply.viewAsync('users/form.eta', pageData('users', 'New User', {
      formTitle: 'New User',
      action: '/ui/users',
      submitLabel: 'Create User',
      cancelHref: '/ui/users',
      fields: [
        { name: 'name', label: 'Username', type: 'text', required: true, placeholder: 'e.g. johndoe' },
        { name: 'real_name', label: 'Real Name', type: 'text', placeholder: 'John Doe' },
        { name: 'display_name', label: 'Display Name', type: 'text', placeholder: 'John' },
        { name: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
        { name: 'is_admin', label: 'Is Admin', type: 'checkbox' },
        { name: 'is_bot', label: 'Is Bot', type: 'checkbox' },
      ],
    }));
  });

  fastify.get('/ui/users', async (_req, reply) => {
    const users = fastify.slackStateManager.listUsers();
    return reply.viewAsync('users/list.eta', pageData('users', 'Users', {
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'real_name', label: 'Real Name' },
        { key: 'email', label: 'Email' },
        { key: 'is_admin', label: 'Admin' },
        { key: 'is_bot', label: 'Bot' },
      ],
      rows: users,
      basePath: '/ui/users',
      idKey: 'id',
      createHref: '/ui/users/new',
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/users/:id/edit', async (req, reply) => {
    const user = fastify.slackStateManager.getUser(req.params.id);
    if (!user) return reply.status(404).send('User not found');
    return reply.viewAsync('users/form.eta', pageData('users', 'Edit User', {
      formTitle: `Edit ${user.real_name || user.name}`,
      action: `/ui/users/${user.id}`,
      submitLabel: 'Update User',
      cancelHref: `/ui/users/${user.id}`,
      fields: [
        { name: 'name', label: 'Username', type: 'text', value: user.name, required: true },
        { name: 'real_name', label: 'Real Name', type: 'text', value: user.real_name },
        { name: 'display_name', label: 'Display Name', type: 'text', value: user.display_name },
        { name: 'email', label: 'Email', type: 'email', value: user.email },
      ],
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/users/:id', async (req, reply) => {
    const user = fastify.slackStateManager.getUser(req.params.id);
    if (!user) return reply.status(404).send('User not found');
    return reply.viewAsync('users/detail.eta', pageData('users', user.real_name || user.name, {
      entityTitle: user.real_name || user.name,
      editHref: `/ui/users/${user.id}/edit`,
      deleteHref: `/ui/users/${user.id}`,
      listHref: '/ui/users',
      fields: [
        { label: 'ID', value: user.id },
        { label: 'Team ID', value: user.team_id },
        { label: 'Name', value: user.name },
        { label: 'Real Name', value: user.real_name },
        { label: 'Display Name', value: user.display_name },
        { label: 'Email', value: user.email },
        { label: 'Is Admin', value: user.is_admin ? 'Yes' : 'No' },
        { label: 'Is Bot', value: user.is_bot ? 'Yes' : 'No' },
        { label: 'Timezone', value: user.tz },
      ],
      rawJson: formatJson(user),
    }));
  });

  fastify.post('/ui/users', async (req, reply) => {
    const data = req.body as Record<string, string>;
    const id = generateUserId();
    fastify.slackStateManager.createUser({
      id,
      name: data.name,
      real_name: data.real_name || '',
      display_name: data.display_name || '',
      email: data.email || '',
      is_admin: data.is_admin === 'on' || data.is_admin === 'true',
      is_bot: data.is_bot === 'on' || data.is_bot === 'true',
      team_id: 'T_TWIN',
    });
    return reply.redirect('/ui/users');
  });

  fastify.post<{ Params: { id: string } }>('/ui/users/:id', async (req, reply) => {
    const { id } = req.params;
    const data = req.body as Record<string, string>;
    fastify.slackStateManager.updateUser(id, {
      name: data.name,
      real_name: data.real_name || '',
      display_name: data.display_name || '',
      email: data.email || null,
    });
    return reply.redirect(`/ui/users/${id}`);
  });

  fastify.delete<{ Params: { id: string } }>('/ui/users/:id', async (req, reply) => {
    fastify.slackStateManager.database.prepare('DELETE FROM slack_users WHERE id = ?').run(req.params.id);
    return reply.send('');
  });

  // ========================
  // ADMIN
  // ========================

  fastify.get('/ui/admin', async (_req, reply) => {
    const db = fastify.slackStateManager.database;
    const count = (table: string): number => {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      return row.count;
    };

    return reply.viewAsync('admin/index.eta', pageData('admin', 'Admin', {
      stats: {
        channels: count('slack_channels'),
        users: count('slack_users'),
        messages: count('slack_messages'),
        tokens: count('slack_tokens'),
        event_subscriptions: count('slack_event_subscriptions'),
      },
    }));
  });

  fastify.post('/ui/admin/reset', async (_req, reply) => {
    fastify.slackStateManager.reset();
    fastify.rateLimiter.reset();
    return reply.redirect('/ui/admin');
  });

  fastify.get('/ui/admin/events', async (_req, reply) => {
    const subscriptions = fastify.slackStateManager.database
      .prepare('SELECT * FROM slack_event_subscriptions ORDER BY created_at DESC')
      .all();
    return reply.viewAsync('admin/events.eta', pageData('admin', 'Event Subscriptions', {
      subscriptions,
    }));
  });

  fastify.post('/ui/admin/fixtures', async (_req, reply) => {
    fastify.slackStateManager.createChannel({
      id: generateChannelId(),
      name: 'random',
      is_private: false,
      topic: 'Random conversations',
      purpose: 'A place for non-work-related chatter',
      creator: 'U_BOT_TWIN',
    });
    fastify.slackStateManager.createChannel({
      id: generateChannelId(),
      name: 'engineering',
      is_private: false,
      topic: 'Engineering discussions',
      purpose: 'Talk about code, architecture, and deployments',
      creator: 'U_BOT_TWIN',
    });

    fastify.slackStateManager.createUser({
      id: generateUserId(),
      name: 'alice',
      real_name: 'Alice Smith',
      display_name: 'alice',
      email: 'alice@example.com',
      is_admin: false,
      is_bot: false,
      team_id: 'T_TWIN',
    });
    fastify.slackStateManager.createUser({
      id: generateUserId(),
      name: 'bob',
      real_name: 'Bob Jones',
      display_name: 'bob',
      email: 'bob@example.com',
      is_admin: false,
      is_bot: false,
      team_id: 'T_TWIN',
    });

    return reply.redirect('/ui/admin');
  });
};

export default uiPlugin;
export { uiPlugin };
