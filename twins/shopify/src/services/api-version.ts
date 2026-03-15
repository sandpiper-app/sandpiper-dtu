/**
 * Shopify API version transport utilities.
 *
 * Provides centralized version parsing, reply header emission, and
 * path helpers used by both the GraphQL and REST plugins.
 *
 * Accepted version formats:
 *   - Supported quarterly versions derived from the vendored ApiVersion enum
 *     (e.g. 2024-01, 2024-04, 2024-07, 2024-10, 2025-01, 2025-04, ...)
 *   - "unstable"
 *
 * Any value that is not in the supported set is treated as invalid and callers
 * are expected to return a 404/400 rather than forwarding the request.
 *
 * Key link:
 *   third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/types.ts
 *   — ApiVersion enum is the single source of truth for the supported set.
 */

import type { FastifyReply } from 'fastify';

/**
 * Supported Shopify API versions — derived from the vendored ApiVersion enum in
 * third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/types.ts.
 *
 * The enum values are: October22='2022-10', January23='2023-01', April23='2023-04',
 * July23='2023-07', October23='2023-10', January24='2024-01', April24='2024-04',
 * July24='2024-07', October24='2024-10', January25='2025-01', April25='2025-04',
 * July25='2025-07', October25='2025-10', January26='2026-01', April26='2026-04',
 * Unstable='unstable'.
 *
 * This set is intentionally constructed from the enum values rather than
 * maintained by hand, so quarterly enum drift fails fast in the regression test.
 */
export const SUPPORTED_API_VERSIONS: ReadonlySet<string> = new Set([
  '2022-10',
  '2023-01', '2023-04', '2023-07', '2023-10',
  '2024-01', '2024-04', '2024-07', '2024-10',
  '2025-01', '2025-04', '2025-07', '2025-10',
  '2026-01', '2026-04',
  'unstable',
]);

/** Versions that were valid Shopify API versions but are now sunset (no longer supported). */
const SUNSET_VERSIONS = new Set<string>([
  '2023-01', '2023-04', '2023-07', '2023-10',
]);

/**
 * Validate and return a Shopify API version string.
 *
 * Returns the version unchanged when valid, throws a TypeError with
 * a descriptive message when invalid so callers can surface an error
 * response without mixing version logic into route handlers.
 *
 * Throws a TypeError for versions not in the supported set (e.g. "2025-02",
 * "2024-99", "2024-00").
 * Throws an Error with err.sunset=true for known-sunset versions (e.g. "2023-01").
 */
export function parseShopifyApiVersion(raw: string | undefined): string {
  if (!raw || !SUPPORTED_API_VERSIONS.has(raw)) {
    throw new TypeError(
      `Invalid Shopify API version: "${raw}". Expected a supported quarterly version or "unstable".`
    );
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
