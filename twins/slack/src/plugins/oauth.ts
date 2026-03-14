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

interface CodeBinding {
  redirectUri: string;
  scope: string;
  clientId: string;
}

// Client credential map — used at token exchange to validate client_secret
const CLIENT_SECRETS: Record<string, string> = {
  'test': 'test',
  'test-client': 'test-client-secret',
  'test-client-id-19': 'test-client-secret-19',
};

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
    const { client_id, scope, redirect_uri, state } = request.query;

    if (!redirect_uri) {
      return reply.status(400).send({ ok: false, error: 'missing_redirect_uri' });
    }

    if (!scope) {
      return reply.status(400).send({ ok: false, error: 'invalid_scope' });
    }

    // Generate a random authorization code and store it with binding
    const code = randomUUID();
    issuedCodes.set(code, { redirectUri: redirect_uri, scope, clientId: client_id ?? '' });

    // Redirect to the app's redirect_uri with code and state
    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) {
      url.searchParams.set('state', state);
    }

    return reply.redirect(url.toString());
  });

  // Track issued authorization codes (valid until exchanged) with per-code binding
  const issuedCodes = new Map<string, CodeBinding>();

  // POST /api/oauth.v2.access — token exchange
  fastify.post<{
    Body: {
      code?: string;
      client_id?: string;
      client_secret?: string;
      scope?: string;
      redirect_uri?: string;
    };
  }>('/api/oauth.v2.access', async (request) => {
    const { code, client_id, client_secret, redirect_uri } = request.body ?? {};

    // SLCK-18: validate required parameters
    if (!client_id) {
      return { ok: false, error: 'invalid_arguments' };
    }

    // Validate client_secret against CLIENT_SECRETS map
    const expectedSecret = CLIENT_SECRETS[client_id];
    if (!expectedSecret) {
      return { ok: false, error: 'invalid_client' };
    }
    if (!client_secret || client_secret !== expectedSecret) {
      return { ok: false, error: 'invalid_client' };
    }

    const binding = code ? issuedCodes.get(code) : undefined;
    if (!binding) {
      return { ok: false, error: 'invalid_code' };
    }

    // SLCK-18b+: validate client_id matches the code binding
    if (client_id !== binding.clientId) {
      return { ok: false, error: 'invalid_client' };
    }

    // SLCK-18f: validate redirect_uri binding if provided at exchange time
    if (redirect_uri && redirect_uri !== binding.redirectUri) {
      return { ok: false, error: 'redirect_uri_mismatch' };
    }

    // Consume code (one-time use)
    if (!code) {
      // Logically unreachable — binding check above proved code was truthy.
      // Guard required for TypeScript strict-mode type narrowing (TS2345).
      return { ok: false, error: 'invalid_code' };
    }
    issuedCodes.delete(code);

    request.log.info('OAuth v2 token exchange');

    const teamId = 'T_TWIN';
    const appId = 'A_TWIN';

    // Ensure default team exists (idempotent via INSERT OR REPLACE)
    const existingTeam = fastify.slackStateManager.getTeam(teamId);
    if (!existingTeam) {
      fastify.slackStateManager.createTeam(teamId, 'Twin Workspace', 'twin-workspace');
    }

    // Ensure U_AUTHED user exists (needed for user token identity lookups)
    const existingAuthedUser = fastify.slackStateManager.getUser('U_AUTHED');
    if (!existingAuthedUser) {
      fastify.slackStateManager.createUser({
        id: 'U_AUTHED',
        team_id: 'T_TWIN',
        name: 'authed-user',
        real_name: 'Authed User',
        email: 'authed-user@twin.dev',
      });
    }

    // Generate bot token (xoxb-) and user token (xoxp-)
    const tokenSuffix = randomUUID().replace(/-/g, '').substring(0, 24);
    const botToken = `xoxb-${teamId}-${tokenSuffix}`;
    const userToken = `xoxp-${teamId}-${tokenSuffix}`;

    // Use the authorize-time granted scope from the binding (not hardcoded scopes)
    const grantedScope = binding.scope;

    // Store tokens using the granted scope
    fastify.slackStateManager.createToken(botToken, 'bot', teamId, 'U_BOT_TWIN', grantedScope, appId);
    fastify.slackStateManager.createToken(userToken, 'user', teamId, 'U_AUTHED', grantedScope, appId);

    return {
      ok: true,
      access_token: botToken,
      token_type: 'bot',
      scope: grantedScope,
      bot_user_id: 'U_BOT_TWIN',
      app_id: appId,
      enterprise: null,              // required by InstallProvider.handleCallback() to determine Installation shape
      is_enterprise_install: false,  // required by InstallProvider.handleCallback() — SDK reads this field
      team: { name: 'Twin Workspace', id: teamId },
      authed_user: {
        id: 'U_AUTHED',
        scope: grantedScope,
        access_token: userToken,
        token_type: 'user',
      },
    };
  });
};

export default oauthPlugin;
export { oauthPlugin };
