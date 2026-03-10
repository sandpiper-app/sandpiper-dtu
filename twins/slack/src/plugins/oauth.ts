/**
 * OAuth v2 plugin for Slack twin
 *
 * Implements simplified OAuth v2 installation flow:
 * - GET /oauth/v2/authorize — redirect with authorization code
 * - POST /api/oauth.v2.access — exchange code for bot + user tokens
 *
 * Bot tokens start with xoxb-, user tokens with xoxp- (Slack SDK/Bolt check these prefixes).
 */

import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { SlackStateManager } from '../state/slack-state-manager.js';

declare module 'fastify' {
  interface FastifyInstance {
    slackStateManager: SlackStateManager;
    signingSecret: string;
  }
}

const oauthPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /oauth/v2/authorize — simplified redirect flow
  fastify.get<{
    Querystring: {
      client_id?: string;
      scope?: string;
      redirect_uri?: string;
      state?: string;
    };
  }>('/oauth/v2/authorize', async (request, reply) => {
    const { redirect_uri, state } = request.query;

    if (!redirect_uri) {
      return reply.status(400).send({ ok: false, error: 'missing_redirect_uri' });
    }

    // Generate a random authorization code
    const code = randomUUID();

    // Redirect to the app's redirect_uri with code and state
    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) {
      url.searchParams.set('state', state);
    }

    return reply.redirect(url.toString());
  });

  // POST /api/oauth.v2.access — token exchange
  fastify.post<{
    Body: {
      code?: string;
      client_id?: string;
      client_secret?: string;
    };
  }>('/api/oauth.v2.access', async (request) => {
    const { code } = request.body ?? {};

    if (!code) {
      return { ok: false, error: 'invalid_code' };
    }

    request.log.info({ code }, 'OAuth v2 token exchange');

    const teamId = 'T_TWIN';
    const appId = 'A_TWIN';

    // Ensure default team exists (idempotent via INSERT OR REPLACE)
    const existingTeam = fastify.slackStateManager.getTeam(teamId);
    if (!existingTeam) {
      fastify.slackStateManager.createTeam(teamId, 'Twin Workspace', 'twin-workspace');
    }

    // Generate bot token (xoxb-) and user token (xoxp-)
    const tokenSuffix = randomUUID().replace(/-/g, '').substring(0, 24);
    const botToken = `xoxb-${teamId}-${tokenSuffix}`;
    const userToken = `xoxp-${teamId}-${tokenSuffix}`;

    const botScopes = 'chat:write,channels:read,channels:history,users:read,reactions:read,app_mentions:read';
    const userScopes = 'channels:read,users:read';

    // Store tokens
    fastify.slackStateManager.createToken(botToken, 'bot', teamId, 'U_BOT_TWIN', botScopes, appId);
    fastify.slackStateManager.createToken(userToken, 'user', teamId, 'U_AUTHED', userScopes, appId);

    return {
      ok: true,
      access_token: botToken,
      token_type: 'bot',
      scope: botScopes,
      bot_user_id: 'U_BOT_TWIN',
      app_id: appId,
      enterprise: null,              // required by InstallProvider.handleCallback() to determine Installation shape
      is_enterprise_install: false,  // required by InstallProvider.handleCallback() — SDK reads this field
      team: { name: 'Twin Workspace', id: teamId },
      authed_user: {
        id: 'U_AUTHED',
        scope: userScopes,
        access_token: userToken,
        token_type: 'user',
      },
    };
  });
};

export default oauthPlugin;
export { oauthPlugin };
