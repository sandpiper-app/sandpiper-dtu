/**
 * Vitest configuration for integration smoke tests.
 *
 * These tests validate both twins respond to the HTTP patterns
 * Sandpiper uses, proving base URL swap works correctly.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
