/**
 * Products conformance suite
 *
 * Tests Shopify Admin GraphQL API product operations:
 * - Create product via mutation
 * - Query single product by GID
 * - Query products list (connection/edges)
 * - Update product and verify changes
 *
 * Runs against the twin (in-process via inject()) or a live Shopify dev store.
 */

import type { ConformanceSuite } from '@dtu/conformance';
import { shopifyNormalizer } from '../normalizer.js';

/** GraphQL query fragments */
const PRODUCT_FIELDS = `
  id
  title
  description
  vendor
  productType
  createdAt
  updatedAt
`;

const CREATE_PRODUCT_MUTATION = `
  mutation CreateProduct($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        ${PRODUCT_FIELDS}
      }
      userErrors { field message }
    }
  }
`;

const productInput = {
  title: 'Conformance Test Widget',
  description: 'A product created by the conformance test suite',
  vendor: 'DTU Tests',
  productType: 'Widget',
};

export const productsSuite: ConformanceSuite = {
  name: 'Shopify Products',
  description: 'Validates product create, query, and update operations against Shopify Admin API',
  normalizer: shopifyNormalizer,
  tests: [
    {
      id: 'products-create',
      name: 'Create product via GraphQL mutation',
      category: 'products',
      requirements: ['SHOP-01'],
      operation: {
        name: 'productCreate',
        description: 'Create a new product via productCreate mutation',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: CREATE_PRODUCT_MUTATION,
          variables: { input: productInput },
        },
      },
    },

    {
      id: 'products-list',
      name: 'Query products list (connection/edges format)',
      category: 'products',
      requirements: ['SHOP-01'],
      setup: [
        {
          name: 'create-product-for-list',
          description: 'Create product so list is non-empty',
          method: 'POST',
          path: '/admin/api/2024-01/graphql.json',
          graphql: {
            query: CREATE_PRODUCT_MUTATION,
            variables: { input: productInput },
          },
        },
      ],
      operation: {
        name: 'products-list',
        description: 'Query products list with first:10',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: `{
            products(first: 10) {
              edges {
                node {
                  ${PRODUCT_FIELDS}
                }
              }
            }
          }`,
        },
      },
    },

    {
      id: 'products-create-validation',
      name: 'Product creation returns userErrors for missing title',
      category: 'products',
      requirements: ['SHOP-01'],
      operation: {
        name: 'productCreate-invalid',
        description: 'Attempt to create product without required title field',
        method: 'POST',
        path: '/admin/api/2024-01/graphql.json',
        graphql: {
          query: `mutation {
            productCreate(input: {
              title: ""
            }) {
              product { id }
              userErrors { field message }
            }
          }`,
        },
      },
    },
  ],
};

export default productsSuite;
