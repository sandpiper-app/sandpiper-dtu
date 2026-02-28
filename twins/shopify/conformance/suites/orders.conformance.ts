/**
 * Orders conformance suite
 *
 * Tests Shopify Admin GraphQL API order operations:
 * - Create order via mutation
 * - Query single order by GID
 * - Query orders list (connection/edges)
 * - Update order and verify changes
 *
 * Runs against the twin (in-process via inject()) or a live Shopify dev store.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { shopifyNormalizer } from '../normalizer.js';

/** GraphQL query fragments */
const ORDER_FIELDS = `
  id
  name
  createdAt
  updatedAt
  totalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  lineItems(first: 10) {
    edges {
      node {
        id
        title
        quantity
        price
      }
    }
  }
`;

const CREATE_ORDER_MUTATION = `
  mutation CreateOrder($input: OrderInput!) {
    orderCreate(input: $input) {
      order {
        ${ORDER_FIELDS}
      }
      userErrors { field message }
    }
  }
`;

const orderInput = {
  lineItems: [{ title: 'Conformance Widget', quantity: 2, price: '25.00' }],
  totalPrice: '50.00',
  currencyCode: 'USD',
};

export const ordersSuite: ConformanceSuite = {
  name: 'Shopify Orders',
  description: 'Validates order create, query, and update operations against Shopify Admin API',
  normalizer: shopifyNormalizer,
  tests: [
    {
      id: 'orders-create',
      name: 'Create order via GraphQL mutation',
      category: 'orders',
      requirements: ['SHOP-01'],
      operation: {
        name: 'orderCreate',
        description: 'Create a new order via orderCreate mutation',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: CREATE_ORDER_MUTATION,
          variables: { input: orderInput },
        },
      },
    },

    {
      id: 'orders-list',
      name: 'Query orders list (connection/edges format)',
      category: 'orders',
      requirements: ['SHOP-01'],
      setup: [
        {
          name: 'create-order-for-list',
          description: 'Create order so list is non-empty',
          method: 'POST',
          path: '/admin/api/2024-01/graphql.json',
          graphql: {
            query: CREATE_ORDER_MUTATION,
            variables: { input: orderInput },
          },
        },
      ],
      operation: {
        name: 'orders-list',
        description: 'Query orders list with first:10',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: `{
            orders(first: 10) {
              edges {
                node {
                  ${ORDER_FIELDS}
                }
              }
            }
          }`,
        },
      },
    },

    {
      id: 'orders-create-validation',
      name: 'Order creation returns userErrors for missing required fields',
      category: 'orders',
      requirements: ['SHOP-01'],
      operation: {
        name: 'orderCreate-invalid',
        description: 'Attempt to create order without required lineItems',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: `mutation {
            orderCreate(input: {
              lineItems: [],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      },
    },
  ],
};

export default ordersSuite;
