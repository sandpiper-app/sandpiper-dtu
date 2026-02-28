/**
 * Conformance adapter interface
 *
 * Abstracts the target system (twin or real API) so the same
 * conformance tests can run against either.
 */

import type { ConformanceOperation, ConformanceResponse } from './types.js';

/** Interface that twin and live API adapters must implement */
export interface ConformanceAdapter {
  /** Human-readable name for reports */
  readonly name: string;
  /** Initialize adapter (connect to API, start twin, etc.) */
  init(): Promise<void>;
  /** Execute an operation and return normalized response */
  execute(operation: ConformanceOperation): Promise<ConformanceResponse>;
  /** Clean up (close connections, stop twin, etc.) */
  teardown(): Promise<void>;
}
