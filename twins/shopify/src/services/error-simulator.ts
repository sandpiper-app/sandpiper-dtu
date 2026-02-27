/**
 * Error simulation service
 *
 * Injects configured errors into GraphQL operations for testing
 * failure scenarios (401, 403, 429, 500, 503, timeout)
 */

import type { StateManager } from '@dtu/state';
import { GraphQLError } from 'graphql';

/** DB row shape returned from StateManager.getErrorConfig */
interface ErrorConfigRow {
  id: number;
  operation_name: string;
  status_code: number;
  error_body: string | null;
  delay_ms: number | null;
  enabled: number; // SQLite boolean (0 or 1)
}

export interface ErrorConfig {
  operationName: string;
  statusCode: number;
  errorBody?: Record<string, unknown>;
  delayMs?: number;
  enabled: boolean;
}

function toErrorConfig(row: ErrorConfigRow): ErrorConfig {
  return {
    operationName: row.operation_name,
    statusCode: row.status_code,
    errorBody: row.error_body ? JSON.parse(row.error_body) : undefined,
    delayMs: row.delay_ms ?? undefined,
    enabled: !!row.enabled,
  };
}

export class ErrorSimulator {
  private globalEnabled = false;

  constructor(private stateManager: StateManager) {}

  enable(): void {
    this.globalEnabled = true;
  }

  disable(): void {
    this.globalEnabled = false;
  }

  isEnabled(): boolean {
    return this.globalEnabled;
  }

  async checkErrorSimulation(operationName: string): Promise<ErrorConfig | null> {
    if (!this.globalEnabled) return null;
    const row = this.stateManager.getErrorConfig(operationName) as ErrorConfigRow | undefined;
    if (!row || !row.enabled) return null;
    return toErrorConfig(row);
  }

  async throwIfConfigured(operationName: string): Promise<void> {
    const config = await this.checkErrorSimulation(operationName);
    if (!config) return;

    if (config.delayMs) {
      await new Promise(resolve => setTimeout(resolve, config.delayMs));
    }

    const errorMessage = config.errorBody?.message as string || 'Simulated error';
    const errorCode = config.statusCode === 401 ? 'UNAUTHORIZED' :
                     config.statusCode === 403 ? 'FORBIDDEN' :
                     config.statusCode === 429 ? 'THROTTLED' :
                     'INTERNAL_SERVER_ERROR';

    throw new GraphQLError(errorMessage, {
      extensions: {
        code: errorCode,
      },
    });
  }
}
