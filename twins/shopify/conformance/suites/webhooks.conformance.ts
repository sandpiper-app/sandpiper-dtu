import type { ConformanceSuite } from '@dtu/conformance';
import { shopifyNormalizer } from '../normalizer.js';

const WEBHOOK_SUBSCRIPTION_MUTATION = `
  mutation CreateWebhookSub($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
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
      liveSkip: true,
      operation: {
        name: 'webhookSubscriptionCreate',
        description: 'Create a webhook subscription for ORDERS_CREATE topic',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: WEBHOOK_SUBSCRIPTION_MUTATION,
          variables: {
            topic: 'ORDERS_CREATE',
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
      liveSkip: true,
      operation: {
        name: 'webhookSubscriptionCreate-check-errors',
        description: 'Verify userErrors is empty on successful subscription creation',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: `mutation {
            webhookSubscriptionCreate(
              topic: PRODUCTS_CREATE,
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
      liveSkip: true,
      setup: [
        {
          name: 'create-subscription-for-state-check',
          description: 'Create a subscription so it appears in state',
          method: 'POST',
          path: '/admin/api/2024-01/graphql.json',
          graphql: {
            query: WEBHOOK_SUBSCRIPTION_MUTATION,
            variables: {
              topic: 'CUSTOMERS_CREATE',
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
      liveSkip: true,
      setup: [
        {
          name: 'register-order-webhook',
          description: 'Register ORDERS_CREATE webhook subscription',
          method: 'POST',
          path: '/admin/api/2024-01/graphql.json',
          graphql: {
            query: WEBHOOK_SUBSCRIPTION_MUTATION,
            variables: {
              topic: 'ORDERS_CREATE',
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
            orderCreate(order: {
              lineItems: [{title: "Webhook Test Widget", quantity: 1}],
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
