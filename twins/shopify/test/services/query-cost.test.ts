/**
 * Unit tests for the query cost calculator.
 *
 * Verifies Shopify-compatible cost algorithm:
 * - Scalar/Enum fields: 0 cost
 * - Object fields (non-connection): 1 point each, multiplied by parent connection size
 * - Connection fields: 2 + (first ?? last ?? 10), multiplied by parent connection size
 * - Mutations: 10 base cost + field costs
 * - Nested connections multiply costs correctly
 */

import { describe, it, expect } from 'vitest';
import { buildSchema, parse } from 'graphql';
import { calculateQueryCost } from '../../src/services/query-cost.js';

// Minimal schema for testing cost calculation
const testSchema = buildSchema(`
  type Query {
    orders(first: Int, last: Int): OrderConnection!
    products(first: Int, last: Int): ProductConnection!
    order(id: ID!): Order
    product(id: ID!): Product
  }

  type Mutation {
    orderCreate(input: OrderInput!): OrderCreatePayload!
    productCreate(input: ProductInput!): ProductCreatePayload!
  }

  input OrderInput {
    totalPrice: String!
  }

  input ProductInput {
    title: String!
  }

  type OrderConnection {
    edges: [OrderEdge!]!
    pageInfo: PageInfo!
  }

  type OrderEdge {
    node: Order!
    cursor: String!
  }

  type Order {
    id: ID!
    name: String!
    totalPrice: String!
    customer: Customer
    lineItems(first: Int, last: Int): LineItemConnection!
  }

  type LineItemConnection {
    edges: [LineItemEdge!]!
  }

  type LineItemEdge {
    node: LineItem!
  }

  type LineItem {
    id: ID!
    title: String!
    quantity: Int!
  }

  type Customer {
    id: ID!
    email: String!
    name: String!
  }

  type ProductConnection {
    edges: [ProductEdge!]!
  }

  type ProductEdge {
    node: Product!
  }

  type Product {
    id: ID!
    title: String!
    description: String
  }

  type PageInfo {
    hasNextPage: Boolean!
  }

  type OrderCreatePayload {
    order: Order
  }

  type ProductCreatePayload {
    product: Product
  }
`);

