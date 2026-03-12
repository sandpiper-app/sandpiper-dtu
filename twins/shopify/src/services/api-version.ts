/**
 * Shopify API version transport utilities.
 *
 * Provides centralized version parsing, reply header emission, and
 * path helpers used by both the GraphQL and REST plugins.
 *
 * Accepted version formats:
 *   - YYYY-MM strings such as 2024-01, 2025-01, 2025-07
 *   - "unstable"
 *
 * Any value that does not match is treated as invalid and callers
 * are expected to return a 404/400 rather than forwarding the request.
 */

import type { FastifyReply } from 'fastify';

const SHOPIFY_API_VERSION_RE = /^(unstable|\d{4}-\d{2})$/;

/**
 * Validate and return a Shopify API version string.
 *
 * Returns the version unchanged when valid, throws a TypeError with
 * a descriptive message when invalid so callers can surface an error
 * response without mixing version logic into route handlers.
 */
export function parseShopifyApiVersion(raw: string | undefined): string {
  if (!raw || !SHOPIFY_API_VERSION_RE.test(raw)) {
    throw new TypeError(
      `Invalid Shopify API version: "${raw}". Expected "unstable" or a YYYY-MM string.`
    );
  }
  return raw;
}

/**
 * Set the X-Shopify-API-Version response header on a Fastify reply.
 * Call this at the top of every API route handler, before auth or throttle
 * branches, so that all response paths (200, 401, 429, etc.) carry the header.
 */
export function setApiVersionHeader(reply: FastifyReply, version: string): void {
  reply.header('X-Shopify-API-Version', version);
}

/**
 * Build a versioned Shopify Admin API path.
 *
 * Examples:
 *   buildAdminApiPath('2025-01', '/products.json')
 *   => '/admin/api/2025-01/products.json'
 */
export function buildAdminApiPath(version: string, suffix: string): string {
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `/admin/api/${version}${normalizedSuffix}`;
}

/**
 * Build a route prefix helper for use in REST plugin registrations.
 *
 * Usage:
 *   const adminPath = adminApiPrefix(':version');
 *   fastify.get(adminPath('/products.json'), handler);
 *
 * The returned function simply prepends "/admin/api/:version" to any suffix.
 */
export function adminApiPrefix(versionParam: string = ':version'): (suffix: string) => string {
  return (suffix: string) => {
    const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
    return `/admin/api/${versionParam}${normalizedSuffix}`;
  };
}
