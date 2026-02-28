/**
 * SlackStateManager - Composition wrapper around StateManager for Slack-specific state
 *
 * Uses composition (not inheritance) to wrap the base StateManager with
 * Slack-specific tables and CRUD methods. All queries use prepared statements
 * for performance. Reset uses drop-and-recreate pattern for <100ms clean slate.
 *
 * Seeds default team, bot user, and general channel on init for immediate usability.
 */

import Database from 'better-sqlite3';
import { StateManager } from '@dtu/state';

export interface SlackStateManagerOptions {
  dbPath?: string;
}

export class SlackStateManager {
  private inner: StateManager;
  private dbPath: string;

  // Prepared statements — nullified on reset/close
  private createTeamStmt: Database.Statement | null = null;
  private getTeamStmt: Database.Statement | null = null;

  private createChannelStmt: Database.Statement | null = null;
  private getChannelStmt: Database.Statement | null = null;
  private listChannelsStmt: Database.Statement | null = null;
  private updateChannelStmt: Database.Statement | null = null;

  private createUserStmt: Database.Statement | null = null;
  private getUserStmt: Database.Statement | null = null;
  private listUsersStmt: Database.Statement | null = null;

  private createMessageStmt: Database.Statement | null = null;
  private getMessageStmt: Database.Statement | null = null;
  private listMessagesStmt: Database.Statement | null = null;
  private updateMessageStmt: Database.Statement | null = null;

  private createTokenStmt: Database.Statement | null = null;
  private getTokenStmt: Database.Statement | null = null;
  private listTokensStmt: Database.Statement | null = null;

  private createEventSubscriptionStmt: Database.Statement | null = null;
  private listEventSubscriptionsStmt: Database.Statement | null = null;

  private createErrorConfigStmt: Database.Statement | null = null;
  private getErrorConfigStmt: Database.Statement | null = null;
  private clearErrorConfigsStmt: Database.Statement | null = null;

  private addReactionStmt: Database.Statement | null = null;
  private listReactionsStmt: Database.Statement | null = null;

  constructor(options: SlackStateManagerOptions = {}) {
    this.dbPath = options.dbPath ?? ':memory:';
    this.inner = new StateManager({ dbPath: this.dbPath });
  }

  /** Initialize the database, run migrations, prepare statements, seed defaults */
  init(): void {
    this.inner.init();
    this.runSlackMigrations();
    this.prepareStatements();
    this.seedDefaults();
  }

  /** Get the underlying better-sqlite3 Database instance */
  get database(): Database.Database {
    return this.inner.database;
  }

  /**
   * Reset all state using drop-and-recreate pattern.
   * Completes in <100ms. Re-seeds default data after reset.
   */
  reset(): void {
    this.nullifyStatements();
    this.inner.reset();
    this.runSlackMigrations();
    this.prepareStatements();
    this.seedDefaults();
  }

  /** Close database connection and release resources */
  close(): void {
    this.nullifyStatements();
    this.inner.close();
  }

  // ---------------------------------------------------------------------------
  // Teams
  // ---------------------------------------------------------------------------

  createTeam(id: string, name: string, domain: string): void {
    this.createTeamStmt!.run(id, name, domain);
  }

  getTeam(id: string): any | undefined {
    return this.getTeamStmt!.get(id);
  }

  // ---------------------------------------------------------------------------
  // Channels
  // ---------------------------------------------------------------------------

