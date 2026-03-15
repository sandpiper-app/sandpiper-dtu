/**
 * Shopify-specific field normalizer configuration
 *
 * Strips non-deterministic fields (IDs, timestamps) before
 * comparing Shopify twin responses against live API responses.
 */

import type { FieldNormalizerConfig } from '@dtu/conformance';

export const shopifyNormalizer: FieldNormalizerConfig = {
  stripFields: [
    'created_at',
    'updated_at',
    'createdAt',
    'updatedAt',
    'admin_graphql_api_id',
    // Rate-limit cost/throttle data changes between two independent calls (twin-mode second
    // execute). extensions.cost contains requestedQueryCost, actualQueryCost, and
    // throttleStatus.currentlyAvailable — all non-deterministic across calls.
    'extensions.cost',
  ],
  normalizeFields: {
    'id': '<ID>',
    'data.*.node.id': '<GID>',
    'edges.*.node.id': '<GID>',
    'edges.*.node.createdAt': '<TIMESTAMP>',
    'edges.*.node.updatedAt': '<TIMESTAMP>',
  },
  compareValueFields: ['ok'],
  // x-shopify-api-version is echoed deterministically from the versioned URL path on every
  // REST and GraphQL response. It is safe to value-compare because both the twin call and
  // the baseline call use the same request URL, so the version string will always match.
  // Do NOT add volatile headers (x-request-id, date, retry-after) here.
  compareHeaders: ['x-shopify-api-version'],
};
