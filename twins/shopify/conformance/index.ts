/**
 * Shopify conformance suite index
 *
 * Exports all suites and adapters for CLI consumption.
 * Individual suites can be run separately or combined into a full suite.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { shopifyNormalizer } from './normalizer.js';
import { ordersSuite } from './suites/orders.conformance.js';
import { productsSuite } from './suites/products.conformance.js';
import { webhooksSuite } from './suites/webhooks.conformance.js';

// Re-export individual suites
export { ordersSuite } from './suites/orders.conformance.js';
export { productsSuite } from './suites/products.conformance.js';
export { webhooksSuite } from './suites/webhooks.conformance.js';

// Re-export adapters
export { ShopifyTwinAdapter } from './adapters/twin-adapter.js';
export { ShopifyLiveAdapter } from './adapters/live-adapter.js';

// Re-export normalizer
export { shopifyNormalizer } from './normalizer.js';

/**
 * Full Shopify conformance suite combining all individual suites.
 * Runs all orders, products, and webhook tests in sequence.
 */
export const shopifyConformanceSuite: ConformanceSuite = {
  name: 'Shopify Full',
  description:
    'Complete Shopify Admin API conformance suite covering orders, products, and webhooks',
  normalizer: shopifyNormalizer,
  tests: [
    ...ordersSuite.tests,
    ...productsSuite.tests,
    ...webhooksSuite.tests,
  ],
};

export default shopifyConformanceSuite;
