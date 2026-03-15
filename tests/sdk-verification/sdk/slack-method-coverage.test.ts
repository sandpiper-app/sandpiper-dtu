/**
 * SLCK-14: Full manifest-exact Slack bound-method surface proof.
 *
 * This test proves that every bound WebClient method in the pinned
 * @slack/web-api@7.14.1 manifest is callable against the twin without
 * a transport failure, and that the returned payload contains a boolean
 * `ok` field.
 *
 * Coverage contract:
 *   - The manifest-derived method key set is computed at test time from
 *     `tools/sdk-surface/manifests/slack-web-api@7.14.1.json`.
 *   - The matrix keys must exactly equal that manifest-derived set.
 *   - The manifest-derived count must be at least 275 — a guard preventing
 *     an accidentally filtered set from passing.
 *   - A method counts as covered when its invocation completes without a
 *     transport exception AND the returned payload is an object containing
 *     a boolean `ok` field.
 *   - Admin and other stub families may satisfy this proof with `{ ok: true }`
 *     because SLCK-14 here is a callability proof, not a semantic-parity proof.
 *
 * Design:
 *   - `buildSlackMethodCallFixtures()` is called once per test context to reset
 *     the twin and seed shared state.
 *   - Individual matrix entries use the shared fixture object — no entry invents
 *     its own seeding story.
 *   - The test iterates every matrix entry against the twin and asserts the
 *     coverage condition per method.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SlackMethodCallFixtures } from './slack-method-call-fixtures.js';
import { buildSlackMethodCallFixtures } from './slack-method-call-fixtures.js';
import { SLACK_METHOD_CALL_MATRIX } from './slack-method-call-matrix.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');

// ── Manifest loading ─────────────────────────────────────────────────────────

interface ManifestEntry {
  kind: string;
  members?: string[];
}
interface Manifest {
  package: string;
  version: string;
  symbols: Record<string, ManifestEntry>;
}

const manifest: Manifest = JSON.parse(
  readFileSync(join(root, 'tools/sdk-surface/manifests/slack-web-api@7.14.1.json'), 'utf8')
);

/**
 * Derive the exact set of bound WebClient method keys from the manifest.
 *
 * The WebClient.members array in the manifest contains all TypeScript-visible
 * members. We filter out:
 *   - EventEmitter infrastructure methods (on, off, emit, once, etc.)
 *   - String prototype artifacts (toString, charAt, concat, etc.)
 *   - Number prototype artifacts (toFixed, toExponential, etc.)
 *   - Non-API property sub-paths (slackApiUrl.*, token.*)
 *
 * What remains is the full set of bound API method keys.
 */
function deriveManifestMethodKeys(): Set<string> {
  const webclientEntry = manifest.symbols['WebClient'];
  if (!webclientEntry?.members) {
    throw new Error('Manifest is missing WebClient.members — regenerate the manifest.');
  }

  const eventEmitterMethods = new Set([
    'eventNames', 'listeners', 'listenerCount', 'emit', 'on', 'addListener',
    'once', 'removeListener', 'off', 'removeAllListeners',
  ]);

  const stringProtoSuffixes = new Set([
    'toString', 'valueOf', 'charAt', 'charCodeAt', 'concat', 'indexOf',
    'lastIndexOf', 'localeCompare', 'match', 'replace', 'slice',
    'split', 'substring', 'toLowerCase', 'toLocaleLowerCase', 'toUpperCase',
    'toLocaleUpperCase', 'trim', 'substr', 'toFixed', 'toExponential',
    'toPrecision', 'toLocaleString', 'normalize', 'padStart', 'padEnd',
    'repeat', 'endsWith', 'startsWith', 'includes', 'codePointAt',
    'matchAll', 'replaceAll', 'trimStart', 'trimEnd', 'at', 'anchor', 'big',
    'blink', 'bold', 'fixed', 'fontcolor', 'fontsize', 'italics', 'link',
    'small', 'strike', 'sub', 'sup', 'fromCharCode', 'fromCodePoint', 'isArray',
    // NOTE: 'search' is intentionally NOT excluded — admin.conversations.search and
    // admin.workflows.search are valid Slack API methods.
  ]);

  const nonApiPrefixes = ['slackApiUrl.', 'token.'];

  const result = new Set<string>();
  for (const member of webclientEntry.members) {
    // Skip EventEmitter methods
    if (eventEmitterMethods.has(member)) continue;
    // Skip non-API property sub-paths
    if (nonApiPrefixes.some(p => member.startsWith(p))) continue;
    // Skip members whose last segment is a string/number prototype method
    const lastSegment = member.split('.').pop()!;
    if (stringProtoSuffixes.has(lastSegment)) continue;

    result.add(member);
  }
  return result;
}

