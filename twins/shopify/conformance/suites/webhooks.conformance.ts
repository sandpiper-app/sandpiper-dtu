/**
 * Webhooks conformance suite
 *
 * Tests Shopify twin webhook delivery behavior.
 * These tests are twin-only — they verify the twin's async delivery
 * infrastructure, not live Shopify API behavior.
 *
 * Tests:
 * 1. Register webhook subscription via GraphQL mutation
 * 2. webhookSubscriptionCreate mutation response shape
 * 3. Webhook subscription visible in admin state
 * 4. Multiple subscriptions for same topic all registered
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { shopifyNormalizer } from '../normalizer.js';

const WEBHOOK_SUBSCRIPTION_MUTATION = `
  mutation CreateWebhookSub($topic: String!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
        callbackUrl
      }
      userErrors { field message }
    }
  }
`;

export const webhooksSuite: ConformanceSuite = {
  name: 'Shopify Webhooks',
  description:
    'Validates webhook subscription management and delivery configuration in the Shopify twin',
  normalizer: {
    ...shopifyNormalizer,
    // Webhook subscription IDs are always non-deterministic
    normalizeFields: {
      ...shopifyNormalizer.normalizeFields,
      'data.webhookSubscriptionCreate.webhookSubscription.id': '<WEBHOOK_SUB_GID>',
    },
  },
  tests: [
    {
      id: 'webhooks-subscription-create',
      name: 'Register webhook subscription via GraphQL mutation',
      category: 'webhooks',
      requirements: ['SHOP-03', 'INFRA-05'],
      operation: {
        name: 'webhookSubscriptionCreate',
        description: 'Create a webhook subscription for orders/create topic',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: WEBHOOK_SUBSCRIPTION_MUTATION,
          variables: {
            topic: 'orders/create',
            webhookSubscription: {
              callbackUrl: 'https://example.com/webhooks/orders',
            },
          },
        },
      },
    },

    {
      id: 'webhooks-subscription-no-errors',
      name: 'webhookSubscriptionCreate returns empty userErrors on success',
      category: 'webhooks',
      requirements: ['SHOP-03'],
      operation: {
        name: 'webhookSubscriptionCreate-check-errors',
        description: 'Verify userErrors is empty on successful subscription creation',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: `mutation {
            webhookSubscriptionCreate(
              topic: "products/create",
              webhookSubscription: { callbackUrl: "https://example.com/webhooks/products" }
            ) {
              webhookSubscription { id topic callbackUrl }
              userErrors { field message }
            }
          }`,
        },
      },
    },

    {
      id: 'webhooks-subscription-state-visible',
      name: 'Webhook subscriptions appear in admin state after creation',
      category: 'webhooks',
      requirements: ['SHOP-03', 'INFRA-05'],
      setup: [
        {
          name: 'create-subscription-for-state-check',
          description: 'Create a subscription so it appears in state',
          method: 'POST',
          path: '/admin/api/2024-01/graphql.json',
          graphql: {
            query: WEBHOOK_SUBSCRIPTION_MUTATION,
            variables: {
              topic: 'customers/create',
              webhookSubscription: {
                callbackUrl: 'https://example.com/webhooks/customers',
              },
            },
          },
        },
      ],
      operation: {
        name: 'admin-state-webhooks-count',
        description: 'Check admin state to verify subscription count > 0',
        method: 'GET',
        path: '/admin/state',
      },
    },

    {
      id: 'webhooks-order-create-enqueue',
      name: 'orderCreate mutation succeeds when webhook subscription exists (queue delivery)',
      category: 'webhooks',
      requirements: ['SHOP-03', 'INFRA-05'],
      setup: [
        {
          name: 'register-order-webhook',
          description: 'Register orders/create webhook subscription',
          method: 'POST',
          path: '/admin/api/2024-01/graphql.json',
          graphql: {
            query: WEBHOOK_SUBSCRIPTION_MUTATION,
            variables: {
              topic: 'orders/create',
              webhookSubscription: {
                callbackUrl: 'https://example.com/webhooks/orders',
              },
            },
          },
        },
      ],
      operation: {
        name: 'orderCreate-with-webhook',
        description: 'Create order - webhook should be enqueued for async delivery',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: `mutation {
            orderCreate(input: {
              lineItems: [{title: "Webhook Test Widget", quantity: 1, price: "15.00"}],
              totalPrice: "15.00",
              currencyCode: "USD"
            }) {
              order { id name }
              userErrors { field message }
            }
          }`,
        },
      },
    },
  ],
};

export default webhooksSuite;
