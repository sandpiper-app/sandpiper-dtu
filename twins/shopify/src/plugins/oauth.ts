/**
 * OAuth plugin for Shopify twin
 * Implements simplified OAuth token exchange flow
 */

import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { StateManager } from '@dtu/state';

interface OAuthTokenRequestBody {
  code: string;
}

interface OAuthTokenResponse {
  access_token: string;
  scope: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    stateManager: StateManager;
  }
}

const oauthPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OAuthTokenRequestBody;
    Reply: OAuthTokenResponse;
  }>('/admin/oauth/access_token', async (request, reply) => {
    const { code } = request.body;

    request.log.info({ code }, 'OAuth token exchange');

    // For twin: accept any code, issue token
    const token = randomUUID();
    const scopes = 'read_orders,write_orders,read_products,write_products,read_customers,write_customers';

    // Store token in StateManager
    fastify.stateManager.createToken(token, 'twin.myshopify.com', scopes);

    return {
      access_token: token,
      scope: scopes,
    };
  });
};

export default oauthPlugin;
export { oauthPlugin };
