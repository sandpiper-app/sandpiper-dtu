/**
 * GraphQL plugin for Shopify Admin API
 *
 * Integrates GraphQL Yoga with Fastify, handles token validation,
 * and provides GraphQL endpoint at /admin/api/2024-01/graphql.json
 *
 * Also integrates rate limiting using Shopify's leaky bucket algorithm:
 * - Pre-checks query cost before executing
 * - Returns HTTP 429 with Retry-After header when bucket is depleted
 * - Injects extensions.cost into successful responses
 */

import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { FastifyReply, FastifyRequest, FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as gqlParse } from 'graphql';
import { resolvers } from '../schema/resolvers.js';
import { validateAccessToken } from '../services/token-validator.js';
import { calculateQueryCost } from '../services/query-cost.js';
import type { LeakyBucketRateLimiter } from '../services/rate-limiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

declare module 'fastify' {
  interface FastifyInstance {
    rateLimiter: LeakyBucketRateLimiter;
  }
}

export const graphqlPlugin: FastifyPluginAsync = async (fastify) => {
  // Load GraphQL schema SDL from source directory
  // In dev mode (tsx), __dirname is in src/plugins/
  // In production (compiled), __dirname is in dist/plugins/, so we go up to project root and into src
  const schemaPath = __dirname.includes('/dist/')
    ? join(__dirname, '../../src/schema/schema.graphql')
    : join(__dirname, '../schema/schema.graphql');

  const typeDefs = readFileSync(schemaPath, 'utf-8');

  // Create executable schema
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  // Create GraphQL Yoga instance
  const yoga = createYoga<{
    req: FastifyRequest;
    reply: FastifyReply;
  }>({
    schema,
    graphqlEndpoint: '/admin/api/2024-01/graphql.json',
    // Disable error masking so GraphQLError codes from resolvers pass through
    maskedErrors: false,
    logging: {
      debug: (...args) => args.forEach((arg) => fastify.log.debug(arg)),
      info: (...args) => args.forEach((arg) => fastify.log.info(arg)),
      warn: (...args) => args.forEach((arg) => fastify.log.warn(arg)),
      error: (...args) => args.forEach((arg) => fastify.log.error(arg)),
    },
    context: async ({ req }) => {
      // Extract and validate access token — don't throw here to avoid
      // Fastify/Yoga response handling issues. Auth is enforced in the
      // onExecute plugin below.
      const token = req.headers['x-shopify-access-token'];
      let authorized = false;
      let shopDomain = '';

      if (token && typeof token === 'string') {
        const validation = await validateAccessToken(token, fastify.stateManager);
        if (validation.valid) {
          authorized = true;
          shopDomain = validation.shopDomain!;
        }
      }

      return {
        stateManager: fastify.stateManager,
        errorSimulator: fastify.errorSimulator,
        webhookSecret: fastify.webhookSecret,
        webhookQueue: fastify.webhookQueue,
        shopDomain,
        authorized,
      };
    },
    // Auth enforcement happens in resolvers via requireAuth() helper
  });

  // Register Storefront API route — /api/2024-01/graphql.json
  // Uses same yoga instance (same schema) but different auth header.
  // Auth: Shopify-Storefront-Private-Token (not X-Shopify-Access-Token)
  fastify.route({
    url: '/api/2024-01/graphql.json',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) => {
      // Validate Shopify-Storefront-Private-Token
      const token = req.headers['shopify-storefront-private-token'];
      let authorized = false;
      if (token && typeof token === 'string') {
        const validation = await validateAccessToken(token, fastify.stateManager);
        if (validation.valid) authorized = true;
      }
      if (!authorized) {
        reply.status(401).header('content-type', 'application/json');
        return reply.send(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }));
      }

      // Reuse same yoga instance — rewrite URL to the admin endpoint path so yoga
      // routes the query correctly (graphqlEndpoint is '/admin/api/2024-01/graphql.json').
      const adminUrl = new URL(
        req.url.replace('/api/2024-01/graphql.json', '/admin/api/2024-01/graphql.json'),
        `http://${req.hostname}`
      );

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers[key] = Array.isArray(value) ? value[0] : value;
      }

      const response = await yoga.fetch(
        adminUrl.toString(),
        {
          method: req.method,
          headers,
          body: req.method !== 'GET' && req.method !== 'HEAD'
            ? JSON.stringify(req.body)
            : undefined,
        },
        { req, reply },
      );

      const responseText = await response.text();
      reply.status(response.status);
      response.headers.forEach((value: string, key: string) => {
        reply.header(key, value);
      });
      reply.header('content-type', 'application/json');
      return reply.send(responseText);
    },
  });

  // Register GraphQL route — use yoga.fetch() to avoid Node stream
  // compatibility issues between Yoga and Fastify's reply object
  fastify.route({
    url: '/admin/api/2024-01/graphql.json',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) => {
      try {
        const url = new URL(req.url, `http://${req.hostname}`);

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) {
            headers[key] = Array.isArray(value) ? value[0] : value;
          }
        }

        // -------------------------------------------------------------------
        // Rate limiting pre-check
        // -------------------------------------------------------------------

        // Extract rate limit key from x-shopify-access-token header
        const rateLimitKey =
          (req.headers['x-shopify-access-token'] as string | undefined) ?? 'anonymous';

        // Parse the request body to get query string and variables
        const body = req.body as { query?: string; variables?: Record<string, unknown> } | undefined;
        const queryString = body?.query;
        const variables = body?.variables;

        let queryCost = 0;

        if (queryString) {
          try {
            const document = gqlParse(queryString);
            queryCost = calculateQueryCost(document, schema, variables);
          } catch {
            // If query fails to parse, let Yoga handle the parse error (cost = 0)
            queryCost = 0;
          }
        }

        const throttleResult = fastify.rateLimiter.tryConsume(rateLimitKey, queryCost);

        if (!throttleResult.allowed) {
          // Return HTTP 429 with Retry-After and Shopify-format error body
          const retryAfterSeconds = Math.ceil(throttleResult.retryAfterMs / 1000);

          reply
            .status(429)
            .header('Content-Type', 'application/json')
            .header('Retry-After', String(retryAfterSeconds));

          return reply.send(
            JSON.stringify({
              errors: [{ message: 'Throttled' }],
              extensions: {
                cost: {
                  requestedQueryCost: queryCost,
                  actualQueryCost: null,
                  throttleStatus: {
                    maximumAvailable: fastify.rateLimiter.maxAvailable,
                    currentlyAvailable: throttleResult.currentlyAvailable,
                    restoreRate: fastify.rateLimiter.restoreRate,
                  },
                },
              },
            })
          );
        }

        // -------------------------------------------------------------------
        // Execute GraphQL via Yoga
        // -------------------------------------------------------------------

        const response = await yoga.fetch(
          url.toString(),
          {
            method: req.method,
            headers,
            body: req.method !== 'GET' && req.method !== 'HEAD'
              ? JSON.stringify(req.body)
              : undefined,
          },
          { req, reply },
        );

        // Inject extensions.cost into successful responses
        const responseText = await response.text();
        let responseBody: Record<string, unknown>;
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          // Non-JSON response — pass through as-is
          reply.status(response.status);
          response.headers.forEach((value: string, key: string) => {
            reply.header(key, value);
          });
          reply.send(responseText);
          return reply;
        }

        // Inject cost extensions (mirrors Shopify's format for successful requests)
        responseBody.extensions = {
          ...(typeof responseBody.extensions === 'object' && responseBody.extensions !== null
            ? responseBody.extensions
            : {}),
          cost: {
            requestedQueryCost: queryCost,
            actualQueryCost: queryCost,
            throttleStatus: {
              maximumAvailable: fastify.rateLimiter.maxAvailable,
              currentlyAvailable: throttleResult.currentlyAvailable,
              restoreRate: fastify.rateLimiter.restoreRate,
            },
          },
        };

        reply.status(response.status);
        response.headers.forEach((value: string, key: string) => {
          reply.header(key, value);
        });
        // Override content-type to ensure JSON
        reply.header('content-type', 'application/json');
        reply.send(JSON.stringify(responseBody));
        return reply;
      } catch (err: any) {
        // If Yoga fails to handle the error internally (e.g. plugin throws),
        // return a proper GraphQL error response
        const code = err?.extensions?.code || 'INTERNAL_SERVER_ERROR';
        const message = err?.message || 'Internal server error';
        reply.status(200).header('content-type', 'application/json').send(
          JSON.stringify({
            errors: [{ message, extensions: { code } }],
          }),
        );
        return reply;
      }
    },
  });
};
