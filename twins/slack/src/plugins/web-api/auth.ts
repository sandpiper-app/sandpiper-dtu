/**
 * Auth Web API routes for Slack twin
 *
 * POST /api/auth.test — verify credentials and return workspace identity
 * POST /api/api.test  — echo request params back (no auth required)
 *
 * auth.test is the gateway for all Slack SDK work: WebClient.auth.test is called
 * explicitly by Bolt and OAuth flows to verify credentials. Without this route,
 * every Slack SDK conformance test in Phases 18-20 is blocked.
 *
 * api.test is used by the SDK as a connectivity smoke test — it accepts any
 * request without authentication and echoes back the supplied parameters.
 *
 * CRITICAL: Slack returns HTTP 200 with { ok: false, error } for ALL errors
 * except rate limits (HTTP 429). Do NOT return 401/403/404 status codes.
 */

import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import { checkScope, METHOD_SCOPES } from '../../services/method-scopes.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';
import type { SlackRateLimiter } from '../../services/rate-limiter.js';

declare module 'fastify' {
  interface FastifyInstance {
    slackStateManager: SlackStateManager;
    rateLimiter: SlackRateLimiter;
  }
}

// Hardcoded twin bot identity — matches the deterministic seed in SlackStateManager.seedDefaults()
const TWIN_BOT_ID = 'B_BOT_TWIN';
const TWIN_TEAM_ID = 'T_TWIN';
const TWIN_USER_ID = 'U_BOT_TWIN';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth.test
  fastify.post('/api/auth.test', async (request, reply) => {
    // 1. Extract and validate token (Bearer header, body param, or query param)
    const token = extractToken(request);
    if (!token) {
      return reply.status(200).send({ ok: false, error: 'not_authed' });
    }

    // 2. Verify token exists in state
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) {
      return reply.status(200).send({ ok: false, error: 'invalid_auth' });
    }

    // SLCK-18: scope enforcement (auth.test has empty scope requirement — checkScope returns null)
    const scopeCheck = checkScope('auth.test', tokenRecord.scope);
    if (scopeCheck) {
      return reply.status(200).send({ ok: false, ...scopeCheck });
    }

    // SLCK-19: pre-set scope response headers
    const accepted = METHOD_SCOPES['auth.test']?.join(',') ?? '';
    reply.header('X-OAuth-Scopes', tokenRecord.scope);
    reply.header('X-Accepted-OAuth-Scopes', accepted);

    // 3. Rate limit check
    const limited = fastify.rateLimiter.check('auth.test', token);
    if (limited) {
      return reply
        .status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // 4. Check error simulation
    const errorConfig = fastify.slackStateManager.getErrorConfig('auth.test');
    if (errorConfig) {
      const errorBody = errorConfig.error_body
        ? JSON.parse(errorConfig.error_body)
        : { ok: false, error: 'simulated_error' };
      const statusCode = errorConfig.status_code ?? 200;
      // Add Retry-After when simulating 429 — SDK requires this header to handle rate limits
      if (statusCode === 429) {
        return reply.status(statusCode).header('Retry-After', '1').send(errorBody);
      }
      return reply.status(statusCode).send(errorBody);
    }

    // 5. Return Slack-shaped identity response
    return reply.status(200).send({
      ok: true,
      url: 'https://twin-workspace.slack.com/',
      team: 'Twin Workspace',
      user: 'bot',
      team_id: TWIN_TEAM_ID,
      user_id: TWIN_USER_ID,
      bot_id: TWIN_BOT_ID,
      is_enterprise_install: false,
    });
  });

  // POST /api/api.test
  // No auth required — echo back request body and query params merged into args
  fastify.post('/api/api.test', async (request, reply) => {
    const body = (request.body as Record<string, any>) ?? {};
    const query = (request.query as Record<string, any>) ?? {};
    const args = { ...body, ...query };

    return reply.status(200).send({ ok: true, args });
  });
};

export default authPlugin;
export { authPlugin };