describe('calculateQueryCost', () => {
  describe('scalar-only query', () => {
    it('scalar fields within an object cost 0', () => {
      // order(id: "1") { id name totalPrice } — 1 object field (order) = 1
      const doc = parse(`
        query {
          order(id: "1") {
            id
            name
            totalPrice
          }
        }
      `);
      const cost = calculateQueryCost(doc, testSchema);
      // order is an Object type (not Connection) → 1 point; id/name/totalPrice are scalars → 0
      expect(cost).toBe(1);
    });

    it('nested object with only scalars costs 1 per object level', () => {
      // order { customer { id email name } } — order=1, customer=1 within order multiplier=1
      const doc = parse(`
        query {
          order(id: "1") {
            id
            customer {
              id
              email
              name
            }
          }
        }
      `);
      // order = 1 object (multiplier 1), customer = 1 object (multiplier 1), scalars = 0
      const cost = calculateQueryCost(doc, testSchema);
      expect(cost).toBe(2); // order + customer
    });
  });

  describe('connection query', () => {
    it('connection with first=10 costs 2+10=12', () => {
      const doc = parse(`
        query {
          orders(first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      // orders(first:10) = Connection → 2+10 = 12
      // edges is an object (not connection, not special) → 1 * 10 (parent multiplier)
      // node is an object → 1 * 10
      const cost = calculateQueryCost(doc, testSchema);
      // orders connection = 12, edges = 1*10 = 10, node = 1*10 = 10, id = 0
      expect(cost).toBe(32);
    });

    it('connection with first=5 costs 2+5=7 base', () => {
      const doc = parse(`
        query {
          orders(first: 5) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `);
      // orders = 2+5 = 7, edges = 1*5 = 5, node = 1*5 = 5, id/name = 0
      const cost = calculateQueryCost(doc, testSchema);
      expect(cost).toBe(17);
    });

    it('connection without first/last defaults to 10', () => {
      const doc = parse(`
        query {
          orders {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      // Default page size = 10; orders = 12, edges = 10, node = 10
      const cost = calculateQueryCost(doc, testSchema);
      expect(cost).toBe(32);
    });

    it('connection with last argument uses it for cost', () => {
      const doc = parse(`
        query {
          orders(last: 20) {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      // orders(last:20) = 2+20 = 22, edges = 1*20 = 20, node = 1*20 = 20
      const cost = calculateQueryCost(doc, testSchema);
      expect(cost).toBe(62);
    });
  });

  describe('nested connections', () => {
    it('lineItems nested in orders multiply costs by parent page size', () => {
      // orders(first:10) { edges { node { lineItems(first:5) { edges { node { id } } } } } }
      const doc = parse(`
        query {
          orders(first: 10) {
            edges {
              node {
                id
                lineItems(first: 5) {
                  edges {
                    node {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
        }
      `);
      // orders(first:10) = 2+10 = 12 (multiplier 1)
      // edges = 1*10 = 10 (within orders, multiplier becomes 10)
      // node = 1*10 = 10 (multiplier 10)
      // id = 0 (scalar)
      // lineItems(first:5) = (2+5) * 10 = 70 (multiplier 10 from orders)
      //   inside lineItems, multiplier becomes 5
      //   edges = 1*5 = 5
      //   node = 1*5 = 5
      //   id/title = 0
      const cost = calculateQueryCost(doc, testSchema);
      expect(cost).toBe(12 + 10 + 10 + 70 + 5 + 5);
      expect(cost).toBe(112);
    });
  });

  describe('mutation', () => {
    it('mutation has 10 base cost', () => {
      const doc = parse(`
        mutation {
          orderCreate(input: { totalPrice: "10.00" }) {
            order {
              id
              name
            }
          }
        }
      `);
      // mutation base = 10, orderCreate is an object (not connection) → 1, order is object → 1, id/name = 0
      const cost = calculateQueryCost(doc, testSchema);
      expect(cost).toBe(12); // 10 + 1 (orderCreate payload) + 1 (order)
    });

    it('productCreate mutation has 10 base cost plus field costs', () => {
      const doc = parse(`
        mutation {
          productCreate(input: { title: "Widget" }) {
            product {
              id
              title
            }
          }
        }
      `);
      // mutation base = 10, productCreate payload = 1, product = 1, id/title = 0
      const cost = calculateQueryCost(doc, testSchema);
      expect(cost).toBe(12);
    });
  });

  describe('variables', () => {
    it('resolves $first variable for connection cost', () => {
      const doc = parse(`
        query GetOrders($first: Int) {
          orders(first: $first) {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      // $first = 25: orders = 2+25 = 27, edges = 1*25 = 25, node = 1*25 = 25
      const cost = calculateQueryCost(doc, testSchema, { first: 25 });
      expect(cost).toBe(77);
    });

    it('uses default page size when variable is undefined', () => {
      const doc = parse(`
        query GetOrders($first: Int) {
          orders(first: $first) {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      // $first is undefined — falls back to default 10
      const cost = calculateQueryCost(doc, testSchema, {});
      // Same as default: orders = 12, edges = 10, node = 10
      expect(cost).toBe(32);
    });
  });

  describe('pageInfo and cursor (edge-level scalar-like objects)', () => {
    it('pageInfo (object field inside connection) adds 1 * connection page size', () => {
      const doc = parse(`
        query {
          orders(first: 10) {
            pageInfo {
              hasNextPage
            }
            edges {
              cursor
              node {
                id
              }
            }
          }
        }
      `);
      // orders(first:10) = 2+10 = 12 (multiplier pushed to 10)
      // pageInfo = 1*10 = 10 (object field inside OrderConnection, multiplier is 10), hasNextPage = 0
      // edges = 1*10 = 10 (object field inside OrderConnection, multiplier is 10)
      //   cursor = 0 (scalar), node = 1*10 = 10
      //     id = 0
      const cost = calculateQueryCost(doc, testSchema);
      expect(cost).toBe(12 + 10 + 10 + 10);
      expect(cost).toBe(42);
    });
  });
});
