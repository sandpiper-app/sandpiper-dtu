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

/** Versions that were valid Shopify API versions but are now sunset (no longer supported). */
const SUNSET_VERSIONS = new Set<string>([
  '2023-01', '2023-04', '2023-07', '2023-10',
]);

/** Month validation: rejects values outside 01-12 (e.g., 2024-99, 2024-00). */
const VALID_MONTH_RE = /^(0[1-9]|1[0-2])$/;

/**
 * Validate and return a Shopify API version string.
 *
 * Returns the version unchanged when valid, throws a TypeError with
 * a descriptive message when invalid so callers can surface an error
 * response without mixing version logic into route handlers.
 *
 * Throws a TypeError for syntactically-invalid versions (e.g. "2024-99").
 * Throws an Error with err.sunset=true for known-sunset versions (e.g. "2023-01").
 */
export function parseShopifyApiVersion(raw: string | undefined): string {
  if (!raw || !SHOPIFY_API_VERSION_RE.test(raw)) {
    throw new TypeError(
      `Invalid Shopify API version: "${raw}". Expected "unstable" or a YYYY-MM string.`
    );
  }
  if (raw !== 'unstable') {
    const month = raw.split('-')[1];
    if (!VALID_MONTH_RE.test(month)) {
      throw new TypeError(`Invalid Shopify API version: "${raw}". Month out of range.`);
    }
  }
  if (SUNSET_VERSIONS.has(raw)) {
    const err = new Error(`Sunset Shopify API version: "${raw}".`) as any;
    err.sunset = true;
    throw err;
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