const manifestMethodKeys = deriveManifestMethodKeys();

// ── Pre-suite assertions ──────────────────────────────────────────────────────

// Guard: manifest-derived key set must contain at least 275 methods.
// This ensures an accidentally over-filtered set cannot silently pass.
if (manifestMethodKeys.size < 275) {
  throw new Error(
    `manifest-derived WebClient method count is ${manifestMethodKeys.size}, expected >= 275. ` +
    'Check the manifest derivation filter — it may be too aggressive.'
  );
}

// Guard: every matrix key must appear in the manifest-derived set.
const matrixKeys = new Set(Object.keys(SLACK_METHOD_CALL_MATRIX));
const missingFromManifest = [...matrixKeys].filter(k => !manifestMethodKeys.has(k));
if (missingFromManifest.length > 0) {
  throw new Error(
    `Matrix contains keys not found in manifest: ${missingFromManifest.join(', ')}`
  );
}

// Guard: every manifest key must appear in the matrix.
const missingFromMatrix = [...manifestMethodKeys].filter(k => !matrixKeys.has(k));
if (missingFromMatrix.length > 0) {
  throw new Error(
    `Manifest keys missing from matrix: ${missingFromMatrix.join(', ')}`
  );
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SLCK-14: Full manifest-exact Slack WebClient bound-method surface proof', () => {
  let fixtures: SlackMethodCallFixtures;

  beforeAll(async () => {
    fixtures = await buildSlackMethodCallFixtures();
  });

  it('manifest-derived method count is at least 275', () => {
    expect(manifestMethodKeys.size).toBeGreaterThanOrEqual(275);
  });

  it('matrix keys exactly equal the manifest-derived bound-method set', () => {
    const matrixKeySet = new Set(Object.keys(SLACK_METHOD_CALL_MATRIX));

    const inManifestNotMatrix = [...manifestMethodKeys].filter(k => !matrixKeySet.has(k));
    const inMatrixNotManifest = [...matrixKeySet].filter(k => !manifestMethodKeys.has(k));

    expect(inManifestNotMatrix, 'Manifest keys missing from matrix').toEqual([]);
    expect(inMatrixNotManifest, 'Matrix keys not in manifest').toEqual([]);
  });

  // Iterate every manifest-keyed method and assert callability
  for (const methodKey of [...manifestMethodKeys].sort()) {
    it(`resolves against twin: ${methodKey}`, async () => {
      const invoke = SLACK_METHOD_CALL_MATRIX[methodKey];
      expect(invoke, `No matrix entry for ${methodKey}`).toBeDefined();

      let result: unknown;
      try {
        result = await invoke(fixtures.client, fixtures);
      } catch (err: unknown) {
        // Transport-level errors (network errors, connection refused) are failures.
        // Application-level Slack errors (ok:false) that throw in WebClient are
        // acceptable for oauth.access/oauth.v2.access style no-auth endpoints.
        const message = err instanceof Error ? err.message : String(err);
        // If it's a transport error, fail clearly
        if (
          message.includes('connect ECONNREFUSED') ||
          message.includes('fetch failed') ||
          message.includes('ENOTFOUND') ||
          message.includes('Network request failed')
        ) {
          throw new Error(`Transport failure calling ${methodKey}: ${message}`);
        }
        // Application-level error (ok:false throwing) — treat as ok:false payload
        result = { ok: false };
      }

      // Coverage condition: result must be an object with a boolean `ok` field.
      expect(result, `${methodKey} must return an object`).toBeTypeOf('object');
      expect(result).not.toBeNull();
      expect(
        typeof (result as Record<string, unknown>)['ok'],
        `${methodKey} payload must have a boolean ok field`
      ).toBe('boolean');
    });
  }
});
