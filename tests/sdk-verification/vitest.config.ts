import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'sdk-verification',
    globalSetup: ['./setup/global-setup.ts'],
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
