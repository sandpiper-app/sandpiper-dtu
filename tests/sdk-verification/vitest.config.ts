import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'sdk-verification',
    globalSetup: [resolve(__dirname, 'setup/global-setup.ts')],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: 'node',
    // All tests share a single twin process; a single-worker pool prevents
    // concurrent test files from racing on mutable twin state (webhook subscriptions,
    // tokens, etc.). Tests within a file still run sequentially by default.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
