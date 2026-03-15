/**
 * OAuth plugin for Shopify twin
 * Implements Shopify OAuth authorize + token exchange flows
 */

import type { FastifyPluginAsync } from 'fastify';
import { createHmac, randomUUID } from 'node:crypto';
import type { StateManager } from '@dtu/state';
import { validateAccessToken } from '../services/token-validator.js';

interface OAuthAuthorizeQuery {
  redirect_uri?: string;
  state?: string;
  client_id?: string;
}

interface OAuthTokenRequestBody {
  client_id?: string;
  client_secret?: string;
  code?: string;
  grant_type?: string;
  expiring?: string;
  subject_token?: string;
  subject_token_type?: string;
  refresh_token?: string;
  requested_token_type?: string;
}

interface OAuthOnlineTokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
  associated_user_scope: string;
  associated_user: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    email_verified: boolean;
    account_owner: boolean;
    locale: string;
    collaborator: boolean;
  };
}

interface OAuthTokenResponse {
  access_token: string;
  scope: string;
}

// Offline expiring token response — includes refresh token metadata so that
// createSession() can populate session.refreshToken and session.refreshTokenExpires.
// Values match the vendored upstream test expectations:
//   third_party/.../lib/auth/oauth/__tests__/refresh-token.test.ts  → expires_in: 525600, refresh_token_expires_in: 2592000
//   third_party/.../lib/auth/oauth/__tests__/token-exchange.test.ts → same shape for expiring offline exchange
interface OAuthOfflineExpiringTokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
}

const OFFLINE_EXPIRES_IN = 525600;        // seconds — ~6 days
const REFRESH_TOKEN_EXPIRES_IN = 2592000; // seconds — 30 days

interface OAuthErrorResponse {
  error: string;
  error_description?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    stateManager: StateManager;
  }
}

const ADMIN_SCOPES =
  'read_orders,write_orders,read_products,write_products,read_customers,write_customers';
