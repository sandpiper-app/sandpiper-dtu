/**
 * @dtu/ui — Shared UI infrastructure for DTU twins
 *
 * Provides:
 * - registerUI(): one-call Fastify setup for view engine, static files, form parsing
 * - Shared Eta partials (layout, sidebar, table, detail, form, flash)
 * - Template helper functions
 */

import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
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
 *
 * Template resolution: twin-specific views directory is primary.
 * If a template is not found there, falls back to shared partials from @dtu/ui.
 * This allows twin templates to use include('sidebar', data) and have it
 * resolve to the shared sidebar.eta partial.
 */
export async function registerUI(fastify: FastifyInstance, options: RegisterUIOptions): Promise<void> {
  const { viewsDir } = options;
  const partialsDir = getPartialsDir();
  const publicDir = getPublicDir();

  // Register form body parser for HTML form POSTs
  const formbody = await import('@fastify/formbody');
  await fastify.register(formbody.default);

  // Configure Eta template engine
  const { Eta } = await import('eta');
  const eta = new Eta({
    views: viewsDir,
    cache: process.env.NODE_ENV === 'production',
    defaultExtension: '.eta',
  });

  // Override resolvePath to support shared partials from @dtu/ui.
  // When a template does include('sidebar', ...), first look in the twin's
  // views directory, then fall back to shared partials directory.
  const originalResolvePath = eta.resolvePath.bind(eta);
  eta.resolvePath = function (templatePath: string, options?: Record<string, unknown>) {
    // First try resolving against the twin's views directory (default behavior)
    try {
      const resolved = originalResolvePath(templatePath, options);
      if (existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // Fall through to shared partials
    }

    // Try resolving against shared partials directory
    const ext = templatePath.endsWith('.eta') ? '' : '.eta';
    const sharedPath = path.join(partialsDir, templatePath + ext);
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
