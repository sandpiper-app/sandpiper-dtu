/**
 * @dtu/types - Shared type definitions for Digital Twin Under-studies
 */

/** Represents the state of a digital twin instance */
export interface TwinState {
  id: string;
  data: unknown;
}

/** Mode used when resetting twin state */
export type ResetMode = 'drop-and-recreate' | 'truncate';

/** Entity stored in the state manager */
export interface Entity {
  id: string;
  type: string;
  data: string;
  created_at: number;
  updated_at: number;
}

/** Options for creating a new entity */
export interface CreateEntityOptions {
  type: string;
  data: unknown;
}

/** Health check response */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
}

/** Admin reset response */
export interface ResetResponse {
  reset: boolean;
  timestamp: number;
}
