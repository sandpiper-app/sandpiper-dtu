/**
 * StateManager - SQLite-backed state management for Digital Twin Under-studies
 *
 * Uses better-sqlite3 for synchronous, fast state management with
 * drop-and-recreate reset pattern for guaranteed clean slate in <100ms.
 */

import Database from 'better-sqlite3';
import type { Entity, CreateEntityOptions } from '@dtu/types';
import { randomUUID } from 'node:crypto';

export interface StateManagerOptions {
  /** Database path. Defaults to ':memory:' for in-memory database */
  dbPath?: string;
}

export class StateManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  private insertStmt: Database.Statement | null = null;
  private getByIdStmt: Database.Statement | null = null;
  private listAllStmt: Database.Statement | null = null;
  private listByTypeStmt: Database.Statement | null = null;
  private deleteByIdStmt: Database.Statement | null = null;

  constructor(options: StateManagerOptions = {}) {
    this.dbPath = options.dbPath ?? ':memory:';
  }

  /** Initialize the database connection and run migrations */
  init(): void {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
    this.prepareStatements();
  }

  /**
   * Reset all state using drop-and-recreate pattern.
   * Closes current connection and re-initializes for guaranteed clean slate.
   * Completes in <100ms.
   */
  reset(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.insertStmt = null;
      this.getByIdStmt = null;
      this.listAllStmt = null;
      this.listByTypeStmt = null;
      this.deleteByIdStmt = null;
    }
    this.init();
  }

  /** Close database connection and release resources */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.insertStmt = null;
      this.getByIdStmt = null;
      this.listAllStmt = null;
      this.listByTypeStmt = null;
      this.deleteByIdStmt = null;
    }
  }

  /** Get the underlying database instance */
  get database(): Database.Database {
    if (!this.db) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.db;
  }

  /** Create a new entity and return it */
  createEntity(type: string, data: unknown): Entity {
    if (!this.insertStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const serializedData = JSON.stringify(data);

    this.insertStmt.run(id, type, serializedData, now, now);

    return {
      id,
      type,
      data: serializedData,
      created_at: now,
      updated_at: now,
    };
  }

  /** Get an entity by ID, or undefined if not found */
  getEntity(id: string): Entity | undefined {
    if (!this.getByIdStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getByIdStmt.get(id) as Entity | undefined;
  }

  /** List all entities, optionally filtered by type */
  listEntities(type?: string): Entity[] {
    if (!this.listAllStmt || !this.listByTypeStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    if (type) {
      return this.listByTypeStmt.all(type) as Entity[];
    }
    return this.listAllStmt.all() as Entity[];
  }

  /** Delete an entity by ID. Returns true if deleted, false if not found */
  deleteEntity(id: string): boolean {
    if (!this.deleteByIdStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const result = this.deleteByIdStmt.run(id);
    return result.changes > 0;
  }

  private runMigrations(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    `);
  }

  private prepareStatements(): void {
    const db = this.database;
    this.insertStmt = db.prepare(
      'INSERT INTO entities (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    this.getByIdStmt = db.prepare('SELECT * FROM entities WHERE id = ?');
    this.listAllStmt = db.prepare('SELECT * FROM entities ORDER BY created_at DESC');
    this.listByTypeStmt = db.prepare('SELECT * FROM entities WHERE type = ? ORDER BY created_at DESC');
    this.deleteByIdStmt = db.prepare('DELETE FROM entities WHERE id = ?');
  }
}
