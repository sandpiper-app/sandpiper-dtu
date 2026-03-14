/**
 * Runtime symbol execution evidence recorder — Phase 40, INFRA-23.
 *
 * Provides a shared `recordSymbolHit(...)` API used by helper seams and explicit
 * exception hooks. Each hit records the manifest symbol key, package info, current
 * test file context, and hit count.
 *
 * After the test run the evidence is persisted to
 * `tests/sdk-verification/coverage/symbol-execution.json` via `flushExecutionEvidence()`.
 *
 * Symbol key format: "{package}@{version}/{SymbolPath}"
 * Example: "@slack/web-api@7.14.1/WebClient.admin.users.list"
 *          "@shopify/shopify-api@12.3.0/RestClient.get"
 *
 * Implementation note:
 *   Vitest module isolation re-evaluates this module for each test file even with
 *   singleFork:true. To survive across file boundaries we attach the hit map to
 *   `globalThis.__executionEvidenceHits` which persists across module re-evaluations
 *   in the same process.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Output artifact path
const outputPath = join(__dirname, '../coverage/symbol-execution.json');

// ── Cross-file-boundary hit storage ──────────────────────────────────────────
// Vitest re-evaluates this module per test file. Use globalThis to persist hits.

interface HitRecord {
  symbol: string;
  packageName: string;
  version: string;
  testFile: string;
  testName: string;
  hitCount: number;
}

// Key: `${symbolKey}::${testFile}`
type HitKey = string;

declare global {
  // eslint-disable-next-line no-var
  var __executionEvidenceHits: Map<HitKey, HitRecord> | undefined;
  // eslint-disable-next-line no-var
  var __executionEvidenceCurrentFile: string | undefined;
}

function getHitStorage(): Map<HitKey, HitRecord> {
  if (!globalThis.__executionEvidenceHits) {
    globalThis.__executionEvidenceHits = new Map<HitKey, HitRecord>();
  }
  return globalThis.__executionEvidenceHits;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/**
 * Parse a manifest symbol key into package name and version.
 * Input format: "@scope/pkg@version/Symbol.path" or "pkg@version/Symbol.path"
 */
function parseSymbolKey(key: string): { packageName: string; version: string } {
  const slashAfterVersion = key.indexOf('/', key.lastIndexOf('@'));
  if (slashAfterVersion === -1) {
    return { packageName: key, version: 'unknown' };
  }
  const packageWithVersion = key.slice(0, slashAfterVersion);
  const atVersionIdx = packageWithVersion.lastIndexOf('@');
  return {
    packageName: packageWithVersion.slice(0, atVersionIdx),
    version: packageWithVersion.slice(atVersionIdx + 1),
  };
}

/**
 * Get the current test file context.
 * Reads from globalThis.__executionEvidenceCurrentFile set by the setupFiles hook.
 */
function getCurrentTestFile(): string {
  return globalThis.__executionEvidenceCurrentFile ?? 'unknown';
}

/**
 * Get the current test name from Vitest's global state.
 */
function getCurrentTestName(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vitestState = (globalThis as any).__vitest_worker__;
    if (vitestState?.current?.name) {
      return vitestState.current.name as string;
    }
  } catch {
    // not in vitest context
  }
  return '';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a single symbol execution hit.
 * Called from instrumented helper seams during test execution.
 *
 * @param symbolKey - Full manifest key, e.g. "@slack/web-api@7.14.1/WebClient.admin.users.list"
 */
export function recordSymbolHit(symbolKey: string): void {
  const testFile = getCurrentTestFile();
  const testName = getCurrentTestName();
  const { packageName, version } = parseSymbolKey(symbolKey);
  const hitKey: HitKey = `${symbolKey}::${testFile}`;

  const storage = getHitStorage();
  if (!storage.has(hitKey)) {
    storage.set(hitKey, {
      symbol: symbolKey,
      packageName,
      version,
      testFile,
      testName,
      hitCount: 0,
    });
  }
  const record = storage.get(hitKey)!;
  record.hitCount++;
  if (testName) {
    record.testName = testName;
  }
}

/**
 * Flush the accumulated symbol hit records to symbol-execution.json.
 * Called once per run by the Vitest teardown hook in register-execution-evidence.ts.
 */
export function flushExecutionEvidence(): void {
  const storage = getHitStorage();
  const hits = Array.from(storage.values());

  // Sort for deterministic output
  hits.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.testFile.localeCompare(b.testFile));

  const artifact = {
    generatedAt: new Date().toISOString(),
    hitCount: hits.length,
    hits,
  };

  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`[execution-evidence] Flushed ${hits.length} symbol hit records to symbol-execution.json`);
}

/**
 * Clear all accumulated hits (used between test runs if needed).
 */
export function clearExecutionEvidence(): void {
  getHitStorage().clear();
}

/**
 * Get the total number of unique symbol+file keys that have been hit.
 */
export function getHitCount(): number {
  return getHitStorage().size;
}