const TWIN_SHOP_DOMAIN = 'dev.myshopify.com';
const TWIN_API_KEY = process.env.SHOPIFY_API_KEY ?? 'test-api-key';
const TWIN_API_SECRET = process.env.SHOPIFY_API_SECRET ?? 'test-api-secret';
const PASSTHROUGH_GRANT_TYPES = new Set([
  'client_credentials',
  'urn:ietf:params:oauth:grant-type:token-exchange',
  'refresh_token',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function hasExactTwinCredentials(body: OAuthTokenRequestBody): boolean {
  return (
    body.client_id === TWIN_API_KEY &&
    body.client_secret === TWIN_API_SECRET
  );
}

function computeOAuthCallbackHmac(
  secret: string,
  params: Record<string, string>
): string {
  const { hmac: _h, signature: _s, ...rest } = params;
  const sortedKeys = Object.keys(rest).sort((a, b) => a.localeCompare(b));
  const queryString = new URLSearchParams(
    sortedKeys.map((key) => [key, rest[key]])
  ).toString();
  return createHmac('sha256', secret).update(queryString).digest('hex');
}

const oauthPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: OAuthAuthorizeQuery;
    Reply: OAuthErrorResponse;
  }>('/admin/oauth/authorize', async (request, reply) => {
    const { redirect_uri: redirectUri, state, client_id: clientId } = request.query;

    if (!isNonEmptyString(redirectUri)) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'redirect_uri is required',
      });
    }

    let redirectUrl: URL;
    try {
      redirectUrl = new URL(redirectUri);
    } catch {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'redirect_uri must be a valid URL',
      });
    }

    const code = randomUUID();
    fastify.stateManager.storeOAuthCode(code);

    const callbackParams = {
      code,
      shop: TWIN_SHOP_DOMAIN,
      state: state ?? '',
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const hmac = computeOAuthCallbackHmac(TWIN_API_SECRET, callbackParams);

    for (const [key, value] of Object.entries({ ...callbackParams, hmac })) {
      redirectUrl.searchParams.set(key, value);
    }

    request.log.info({ clientId, redirectUri }, 'OAuth authorize redirect');
    return reply.redirect(redirectUrl.toString(), 302);
  });

  fastify.post<{
    Body: OAuthTokenRequestBody;
    Reply: OAuthTokenResponse | OAuthOnlineTokenResponse | OAuthErrorResponse;
  }>('/admin/oauth/access_token', async (request, reply) => {
    const body = request.body;

    request.log.info(
      { grantType: body?.grant_type, hasCode: isNonEmptyString(body?.code) },
      'OAuth token exchange'
    );

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Request body is required',
      });
    }

    // Grant-specific validation — branch before credential check
    if (body.grant_type === 'client_credentials') {
      // client_credentials: requires client_id and client_secret only
      if (!isNonEmptyString(body.client_id) || !isNonEmptyString(body.client_secret)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'client_id and client_secret are required for client_credentials grant',
        });
      }
    } else if (body.grant_type === 'refresh_token') {
      // refresh_token: requires client_id, client_secret, and non-empty refresh_token
      if (!isNonEmptyString(body.client_id) || !isNonEmptyString(body.client_secret)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'client_id and client_secret are required for refresh_token grant',
        });
      }
      if (!isNonEmptyString(body.refresh_token)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'refresh_token is required for refresh_token grant',
        });
      }
    } else if (body.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange') {
      // token-exchange: requires client_id, client_secret, subject_token, subject_token_type, requested_token_type
      if (!isNonEmptyString(body.client_id) || !isNonEmptyString(body.client_secret)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'client_id and client_secret are required for token-exchange grant',
        });
      }
      if (!isNonEmptyString(body.subject_token)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'subject_token is required for token-exchange grant',
        });
      }
      if (body.subject_token_type !== 'urn:ietf:params:oauth:token-type:id_token') {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'subject_token_type must be urn:ietf:params:oauth:token-type:id_token',
        });
      }
      const VALID_REQUESTED_TOKEN_TYPES = new Set([
        'urn:shopify:params:oauth:token-type:online-access-token',
        'urn:shopify:params:oauth:token-type:offline-access-token',
      ]);
      if (!isNonEmptyString(body.requested_token_type)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'requested_token_type must be urn:shopify:params:oauth:token-type:online-access-token or urn:shopify:params:oauth:token-type:offline-access-token',
        });
      }
      if (!VALID_REQUESTED_TOKEN_TYPES.has(body.requested_token_type)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'requested_token_type must be urn:shopify:params:oauth:token-type:online-access-token or urn:shopify:params:oauth:token-type:offline-access-token',
        });
      }
    } else {
      // Auth-code exchange: no grant_type or an unrecognized grant_type
      if (
        !isNonEmptyString(body.client_id) ||
        !isNonEmptyString(body.client_secret) ||
        !isNonEmptyString(body.code)
      ) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'client_id, client_secret, and code are required',
        });
      }
    }

    if (!hasExactTwinCredentials(body)) {
      return reply.status(401).send({
        error: 'invalid_client',
        error_description: 'client_id or client_secret is invalid',
      });
    }

    if (!PASSTHROUGH_GRANT_TYPES.has(body.grant_type ?? '')) {
      const { code } = body;
      if (!isNonEmptyString(code)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'client_id, client_secret, and code are required',
        });
      }
      const consumed = fastify.stateManager.consumeOAuthCode(code);
      if (!consumed) {
        return reply.status(400).send({
          error: 'invalid_grant',
          error_description: 'authorization code not found or already used',
        });
      }
    }

    const isOnlineTokenExchange =
      body.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange' &&
      body.requested_token_type === 'urn:shopify:params:oauth:token-type:online-access-token';

    const isOfflineTokenExchange =
      body.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange' &&
      body.requested_token_type === 'urn:shopify:params:oauth:token-type:offline-access-token';

    const isRefreshTokenGrant = body.grant_type === 'refresh_token';

    const accessToken = randomUUID();
    fastify.stateManager.createToken(accessToken, TWIN_SHOP_DOMAIN, ADMIN_SCOPES, 'admin');

    if (isOnlineTokenExchange) {
      return reply.send({
        access_token: accessToken,
        scope: ADMIN_SCOPES,
        expires_in: 86400,
        associated_user_scope: ADMIN_SCOPES,
        associated_user: {
          id: 1,
          first_name: 'Dev',
          last_name: 'Twin',
          email: 'twin@dev.myshopify.com',
          email_verified: true,
          account_owner: true,
          locale: 'en',
          collaborator: false,
        },
      });
    }

    // refresh_token grant — always returns the full offline expiring shape so that
    // createSession() populates session.refreshToken and session.refreshTokenExpires.
    if (isRefreshTokenGrant) {
      return reply.send({
        access_token: accessToken,
        scope: ADMIN_SCOPES,
        expires_in: OFFLINE_EXPIRES_IN,
        refresh_token: randomUUID(),
        refresh_token_expires_in: REFRESH_TOKEN_EXPIRES_IN,
      } satisfies OAuthOfflineExpiringTokenResponse);
    }

    // offline token-exchange with expiring=1 — returns the full offline expiring shape
    if (isOfflineTokenExchange && body.expiring === '1') {
      return reply.send({
        access_token: accessToken,
        scope: ADMIN_SCOPES,
        expires_in: OFFLINE_EXPIRES_IN,
        refresh_token: randomUUID(),
        refresh_token_expires_in: REFRESH_TOKEN_EXPIRES_IN,
      } satisfies OAuthOfflineExpiringTokenResponse);
    }

    // offline token-exchange with expiring=0 (or absent) — bare offline response
    return reply.send({ access_token: accessToken, scope: ADMIN_SCOPES });
  });

  fastify.get('/admin/oauth/access_scopes.json', async (request: any, reply) => {
    const token = request.headers['x-shopify-access-token'] as string | undefined;
    if (!token) {
      return reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
    }
    const result = await validateAccessToken(token, (fastify as any).stateManager);
    if (!result.valid) {
      return reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
    }
    return {
      access_scopes: ADMIN_SCOPES.split(',').map((s) => ({ handle: s.trim() })),
    };
  });
};

export default oauthPlugin;
export { oauthPlugin };
