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
    logging: {
      debug: (...args) => args.forEach((arg) => fastify.log.debug(arg)),
      info: (...args) => args.forEach((arg) => fastify.log.info(arg)),
      warn: (...args) => args.forEach((arg) => fastify.log.warn(arg)),
      error: (...args) => args.forEach((arg) => fastify.log.error(arg)),
    },
    context: async ({ req }) => {
      // Extract and validate access token
      const token = req.headers['x-shopify-access-token'];

      if (!token || typeof token !== 'string') {
        throw new GraphQLError('Unauthorized', {
          extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
        });
      }

      const validation = await validateAccessToken(token, fastify.stateManager);

      if (!validation.valid) {
        throw new GraphQLError('Unauthorized', {
          extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
        });
      }

      return {
        stateManager: fastify.stateManager,
        shopDomain: validation.shopDomain!,
      };
    },
  });

  // Register GraphQL route
  fastify.route({
    url: '/admin/api/2024-01/graphql.json',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) =>
      yoga.handleNodeRequestAndResponse(req, reply, { req, reply }),
  });
};
