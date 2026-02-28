/**
 * Token Validator for Slack Web API
 *
 * Extracts auth token from request using all mechanisms the real Slack API supports.
 * CRITICAL: Slack Web API returns HTTP 200 with { ok: false, error: 'not_authed' }
 * on auth failures — NOT HTTP 401. Only rate limiting uses non-200 status (429).
 */

import type { FastifyRequest } from 'fastify';

/**
 * Extract API token from request. Checks (in order):
 * 1. Authorization: Bearer header (preferred)
 * 2. token field in request body
 * 3. token query parameter
 *
 * Matches real Slack Web API auth behavior — all three mechanisms are supported.
 */
export function extractToken(request: FastifyRequest): string | null {
  // 1. Bearer header (preferred)
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }

  // 2. Body token param (form-urlencoded or JSON)
  const body = request.body as Record<string, any> | null;
  if (body?.token && typeof body.token === 'string') {
    return body.token;
  }

  // 3. Query string token param
  const query = request.query as Record<string, any>;
  if (query?.token && typeof query.token === 'string') {
    return query.token;
  }

  return null;
}

/**
 * @deprecated Use extractToken() instead — it also checks body and query params.
 * Kept for backward compatibility.
 */
export function extractBearerToken(request: FastifyRequest): string | null {
  return extractToken(request);
}
