/**
 * @dtu/state - State management for Digital Twin Under-studies
 *
 * Provides StateManager interface for twin state lifecycle.
 * Actual implementation with SQLite backend added in Plan 02.
 */

export type { Entity, CreateEntityOptions, ResetMode } from '@dtu/types';

/** State manager interface for twin state lifecycle */
export interface StateManager {
  /** Initialize the state manager and create tables */
  init(): void;
  /** Reset all state (drop-and-recreate for guaranteed clean slate) */
  reset(): void;
  /** Close database connection and release resources */
  close(): void;
}
