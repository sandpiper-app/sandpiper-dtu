/**
 * SQLite-backed dead letter queue for permanently failed webhook deliveries.
 *
 * Follows StateManager patterns: prepared statements, shared DB connection.
 * Accepts the same better-sqlite3 Database instance the twin's StateManager uses
 * to avoid opening a second SQLite connection.
 */

import type Database from 'better-sqlite3';
import type { DeadLetterStore, DeadLetterEntry, WebhookJob } from './types.js';

export class SqliteDeadLetterStore implements DeadLetterStore {
  private db: Database.Database;
  private addStmt!: Database.Statement;
  private listStmt!: Database.Statement;
  private getStmt!: Database.Statement;
  private removeStmt!: Database.Statement;
  private clearStmt!: Database.Statement;

  /**
   * Create a dead letter store backed by the given SQLite database.
   * Runs migration to create the table if it doesn't exist.
   *
   * @param db - A better-sqlite3 Database instance (typically shared with StateManager)
   */
  constructor(db: Database.Database) {
    this.db = db;
    this.migrate();
    this.prepareStatements();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dead_letter_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT UNIQUE NOT NULL,
        topic TEXT NOT NULL,
        callback_url TEXT NOT NULL,
        payload TEXT NOT NULL,
        error_message TEXT,
        attempts INTEGER NOT NULL,
        first_attempted_at INTEGER NOT NULL,
        last_attempted_at INTEGER NOT NULL
      );
    `);
  }

  private prepareStatements(): void {
    this.addStmt = this.db.prepare(
      `INSERT OR REPLACE INTO dead_letter_queue
       (job_id, topic, callback_url, payload, error_message, attempts, first_attempted_at, last_attempted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.listStmt = this.db.prepare(
      'SELECT * FROM dead_letter_queue ORDER BY last_attempted_at DESC'
    );
    this.getStmt = this.db.prepare(
      'SELECT * FROM dead_letter_queue WHERE id = ?'
    );
    this.removeStmt = this.db.prepare(
      'DELETE FROM dead_letter_queue WHERE id = ?'
    );
    this.clearStmt = this.db.prepare('DELETE FROM dead_letter_queue');
  }

  /** Add a failed job to the dead letter queue */
  add(job: WebhookJob): void {
    this.addStmt.run(
      job.jobId,
      job.delivery.topic,
      job.delivery.callbackUrl,
      JSON.stringify(job.delivery.payload),
      job.lastError ?? null,
      job.attempt,
      job.firstAttemptedAt,
      job.lastAttemptedAt
    );
  }

  /** List all dead letter entries, most recent first */
  list(): DeadLetterEntry[] {
    const rows = this.listStmt.all() as Array<{
      id: number;
      job_id: string;
      topic: string;
      callback_url: string;
      payload: string;
      error_message: string | null;
      attempts: number;
      first_attempted_at: number;
      last_attempted_at: number;
    }>;
    return rows.map(this.mapRow);
  }

  /** Get a single entry by auto-increment ID */
  get(id: number): DeadLetterEntry | undefined {
    const row = this.getStmt.get(id) as {
      id: number;
      job_id: string;
      topic: string;
      callback_url: string;
      payload: string;
      error_message: string | null;
      attempts: number;
      first_attempted_at: number;
      last_attempted_at: number;
    } | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  /** Remove an entry by ID. Returns true if an entry was removed. */
  remove(id: number): boolean {
    const result = this.removeStmt.run(id);
    return result.changes > 0;
  }

  /** Remove all entries from the dead letter queue */
  clear(): void {
    this.clearStmt.run();
  }

  /** Close resources. No-op when sharing DB with StateManager. */
  close(): void {
    // No-op: we don't own the database connection
  }

  private mapRow(row: {
    id: number;
    job_id: string;
    topic: string;
    callback_url: string;
    payload: string;
    error_message: string | null;
    attempts: number;
    first_attempted_at: number;
    last_attempted_at: number;
  }): DeadLetterEntry {
    return {
      id: row.id,
      jobId: row.job_id,
      topic: row.topic,
      callbackUrl: row.callback_url,
      payload: row.payload,
      errorMessage: row.error_message,
      attempts: row.attempts,
      firstAttemptedAt: row.first_attempted_at,
      lastAttemptedAt: row.last_attempted_at,
    };
  }
}
