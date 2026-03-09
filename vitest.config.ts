/**
 * Root Vitest configuration with workspace projects.
 *
 * Uses Vitest 3.x projects pattern to discover and run tests
 * across all workspace packages and twins.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'twins/*', 'tests/*'],
  },
});
