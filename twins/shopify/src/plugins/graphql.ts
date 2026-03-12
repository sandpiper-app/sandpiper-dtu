/**
 * GraphQL plugin for Shopify Admin API
 *
 * Integrates GraphQL Yoga with Fastify, handles token validation,
 * and provides GraphQL endpoint at /admin/api/:version/graphql.json
 *
 * Also integrates rate limiting using Shopify's leaky bucket algorithm:
 * - Pre-checks query cost before executing
 * - Returns HTTP 429 with Retry-After header when bucket is depleted
 * - Injects extensions.cost into successful responses
 *
 * Version routing:
 * - Yoga's canonical endpoint stays fixed at /admin/api/2024-01/graphql.json
 * - Fastify wrapper routes accept any valid Shopify API version via :version param
 * - Each wrapper rewrites the request URL to the canonical path before yoga.fetch()
 * - X-Shopify-API-Version is set at the top of every handler (before auth/throttle)
 *   so all response paths (200, 401, 429) carry the version header
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
import { parseShopifyApiVersion, setApiVersionHeader } from '../services/api-version.js';
import type { LeakyBucketRateLimiter } from '../services/rate-limiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Yoga's canonical admin GraphQL endpoint — never changes.
const CANONICAL_ADMIN_GRAPHQL = '/admin/api/2024-01/graphql.json';

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

  // Create GraphQL Yoga instance with a fixed canonical endpoint.
  // Do NOT change graphqlEndpoint to a param route — wrapper routes below
  // rewrite incoming versioned URLs to this canonical path before yoga.fetch().
  const yoga = createYoga<{
    req: FastifyRequest;
    reply: FastifyReply;
  }>({
    schema,
    graphqlEndpoint: CANONICAL_ADMIN_GRAPHQL,
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

  // ---------------------------------------------------------------------------
  // Storefront API route — /api/:version/graphql.json
  // ---------------------------------------------------------------------------
  // Uses same yoga instance (same schema) but different auth header.
  // Auth: Shopify-Storefront-Private-Token (not X-Shopify-Access-Token)
  // Rewrites incoming URL to the canonical admin endpoint so Yoga routes
  // the query correctly.
  fastify.route({
    url: '/api/:version/graphql.json',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req: FastifyRequest<{ Params: { version: string } }>, reply) => {
      // Parse and validate the version param, echo it as a response header
      // before auth branches so even 401 responses carry X-Shopify-API-Version.
      let version: string;
      try {
        version = parseShopifyApiVersion(req.params.version);
      } catch {
        reply.status(400).header('content-type', 'application/json');
        return reply.send(JSON.stringify({ errors: [{ message: 'Invalid API version' }] }));
      }
      setApiVersionHeader(reply, version);

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

      // Rewrite URL to the canonical admin endpoint so yoga routes correctly.
      const storefrontPattern = `/api/${version}/graphql.json`;
      const adminUrl = new URL(
        req.url.replace(storefrontPattern, CANONICAL_ADMIN_GRAPHQL),
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
      // Ensure version header survives yoga.fetch() response forwarding
      setApiVersionHeader(reply, version);
      reply.header('content-type', 'application/json');
      return reply.send(responseText);
    },
  });

  // ---------------------------------------------------------------------------
  // Admin GraphQL route — /admin/api/:version/graphql.json
  // ---------------------------------------------------------------------------
  // Version-parameterized wrapper around the single Yoga instance.
  // Preserves all existing auth and rate-limiter behavior.
  fastify.route({
    url: '/admin/api/:version/graphql.json',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req: FastifyRequest<{ Params: { version: string } }>, reply) => {
      // Parse and validate the version param, echo it as a response header
      // before all other branches so every response path (200, 401, 429, etc.)
      // carries X-Shopify-API-Version.
      let version: string;
      try {
        version = parseShopifyApiVersion(req.params.version);
      } catch {
        reply.status(400).header('content-type', 'application/json');
        return reply.send(JSON.stringify({ errors: [{ message: 'Invalid API version' }] }));
      }
      setApiVersionHeader(reply, version);

      try {
        // Rewrite the incoming versioned URL to the canonical endpoint so Yoga
        // routes the query correctly regardless of which version was requested.
        const versionedPath = `/admin/api/${version}/graphql.json`;
        const canonicalUrl = new URL(
          req.url.replace(versionedPath, CANONICAL_ADMIN_GRAPHQL),
          `http://${req.hostname}`
        );

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
          // Return HTTP 429 with Retry-After and Shopify-format error body.
          // X-Shopify-API-Version is already set above this try block.
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
          canonicalUrl.toString(),
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
          // Ensure version header survives non-JSON path
          setApiVersionHeader(reply, version);
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
        // Ensure version header is present after yoga.fetch() response forwarding
        setApiVersionHeader(reply, version);
        // Override content-type to ensure JSON
        reply.header('content-type', 'application/json');
        reply.send(JSON.stringify(responseBody));
        return reply;
      } catch (err: any) {
        // If Yoga fails to handle the error internally (e.g. plugin throws),
        // return a proper GraphQL error response.
        // X-Shopify-API-Version is already set at the top of the handler.
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