  createChannel(data: {
    id?: string;
    name: string;
    is_channel?: boolean;
    is_private?: boolean;
    is_archived?: boolean;
    topic?: string;
    purpose?: string;
    creator?: string;
    num_members?: number;
  }): any {
    const now = Math.floor(Date.now() / 1000);
    const id = data.id ?? `C${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
    this.createChannelStmt!.run(
      id,
      data.name,
      data.is_channel !== false ? 1 : 0,
      data.is_private ? 1 : 0,
      data.is_archived ? 1 : 0,
      data.topic ?? '',
      data.purpose ?? '',
      data.creator ?? null,
      data.num_members ?? 0,
      now,
    );
    return this.getChannel(id);
  }

  getChannel(id: string): any | undefined {
    return this.getChannelStmt!.get(id);
  }

  listChannels(): any[] {
    return this.listChannelsStmt!.all();
  }

  updateChannel(id: string, data: Partial<{
    name: string;
    is_archived: boolean;
    topic: string;
    purpose: string;
    num_members: number;
  }>): void {
    const channel = this.getChannel(id);
    if (!channel) return;
    this.updateChannelStmt!.run(
      data.name ?? channel.name,
      data.is_archived !== undefined ? (data.is_archived ? 1 : 0) : channel.is_archived,
      data.topic ?? channel.topic,
      data.purpose ?? channel.purpose,
      data.num_members ?? channel.num_members,
      id,
    );
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  createUser(data: {
    id?: string;
    team_id: string;
    name: string;
    real_name?: string;
    display_name?: string;
    email?: string;
    is_admin?: boolean;
    is_bot?: boolean;
    deleted?: boolean;
    color?: string;
    tz?: string;
  }): any {
    const id = data.id ?? `U${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
    this.createUserStmt!.run(
      id,
      data.team_id,
      data.name,
      data.real_name ?? '',
      data.display_name ?? '',
      data.email ?? null,
      data.is_admin ? 1 : 0,
      data.is_bot ? 1 : 0,
      data.deleted ? 1 : 0,
      data.color ?? '000000',
      data.tz ?? 'America/Los_Angeles',
    );
    return this.getUser(id);
  }

  getUser(id: string): any | undefined {
    return this.getUserStmt!.get(id);
  }

  listUsers(): any[] {
    return this.listUsersStmt!.all();
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  createMessage(data: {
    channel_id: string;
    user_id?: string;
    text?: string;
    blocks?: string;
    ts: string;
    thread_ts?: string;
    subtype?: string;
  }): any {
    const now = Math.floor(Date.now() / 1000);
    this.createMessageStmt!.run(
      data.channel_id,
      data.user_id ?? null,
      data.text ?? null,
      data.blocks ?? null,
      data.ts,
      data.thread_ts ?? null,
      data.subtype ?? null,
      null, // edited_user
      null, // edited_ts
      now,
    );
    return this.getMessage(data.ts);
  }

  getMessage(ts: string): any | undefined {
    return this.getMessageStmt!.get(ts);
  }

  listMessages(channelId: string, opts?: {
    limit?: number;
    cursor?: string;
    oldest?: string;
    latest?: string;
  }): any[] {
    const limit = opts?.limit ?? 100;
    let sql = 'SELECT * FROM slack_messages WHERE channel_id = ?';
    const params: any[] = [channelId];

    if (opts?.oldest) {
      sql += ' AND ts > ?';
      params.push(opts.oldest);
    }
    if (opts?.latest) {
      sql += ' AND ts < ?';
      params.push(opts.latest);
    }
    if (opts?.cursor) {
      sql += ' AND ts < ?';
      params.push(opts.cursor);
    }

    sql += ' ORDER BY ts DESC LIMIT ?';
    params.push(limit + 1); // Fetch one extra to determine has_more

    return this.database.prepare(sql).all(...params);
  }

  updateMessage(ts: string, data: {
    text?: string;
    blocks?: string;
  }): void {
    const message = this.getMessage(ts);
    if (!message) return;
    const editTs = String(Math.floor(Date.now() / 1000));
    this.updateMessageStmt!.run(
      data.text ?? message.text,
      data.blocks ?? message.blocks,
      message.user_id ?? 'U_SYSTEM',
      editTs,
      ts,
    );
  }

  // ---------------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------------

  createToken(token: string, tokenType: string, teamId: string, userId: string, scope: string, appId: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.createTokenStmt!.run(token, tokenType, teamId, userId, scope, appId, now);
  }

  getToken(token: string): any | undefined {
    return this.getTokenStmt!.get(token);
  }

  listTokens(): any[] {
    return this.listTokensStmt!.all();
  }

  // ---------------------------------------------------------------------------
  // Event Subscriptions
  // ---------------------------------------------------------------------------

  createEventSubscription(appId: string, requestUrl: string, eventTypes: string[] | string): void {
    const now = Math.floor(Date.now() / 1000);
    const typesJson = typeof eventTypes === 'string' ? eventTypes : JSON.stringify(eventTypes);
    this.createEventSubscriptionStmt!.run(appId, requestUrl, typesJson, now);
  }

  listEventSubscriptions(): any[] {
    return this.listEventSubscriptionsStmt!.all();
  }

  // ---------------------------------------------------------------------------
  // Error Configs
  // ---------------------------------------------------------------------------

  createErrorConfig(methodName: string, config: {
    status_code?: number;
    error_body?: any;
    delay_ms?: number;
    enabled?: boolean;
  }): void {
    const errorBodyJson = config.error_body ? JSON.stringify(config.error_body) : null;
    this.createErrorConfigStmt!.run(
      methodName,
      config.status_code ?? null,
      errorBodyJson,
      config.delay_ms ?? null,
      config.enabled !== false ? 1 : 0,
    );
  }

  getErrorConfig(methodName: string): any | undefined {
    return this.getErrorConfigStmt!.get(methodName);
  }

  clearErrorConfigs(): void {
    this.clearErrorConfigsStmt!.run();
  }

  // ---------------------------------------------------------------------------
  // Reactions
  // ---------------------------------------------------------------------------

  addReaction(messageTs: string, channelId: string, userId: string, reaction: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.addReactionStmt!.run(messageTs, channelId, userId, reaction, now);
  }

  listReactions(messageTs: string): any[] {
    return this.listReactionsStmt!.all(messageTs);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private runSlackMigrations(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS slack_teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS slack_channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_channel BOOLEAN DEFAULT 1,
        is_private BOOLEAN DEFAULT 0,
        is_archived BOOLEAN DEFAULT 0,
        topic TEXT DEFAULT '',
        purpose TEXT DEFAULT '',
        creator TEXT,
        num_members INTEGER DEFAULT 0,
        created INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS slack_users (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        real_name TEXT DEFAULT '',
        display_name TEXT DEFAULT '',
        email TEXT,
        is_admin BOOLEAN DEFAULT 0,
        is_bot BOOLEAN DEFAULT 0,
        deleted BOOLEAN DEFAULT 0,
        color TEXT DEFAULT '000000',
        tz TEXT DEFAULT 'America/Los_Angeles'
      );

      CREATE TABLE IF NOT EXISTS slack_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        user_id TEXT,
        text TEXT,
        blocks TEXT,
        ts TEXT UNIQUE NOT NULL,
        thread_ts TEXT,
        subtype TEXT,
        edited_user TEXT,
        edited_ts TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS slack_tokens (
        token TEXT PRIMARY KEY,
        token_type TEXT NOT NULL,
        team_id TEXT NOT NULL,
        user_id TEXT,
        scope TEXT NOT NULL,
        app_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS slack_event_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id TEXT NOT NULL,
        request_url TEXT NOT NULL,
        event_types TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS slack_error_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method_name TEXT UNIQUE NOT NULL,
        status_code INTEGER,
        error_body TEXT,
        delay_ms INTEGER,
        enabled BOOLEAN DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS slack_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_ts TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reaction TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_slack_messages_channel ON slack_messages(channel_id);
      CREATE INDEX IF NOT EXISTS idx_slack_messages_ts ON slack_messages(ts);
      CREATE INDEX IF NOT EXISTS idx_slack_reactions_ts ON slack_reactions(message_ts);
    `);
  }

  private prepareStatements(): void {
    const db = this.database;

    this.createTeamStmt = db.prepare(
      'INSERT OR REPLACE INTO slack_teams (id, name, domain) VALUES (?, ?, ?)'
    );
    this.getTeamStmt = db.prepare('SELECT * FROM slack_teams WHERE id = ?');

    this.createChannelStmt = db.prepare(
      'INSERT OR REPLACE INTO slack_channels (id, name, is_channel, is_private, is_archived, topic, purpose, creator, num_members, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this.getChannelStmt = db.prepare('SELECT * FROM slack_channels WHERE id = ?');
    this.listChannelsStmt = db.prepare('SELECT * FROM slack_channels ORDER BY name ASC');
    this.updateChannelStmt = db.prepare(
      'UPDATE slack_channels SET name = ?, is_archived = ?, topic = ?, purpose = ?, num_members = ? WHERE id = ?'
    );

    this.createUserStmt = db.prepare(
      'INSERT OR REPLACE INTO slack_users (id, team_id, name, real_name, display_name, email, is_admin, is_bot, deleted, color, tz) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this.getUserStmt = db.prepare('SELECT * FROM slack_users WHERE id = ?');
    this.listUsersStmt = db.prepare('SELECT * FROM slack_users ORDER BY name ASC');

    this.createMessageStmt = db.prepare(
      'INSERT INTO slack_messages (channel_id, user_id, text, blocks, ts, thread_ts, subtype, edited_user, edited_ts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this.getMessageStmt = db.prepare('SELECT * FROM slack_messages WHERE ts = ?');
    this.listMessagesStmt = db.prepare(
      'SELECT * FROM slack_messages WHERE channel_id = ? ORDER BY ts DESC LIMIT ?'
    );
    this.updateMessageStmt = db.prepare(
      'UPDATE slack_messages SET text = ?, blocks = ?, edited_user = ?, edited_ts = ? WHERE ts = ?'
    );

    this.createTokenStmt = db.prepare(
      'INSERT INTO slack_tokens (token, token_type, team_id, user_id, scope, app_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    this.getTokenStmt = db.prepare('SELECT * FROM slack_tokens WHERE token = ?');
    this.listTokensStmt = db.prepare('SELECT * FROM slack_tokens ORDER BY created_at DESC');

    this.createEventSubscriptionStmt = db.prepare(
      'INSERT INTO slack_event_subscriptions (app_id, request_url, event_types, created_at) VALUES (?, ?, ?, ?)'
    );
    this.listEventSubscriptionsStmt = db.prepare(
      'SELECT * FROM slack_event_subscriptions ORDER BY created_at DESC'
    );

    this.createErrorConfigStmt = db.prepare(
      'INSERT OR REPLACE INTO slack_error_configs (method_name, status_code, error_body, delay_ms, enabled) VALUES (?, ?, ?, ?, ?)'
    );
    this.getErrorConfigStmt = db.prepare(
      'SELECT * FROM slack_error_configs WHERE method_name = ? AND enabled = 1'
    );
    this.clearErrorConfigsStmt = db.prepare('DELETE FROM slack_error_configs');

    this.addReactionStmt = db.prepare(
      'INSERT INTO slack_reactions (message_ts, channel_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    this.listReactionsStmt = db.prepare(
      'SELECT * FROM slack_reactions WHERE message_ts = ? ORDER BY created_at ASC'
    );
  }

  private seedDefaults(): void {
    // Default team
    this.createTeam('T_TWIN', 'Twin Workspace', 'twin-workspace');

    // Default bot user
    this.createUser({
      id: 'U_BOT_TWIN',
      team_id: 'T_TWIN',
      name: 'twin-bot',
      real_name: 'Twin Bot',
      is_bot: true,
    });

    // Default general channel
    this.createChannel({
      id: 'C_GENERAL',
      name: 'general',
      creator: 'U_BOT_TWIN',
    });
  }

  private nullifyStatements(): void {
    this.createTeamStmt = null;
    this.getTeamStmt = null;
    this.createChannelStmt = null;
    this.getChannelStmt = null;
    this.listChannelsStmt = null;
    this.updateChannelStmt = null;
    this.createUserStmt = null;
    this.getUserStmt = null;
    this.listUsersStmt = null;
    this.createMessageStmt = null;
    this.getMessageStmt = null;
    this.listMessagesStmt = null;
    this.updateMessageStmt = null;
    this.createTokenStmt = null;
    this.getTokenStmt = null;
    this.listTokensStmt = null;
    this.createEventSubscriptionStmt = null;
    this.listEventSubscriptionsStmt = null;
    this.createErrorConfigStmt = null;
    this.getErrorConfigStmt = null;
    this.clearErrorConfigsStmt = null;
    this.addReactionStmt = null;
    this.listReactionsStmt = null;
  }
}
