import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'sdk-verification',
    globalSetup: ['./setup/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: 'node',
  },
});
