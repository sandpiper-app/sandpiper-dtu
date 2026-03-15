/**
 * Minimal vitest config for running failing-evidence-fixture.test.ts in isolation.
 * Used by runtime-artifact-resilience.test.ts to spawn a controlled failing child run.
 * No globalSetup (no twins needed), but includes the execution-evidence setupFile.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'artifact-resilience-fixture',
    // Include register-execution-evidence so recordSymbolHit and flush hooks run
    setupFiles: [resolve(__dirname, '../../setup/register-execution-evidence.ts')],
    testTimeout: 15_000,
    environment: 'node',
    // No globalSetup — we don't need the twins for this fixture
  },
});
