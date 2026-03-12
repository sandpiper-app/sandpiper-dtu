/**
 * Shared Shopify conformance default-version helper.
 *
 * Single source of truth for the default Shopify Admin API version used
 * across all conformance adapters and suites. Change this one constant
 * to update the default everywhere.
 *
 * Individual suites may override the version by providing an explicit
 * `path` in their operation definitions — adapters honor `op.path` when
 * present and fall back to the helper only when the suite omitted it.
 */

/** Default Shopify Admin API version for conformance testing. */
export const SHOPIFY_ADMIN_API_VERSION = '2025-01';

/**
 * Build a Shopify Admin API GraphQL path for the given version.
 *
 * @example
 *   shopifyAdminGraphqlPath()           // '/admin/api/2025-01/graphql.json'
 *   shopifyAdminGraphqlPath('2024-01')  // '/admin/api/2024-01/graphql.json'
 */
export function shopifyAdminGraphqlPath(version: string = SHOPIFY_ADMIN_API_VERSION): string {
  return `/admin/api/${version}/graphql.json`;
}

/**
 * Build a Shopify Admin API REST path for the given version.
 *
 * @example
 *   shopifyAdminRestPath('/shop.json')           // '/admin/api/2025-01/shop.json'
 *   shopifyAdminRestPath('/shop.json', '2024-01') // '/admin/api/2024-01/shop.json'
 */
export function shopifyAdminRestPath(suffix: string, version: string = SHOPIFY_ADMIN_API_VERSION): string {
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `/admin/api/${version}${normalizedSuffix}`;
}
