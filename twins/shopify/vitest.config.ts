/**
 * Vitest configuration for @dtu/twin-shopify.
 */

import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared.js';

export default mergeConfig(sharedConfig, defineProject({
  test: {
    name: '@dtu/twin-shopify',
  },
}));
