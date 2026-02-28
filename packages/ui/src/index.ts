/**
 * @dtu/ui — Shared UI infrastructure for DTU twins
 *
 * Provides:
 * - registerUI(): one-call Fastify setup for view engine, static files, form parsing
 * - Shared Eta partials (layout, sidebar, table, detail, form, flash)
 * - Template helper functions
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

// Resolve package root relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Returns absolute path to the shared partials directory.
 * Used by registerUI to configure Eta template includes.
 */
export function getPartialsDir(): string {
  return path.join(__dirname, 'partials');
}

/**
 * Returns absolute path to the shared public assets directory.
 * Used by registerUI to configure @fastify/static.
 */
export function getPublicDir(): string {
  return path.join(__dirname, 'public');
}

export interface RegisterUIOptions {
  /** Absolute path to the twin's views directory (contains twin-specific .eta templates) */
  viewsDir: string;
  /** Twin identifier — used for CSS accent color targeting (e.g., 'shopify', 'slack') */
  twin: string;
}

/**
 * Register all UI infrastructure on a Fastify instance in one call.
 *
 * Wires up:
 * - @fastify/formbody for HTML form POST parsing
 * - @fastify/view with Eta template engine (twin views + shared partials)
 * - @fastify/static serving shared CSS/JS at /ui/static/
 */
export async function registerUI(fastify: FastifyInstance, options: RegisterUIOptions): Promise<void> {
  const { viewsDir, twin } = options;
  const partialsDir = getPartialsDir();
  const publicDir = getPublicDir();

  // Register form body parser for HTML form POSTs
  const formbody = await import('@fastify/formbody');
  await fastify.register(formbody.default);

  // Configure Eta template engine
  const { Eta } = await import('eta');
  const eta = new Eta({
    views: viewsDir,
    // Enable shared partials from @dtu/ui via absolute path includes
    // Twin templates use: <%~ include('/path/to/partial', data) %>
    // We set up a views directory and allow absolute path includes
    cache: process.env.NODE_ENV === 'production',
    // Allow templates to use absolute paths for includes
    defaultExtension: '.eta',
  });

  // Monkey-patch include resolution to support shared partials
  // When a template does include('sidebar', ...), look in shared partials dir too
  const originalResolvePath = eta.resolvePath.bind(eta);
  eta.resolvePath = function (templatePath: string, options?: any) {
    // First try resolving against the twin's views directory (default behavior)
    try {
      const resolved = originalResolvePath(templatePath, options);
      // Check if the file exists at the resolved path
      const fs = require('node:fs');
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // Fall through to shared partials
    }

    // Try resolving against shared partials directory
    const sharedPath = path.join(partialsDir, templatePath.endsWith('.eta') ? templatePath : templatePath + '.eta');
    return sharedPath;
  };

  // Register @fastify/view with Eta
  const view = await import('@fastify/view');
  await fastify.register(view.default, {
    engine: { eta },
    root: viewsDir,
    viewExt: 'eta',
    propertyName: 'view',
  });

  // Register @fastify/static for shared CSS/JS assets
  const staticPlugin = await import('@fastify/static');
  await fastify.register(staticPlugin.default, {
    root: publicDir,
    prefix: '/ui/static/',
    decorateReply: false,
  });
}

// Re-export helpers for convenience
export { formatDate, formatJson, truncate, escapeHtml } from './helpers.js';
