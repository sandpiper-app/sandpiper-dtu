/**
 * Shopify Global ID (GID) utilities
 *
 * Shopify uses the format: gid://shopify/{ResourceType}/{id}
 * Examples:
 *  - gid://shopify/Order/12345
 *  - gid://shopify/Product/67890
 *  - gid://shopify/Customer/11111
 */

/**
 * Create a Shopify Global ID (GID)
 * Format: gid://shopify/{ResourceType}/{id}
 */
export function createGID(resourceType: string, id: string | number): string {
  return `gid://shopify/${resourceType}/${id}`;
}

/**
 * Parse a Shopify GID into its components
 * Throws if format is invalid
 */
export function parseGID(gid: string): { resourceType: string; id: string } {
  const match = gid.match(/^gid:\/\/shopify\/([^\/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GID format: ${gid}`);
  }
  return { resourceType: match[1], id: match[2] };
}
