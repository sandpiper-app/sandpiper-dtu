/**
 * Token Validator for Slack Web API
 *
 * Extracts Bearer token from Authorization header.
 * CRITICAL: Slack Web API returns HTTP 200 with { ok: false, error: 'not_authed' }
 * on auth failures — NOT HTTP 401. Only rate limiting uses non-200 status (429).
 */

import type { FastifyRequest } from 'fastify';

/**
 * Extract Bearer token from Authorization header.
 * Returns null if missing or malformed.
 */
export function extractBearerToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}
