import type { ConformanceSuite } from '@dtu/conformance';
import { shopifyNormalizer } from '../normalizer.js';
import { shopifyAdminGraphqlPath } from '../version.js';

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
      }
    }
  }
`;

const CREATE_ORDER_MUTATION = `
  mutation CreateOrder($order: OrderInput!) {
    orderCreate(order: $order) {
      order {
        ${ORDER_FIELDS}
      }
      userErrors { field message }
    }
  }
`;

// Real Shopify Admin API uses OrderCreateOrderInput (not OrderInput)
const CREATE_ORDER_MUTATION_LIVE = `
  mutation CreateOrder($order: OrderCreateOrderInput!) {
    orderCreate(order: $order) {
      order {
        ${ORDER_FIELDS}
      }
      userErrors { field message }
    }
  }
`;

const orderInput = {
  lineItems: [{ title: 'Conformance Widget', quantity: 2, priceSet: { shopMoney: { amount: '25.00', currencyCode: 'USD' } } }],
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
        path: shopifyAdminGraphqlPath(),
        graphql: {
          query: CREATE_ORDER_MUTATION,
          variables: { order: orderInput },
        },
      },
      liveOperation: {
        name: 'orderCreate',
        description: 'Create a new order via orderCreate mutation (real API)',
        method: 'POST',
        path: shopifyAdminGraphqlPath(),
        graphql: {
          query: CREATE_ORDER_MUTATION_LIVE,
          variables: { order: orderInput },
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
          path: shopifyAdminGraphqlPath(),
          graphql: {
            query: CREATE_ORDER_MUTATION,
            variables: { order: orderInput },
          },
        },
      ],
      operation: {
        name: 'orders-list',
        description: 'Query orders list with first:10',
        method: 'POST',
        path: shopifyAdminGraphqlPath(),
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
      liveSkip: true,
      operation: {
        name: 'orderCreate-invalid',
        description: 'Attempt to create order without required lineItems',
        method: 'POST',
        path: shopifyAdminGraphqlPath(),
        graphql: {
          query: `mutation {
            orderCreate(order: {
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
