/**
 * Runtime artifact resilience proof — Phase 41, INFRA-25.
 *
 * Proves that symbol-execution.json survives a failing SDK test run.
 *
 * Strategy:
 *   1. Back up any pre-existing symbol-execution.json.
 *   2. Delete the live copy so we start from a known clean state.
 *   3. Record spawnStartedAt timestamp.
 *   4. Spawn a child Vitest run of failing-evidence-fixture.test.ts.
 *   5. Assert the child exits non-zero (the fixture intentionally fails).
 *   6. Assert symbol-execution.json now exists (written by failure-path hooks).
 *   7. Assert it parses as valid JSON.
 *   8. Assert the parsed payload contains generatedAt as a string.
 *   9. Assert the parsed payload contains hits as an array.
 *  10. Assert generatedAt >= spawnStartedAt (artifact came from this run).
 *  11. Restore the backed-up artifact so downstream gates (coverage:generate,
 *      drift:check) remain usable immediately after this test.
 *
 * This test does NOT use the globalSetup twins — it runs standalone via
 * "pnpm vitest run tests/sdk-verification/coverage/runtime-artifact-resilience.test.ts".
 *
 * Restoration note:
 *   When this test runs as part of the full pnpm test:sdk suite, the parent
 *   run's afterAll (register-execution-evidence.ts) will write the full accumulated
 *   hit data after this test completes, overwriting the child artifact. The
 *   explicit restore here handles the standalone invocation case so that
 *   pnpm coverage:generate && pnpm drift:check remain usable after a standalone run.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const symbolExecutionPath = join(__dirname, 'symbol-execution.json');
const fixtureConfigPath = join(__dirname, 'fixtures/vitest.config.ts');
const fixturePath = join(__dirname, 'fixtures/failing-evidence-fixture.test.ts');
const repoRoot = join(__dirname, '../../..');

describe('runtime-artifact-resilience', () => {
  it('symbol-execution.json exists and is valid after a failing child run', () => {
    // Ensure output directory exists
    mkdirSync(dirname(symbolExecutionPath), { recursive: true });

    // Step 1: Back up pre-existing artifact if present (for restoration after proof)
    let backup: string | null = null;
    if (existsSync(symbolExecutionPath)) {
      backup = readFileSync(symbolExecutionPath, 'utf8');
    }

    // Step 2: Delete the artifact to prove the child run wrote it from scratch
    if (existsSync(symbolExecutionPath)) {
      unlinkSync(symbolExecutionPath);
    }

    let childVerified = false;

    try {
      // Step 3: Record timestamp before spawn
      const spawnStartedAt = new Date().toISOString();

      // Step 4: Spawn child Vitest run of the intentionally failing fixture.
      // Use the minimal fixture config (no globalSetup, but with execution-evidence setupFile).
      const result = spawnSync(
        'pnpm',
        [
          'vitest',
          'run',
          `--config=${fixtureConfigPath}`,
          fixturePath,
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          timeout: 60_000,
        }
      );

      // Step 5: The child must exit non-zero (fixture intentionally fails)
      expect(result.status, 'child Vitest run must exit non-zero since fixture intentionally fails').not.toBe(0);

      // Step 6: symbol-execution.json must exist after the failing run
      expect(
        existsSync(symbolExecutionPath),
        `symbol-execution.json must exist after failing run — failure-path flush hooks are not working`
      ).toBe(true);

      // Step 7: Must parse as valid JSON
      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(readFileSync(symbolExecutionPath, 'utf8'));
      }, 'symbol-execution.json must be valid JSON').not.toThrow();

      const artifact = parsed as Record<string, unknown>;

      // Step 8: Must contain generatedAt
      expect(
        typeof artifact.generatedAt,
        'symbol-execution.json must have generatedAt string'
      ).toBe('string');

      // Step 9: Must contain hits as an array
      expect(
        Array.isArray(artifact.hits),
        'symbol-execution.json must have hits array'
      ).toBe(true);

      // Step 10: generatedAt must be >= spawnStartedAt (artifact is from this run)
      expect(
        (artifact.generatedAt as string) >= spawnStartedAt,
        `generatedAt (${artifact.generatedAt}) must be >= spawnStartedAt (${spawnStartedAt})`
      ).toBe(true);

      childVerified = true;
    } finally {
      // Step 11: Restore backed-up artifact so downstream gates remain usable.
      // This handles the standalone invocation case (pnpm vitest run resilience.test.ts)
      // where no full test:sdk run populates the artifact with 222+ hits.
      //
      // When running as part of pnpm test:sdk, the parent run's afterAll will
      // overwrite this restoration with the full accumulated hit data anyway.
      if (backup !== null) {
        writeFileSync(symbolExecutionPath, backup);
      }
    }

    expect(childVerified, 'child run verification must complete').toBe(true);
  });
});
