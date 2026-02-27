/**
 * Token validation service
 *
 * Validates X-Shopify-Access-Token header against stored tokens
 */

import type { StateManager } from '@dtu/state';

export interface TokenValidationResult {
  valid: boolean;
  shopDomain?: string;
}

/**
 * Validate an access token against the StateManager
 */
export async function validateAccessToken(
  token: string,
  stateManager: StateManager
): Promise<TokenValidationResult> {
  const tokenRecord = stateManager.getToken(token);
  if (!tokenRecord) {
    return { valid: false };
  }

  return {
    valid: true,
    shopDomain: tokenRecord.shop_domain,
  };
}
