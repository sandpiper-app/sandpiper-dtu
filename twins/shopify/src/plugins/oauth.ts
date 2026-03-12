/**
 * OAuth plugin for Shopify twin
 * Implements Shopify OAuth authorize + token exchange flows
 */

import type { FastifyPluginAsync } from 'fastify';
import { createHmac, randomUUID } from 'node:crypto';
import type { StateManager } from '@dtu/state';

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
  refresh_token?: string;
}

interface OAuthTokenResponse {
  access_token: string;
  scope: string;
}

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
const TWIN_API_SECRET = process.env.SHOPIFY_API_SECRET ?? 'test-api-secret';
const PASSTHROUGH_GRANT_TYPES = new Set([
  'client_credentials',
  'urn:ietf:params:oauth:grant-type:token-exchange',
  'refresh_token',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
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
    Reply: OAuthTokenResponse | OAuthErrorResponse;
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

    const issueAccessToken = (): OAuthTokenResponse => {
      const token = randomUUID();
      fastify.stateManager.createToken(token, TWIN_SHOP_DOMAIN, ADMIN_SCOPES, 'admin');
      return {
        access_token: token,
        scope: ADMIN_SCOPES,
      };
    };

    if (!PASSTHROUGH_GRANT_TYPES.has(body.grant_type ?? '')) {
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

      const consumed = fastify.stateManager.consumeOAuthCode(body.code);
      if (!consumed) {
        return reply.status(400).send({
          error: 'invalid_grant',
          error_description: 'authorization code not found or already used',
        });
      }
    }

    return {
      ...issueAccessToken(),
    };
  });
};

export default oauthPlugin;
export { oauthPlugin };
