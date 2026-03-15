/**
 * Runtime symbol execution evidence recorder — Phase 40, INFRA-23.
 * Updated: Phase 41, INFRA-25 — failure-path process exit hooks added.
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
 *
 * Failure-path guarantee (INFRA-25):
 *   Process-level exit hooks ensure symbol-execution.json is written even when the
 *   process exits non-zero (failed tests, SIGINT, SIGTERM, uncaught exceptions).
 *   Hooks are idempotent — multiple registrations are safe across module re-evaluations.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
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
 * Called once per run by the Vitest teardown hook in register-execution-evidence.ts,
 * and by failure-path process-exit hooks (INFRA-25).
 *
 * If there are 0 accumulated hits AND the output file already exists with valid JSON,
 * the flush is skipped to preserve existing evidence from a prior full run. This
 * prevents the per-file afterAll flush from destroying a populated artifact when a
 * single test file (e.g., the resilience test) does not record any hits.
 *
 * A flush IS always performed when there are hits (normal case), or when the output
 * file does not yet exist (fresh environment), or when explicitly called from
 * process-exit hooks during a crash.
 */
export function flushExecutionEvidence(): void {
  const storage = getHitStorage();
  const hits = Array.from(storage.values());

  // If no hits were recorded in this process and an existing artifact is present
  // with real data, preserve it rather than overwriting with an empty payload.
  // This prevents the per-file afterAll flush from destroying a populated artifact
  // when a single test file (e.g., the resilience test) does not record any hits.
  if (hits.length === 0) {
    try {
      if (existsSync(outputPath)) {
        const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
        if (existing && Array.isArray(existing.hits) && existing.hits.length > 0) {
          // Existing file has real hits — preserve it
          return;
        }
      }
    } catch {
      // Could not read existing file — proceed with writing empty payload
    }
  }

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

// ── Failure-path process exit hooks (INFRA-25) ────────────────────────────────
//
// These hooks guarantee that symbol-execution.json is written even when the
// process exits non-zero (test failures, SIGINT, SIGTERM, uncaught exceptions).
// They use an idempotent guard on globalThis to avoid registering duplicates
// across module re-evaluations in the same Vitest process.
//
// Registration order matters: we register all six handlers at module load time.
// Each handler calls flushExecutionEvidence() which is itself idempotent and
// uses writeFileSync (sync I/O is required in exit/signal handlers).

declare global {
  // eslint-disable-next-line no-var
  var __executionEvidenceHooksRegistered: boolean | undefined;
}

function registerFailurePathHooks(): void {
  // Idempotent guard — safe across module re-evaluations in the same process
  if (globalThis.__executionEvidenceHooksRegistered) {
    return;
  }
  globalThis.__executionEvidenceHooksRegistered = true;

  // Fires after the event loop drains but before the process exits
  process.on('beforeExit', () => {
    flushExecutionEvidence();
  });

  // Fires synchronously just before the process exits (exit code is final)
  process.on('exit', () => {
    flushExecutionEvidence();
  });

  // Ctrl+C / terminal interrupt
  process.on('SIGINT', () => {
    flushExecutionEvidence();
    process.exit(130); // conventional SIGINT exit code
  });

  // Process termination (e.g., kill, CI timeout)
  process.on('SIGTERM', () => {
    flushExecutionEvidence();
    process.exit(143); // conventional SIGTERM exit code
  });

  // Unhandled thrown exceptions
  process.on('uncaughtException', (err) => {
    flushExecutionEvidence();
    console.error('[execution-evidence] uncaughtException — flushed evidence before crash:', err);
    process.exit(1);
  });

  // Unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    flushExecutionEvidence();
    console.error('[execution-evidence] unhandledRejection — flushed evidence before crash:', reason);
    process.exit(1);
  });
}

// Register immediately when this module is first evaluated
registerFailurePathHooks();
