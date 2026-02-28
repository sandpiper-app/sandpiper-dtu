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

// Resolve package root relative to this compiled file location.
// At runtime, __dirname is packages/ui/dist/ (compiled) or packages/ui/src/ (tsx).
// The partials and public dirs are always under src/, so we go up one level
// from dist/ and then into src/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine the package root — works whether running from dist/ or src/
function getPackageRoot(): string {
  // If running from dist/, go up one level
  if (__dirname.endsWith('/dist') || __dirname.endsWith('\\dist')) {
    return path.dirname(__dirname);
  }
  // If running from src/, go up one level
  if (__dirname.endsWith('/src') || __dirname.endsWith('\\src')) {
    return path.dirname(__dirname);
  }
  return __dirname;
}

/**
 * Returns absolute path to the shared partials directory.
 */
export function getPartialsDir(): string {
  return path.join(getPackageRoot(), 'src', 'partials');
}

/**
 * Returns absolute path to the shared public assets directory.
 */
export function getPublicDir(): string {
  return path.join(getPackageRoot(), 'src', 'public');
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
 * - @fastify/view with Eta template engine, using built-in layout support
 * - @fastify/static serving shared CSS/JS at /ui/static/
 *
 * Template resolution: twin views directory is primary.
 * Shared partials from @dtu/ui are available via Eta include() with
 * automatic fallback resolution.
 *
 * Layout: The shared layout.eta is used as the global layout.
 * Page templates render their content, which appears as `it.body` in layout.
 * For Eta layout syntax: <%~ it.body %> in layout renders the page content.
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
  //
  // Resolution order:
  // 1. Try the twin views directory (default Eta behavior) — but SKIP the
  //    result if it would resolve to the currently-rendering file, which causes
  //    infinite recursion when e.g. orders/form.eta does include('form').
  // 2. Try the shared @dtu/ui partials directory.
  const originalResolvePath = eta.resolvePath.bind(eta);
  eta.resolvePath = function (templatePath: string, options?: Record<string, unknown>) {
    const callerFile = options?.filepath as string | undefined;

    // First try resolving against the twin's views directory (default behavior)
    try {
      const resolved = originalResolvePath(templatePath, options);
      // Skip if the resolved path is the same as the calling template — this
      // prevents infinite recursion when a sub-template (e.g. orders/form.eta)
      // includes a shared partial by the same base name (e.g. 'form').
      if (existsSync(resolved) && resolved !== callerFile) {
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

  // Register @fastify/view with Eta and layout support.
  // @fastify/view joins `root + layout` to validate the layout file exists, so
  // the layout path must be relative to viewsDir (even though it lives in the
  // shared partials directory of @dtu/ui).
  const view = await import('@fastify/view');
  const absoluteLayoutPath = path.join(partialsDir, 'layout.eta');
  const relativeLayoutPath = path.relative(viewsDir, absoluteLayoutPath);
  await fastify.register(view.default, {
    engine: { eta },
    root: viewsDir,
    viewExt: 'eta',
    layout: relativeLayoutPath,
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
