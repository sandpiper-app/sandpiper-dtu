/**
 * File-based fixture store for offline conformance mode
 *
 * Stores recorded API responses as JSON files for use when
 * network access or credentials are not available.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import type { ConformanceResponse } from './types.js';

export class FixtureStore {
  private fixtureDir: string;

  constructor(fixtureDir: string) {
    this.fixtureDir = fixtureDir;
  }

  /**
   * Save a response fixture for a test.
   * Creates intermediate directories if needed.
   */
  save(testId: string, response: ConformanceResponse): void {
    const filePath = this.pathFor(testId);
    const dir = parse(filePath).dir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(response, null, 2), 'utf-8');
  }

  /**
   * Load a saved fixture. Returns null if not found.
   */
  load(testId: string): ConformanceResponse | null {
    const filePath = this.pathFor(testId);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ConformanceResponse;
  }

  /**
   * Check if a fixture exists for a test.
   */
  has(testId: string): boolean {
    return existsSync(this.pathFor(testId));
  }

  /**
   * List all available fixture IDs.
   */
  list(): string[] {
    if (!existsSync(this.fixtureDir)) return [];
    return readdirSync(this.fixtureDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  }

  private pathFor(testId: string): string {
    // Sanitize testId to be filesystem-safe
    const safe = testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.fixtureDir, `${safe}.json`);
  }
}
