/**
 * Vitest configuration for @dtu/state package.
 */

import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared.js';

export default mergeConfig(sharedConfig, defineProject({
  test: {
    name: '@dtu/state',
  },
}));
