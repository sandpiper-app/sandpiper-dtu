/**
 * GraphQL plugin for Shopify Admin API
 *
 * Integrates GraphQL Yoga with Fastify, handles token validation,
 * and provides GraphQL endpoint at /admin/api/2024-01/graphql.json
 */

import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { FastifyReply, FastifyRequest, FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GraphQLError } from 'graphql';
import { resolvers } from '../schema/resolvers.js';
import { validateAccessToken } from '../services/token-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

        reply.status(response.status);
        response.headers.forEach((value: string, key: string) => {
          reply.header(key, value);
        });
        reply.send(await response.text());
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
