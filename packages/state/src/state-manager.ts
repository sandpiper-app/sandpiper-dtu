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

  // Shopify-specific prepared statements
  private createTokenStmt: Database.Statement | null = null;
  private getTokenStmt: Database.Statement | null = null;
  private createOrderStmt: Database.Statement | null = null;
  private updateOrderStmt: Database.Statement | null = null;
  private getOrderStmt: Database.Statement | null = null;
  private getOrderByGidStmt: Database.Statement | null = null;
  private listOrdersStmt: Database.Statement | null = null;
  private createProductStmt: Database.Statement | null = null;
  private getProductByGidStmt: Database.Statement | null = null;
  private listProductsStmt: Database.Statement | null = null;
  private createCustomerStmt: Database.Statement | null = null;
  private getCustomerByGidStmt: Database.Statement | null = null;
  private listCustomersStmt: Database.Statement | null = null;
  private updateCustomerStmt: Database.Statement | null = null;
  private createWebhookSubscriptionStmt: Database.Statement | null = null;
  private listWebhookSubscriptionsStmt: Database.Statement | null = null;
  private updateProductStmt: Database.Statement | null = null;
  private createFulfillmentStmt: Database.Statement | null = null;
  private getFulfillmentStmt: Database.Statement | null = null;
  private listFulfillmentsStmt: Database.Statement | null = null;
  private createErrorConfigStmt: Database.Statement | null = null;
  private getErrorConfigStmt: Database.Statement | null = null;
  private clearErrorConfigsStmt: Database.Statement | null = null;
  private updateOrderFulfillmentStatusStmt: Database.Statement | null = null;
  private updateOrderFinancialStatusStmt: Database.Statement | null = null;
  private closeOrderStmt: Database.Statement | null = null;

  // InventoryItem prepared statements
  private createInventoryItemStmt: Database.Statement | null = null;
  private getInventoryItemStmt: Database.Statement | null = null;
  private getInventoryItemByGidStmt: Database.Statement | null = null;
  private listInventoryItemsStmt: Database.Statement | null = null;
  private updateInventoryItemStmt: Database.Statement | null = null;

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
      // Reset Shopify-specific statements
      this.createTokenStmt = null;
      this.getTokenStmt = null;
      this.createOrderStmt = null;
      this.updateOrderStmt = null;
      this.getOrderStmt = null;
      this.getOrderByGidStmt = null;
      this.listOrdersStmt = null;
      this.createProductStmt = null;
      this.getProductByGidStmt = null;
      this.listProductsStmt = null;
      this.createCustomerStmt = null;
      this.getCustomerByGidStmt = null;
      this.listCustomersStmt = null;
      this.updateCustomerStmt = null;
      this.createWebhookSubscriptionStmt = null;
      this.listWebhookSubscriptionsStmt = null;
      this.updateProductStmt = null;
      this.createFulfillmentStmt = null;
      this.getFulfillmentStmt = null;
      this.listFulfillmentsStmt = null;
      this.createErrorConfigStmt = null;
      this.getErrorConfigStmt = null;
      this.clearErrorConfigsStmt = null;
      this.updateOrderFulfillmentStatusStmt = null;
      this.updateOrderFinancialStatusStmt = null;
      this.closeOrderStmt = null;
      // Reset InventoryItem statements
      this.createInventoryItemStmt = null;
      this.getInventoryItemStmt = null;
      this.getInventoryItemByGidStmt = null;
      this.listInventoryItemsStmt = null;
      this.updateInventoryItemStmt = null;
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
      // Clear Shopify-specific statements
      this.createTokenStmt = null;
      this.getTokenStmt = null;
      this.createOrderStmt = null;
      this.updateOrderStmt = null;
      this.getOrderStmt = null;
      this.getOrderByGidStmt = null;
      this.listOrdersStmt = null;
      this.createProductStmt = null;
      this.getProductByGidStmt = null;
      this.listProductsStmt = null;
      this.createCustomerStmt = null;
      this.getCustomerByGidStmt = null;
      this.listCustomersStmt = null;
      this.updateCustomerStmt = null;
      this.createWebhookSubscriptionStmt = null;
      this.listWebhookSubscriptionsStmt = null;
      this.updateProductStmt = null;
      this.createFulfillmentStmt = null;
      this.getFulfillmentStmt = null;
      this.listFulfillmentsStmt = null;
      this.createErrorConfigStmt = null;
      this.getErrorConfigStmt = null;
      this.clearErrorConfigsStmt = null;
      this.updateOrderFulfillmentStatusStmt = null;
      this.updateOrderFinancialStatusStmt = null;
      this.closeOrderStmt = null;
      // Clear InventoryItem statements
      this.createInventoryItemStmt = null;
      this.getInventoryItemStmt = null;
      this.getInventoryItemByGidStmt = null;
      this.listInventoryItemsStmt = null;
      this.updateInventoryItemStmt = null;
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

      -- Shopify-specific tables
      CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL,
        scopes TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gid TEXT UNIQUE NOT NULL,
        name TEXT,
        total_price TEXT,
        currency_code TEXT,
        customer_gid TEXT,
        line_items TEXT,
        display_fulfillment_status TEXT DEFAULT 'UNFULFILLED',
        display_financial_status TEXT DEFAULT 'PENDING',
        closed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gid TEXT UNIQUE NOT NULL,
        title TEXT,
        description TEXT,
        vendor TEXT,
        product_type TEXT,
        price TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gid TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        first_name TEXT,
        last_name TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gid TEXT UNIQUE NOT NULL,
        sku TEXT,
        tracked BOOLEAN,
        available INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fulfillments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gid TEXT UNIQUE NOT NULL,
        order_gid TEXT,
        status TEXT,
        tracking_number TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        callback_url TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS error_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_name TEXT UNIQUE NOT NULL,
        status_code INTEGER,
        error_body TEXT,
        delay_ms INTEGER,
        enabled BOOLEAN DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_orders_gid ON orders(gid);
      CREATE INDEX IF NOT EXISTS idx_products_gid ON products(gid);
      CREATE INDEX IF NOT EXISTS idx_customers_gid ON customers(gid);
      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
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

    // Shopify-specific prepared statements
    this.createTokenStmt = db.prepare(
      'INSERT INTO tokens (token, shop_domain, scopes, created_at) VALUES (?, ?, ?, ?)'
    );
    this.getTokenStmt = db.prepare('SELECT * FROM tokens WHERE token = ?');

    this.createOrderStmt = db.prepare(
      'INSERT INTO orders (gid, name, total_price, currency_code, customer_gid, line_items, display_fulfillment_status, display_financial_status, closed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this.updateOrderStmt = db.prepare(
      'UPDATE orders SET name = ?, total_price = ?, currency_code = ?, customer_gid = ?, line_items = ?, updated_at = ? WHERE id = ?'
    );
    this.getOrderStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
    this.getOrderByGidStmt = db.prepare('SELECT * FROM orders WHERE gid = ?');
    this.listOrdersStmt = db.prepare('SELECT * FROM orders ORDER BY id ASC');

    this.createProductStmt = db.prepare(
      'INSERT INTO products (gid, title, description, vendor, product_type, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this.getProductByGidStmt = db.prepare('SELECT * FROM products WHERE gid = ?');
    this.listProductsStmt = db.prepare('SELECT * FROM products ORDER BY id ASC');

    this.createCustomerStmt = db.prepare(
      'INSERT INTO customers (gid, email, first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    this.getCustomerByGidStmt = db.prepare('SELECT * FROM customers WHERE gid = ?');
    this.listCustomersStmt = db.prepare('SELECT * FROM customers ORDER BY id ASC');
    this.updateCustomerStmt = db.prepare(
      'UPDATE customers SET email = ?, first_name = ?, last_name = ?, updated_at = ? WHERE id = ?'
    );

    this.updateProductStmt = db.prepare(
      'UPDATE products SET title = ?, description = ?, vendor = ?, product_type = ?, price = ?, updated_at = ? WHERE id = ?'
    );
    this.createFulfillmentStmt = db.prepare(
      'INSERT INTO fulfillments (gid, order_gid, status, tracking_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    this.getFulfillmentStmt = db.prepare('SELECT * FROM fulfillments WHERE id = ?');
    this.listFulfillmentsStmt = db.prepare('SELECT * FROM fulfillments ORDER BY created_at DESC');

    this.createWebhookSubscriptionStmt = db.prepare(
      'INSERT INTO webhook_subscriptions (topic, callback_url, created_at) VALUES (?, ?, ?)'
    );
    this.listWebhookSubscriptionsStmt = db.prepare('SELECT * FROM webhook_subscriptions ORDER BY created_at DESC');

    this.createErrorConfigStmt = db.prepare(
      'INSERT OR REPLACE INTO error_configs (operation_name, status_code, error_body, delay_ms, enabled) VALUES (?, ?, ?, ?, ?)'
    );
    this.getErrorConfigStmt = db.prepare('SELECT * FROM error_configs WHERE operation_name = ?');
    this.clearErrorConfigsStmt = db.prepare('DELETE FROM error_configs');

    this.updateOrderFulfillmentStatusStmt = db.prepare(
      'UPDATE orders SET display_fulfillment_status = ?, updated_at = ? WHERE id = ?'
    );
    this.updateOrderFinancialStatusStmt = db.prepare(
      'UPDATE orders SET display_financial_status = ?, updated_at = ? WHERE id = ?'
    );
    this.closeOrderStmt = db.prepare(
      'UPDATE orders SET closed_at = ?, updated_at = ? WHERE id = ?'
    );

    // InventoryItem prepared statements
    this.createInventoryItemStmt = db.prepare(
      'INSERT INTO inventory_items (gid, sku, tracked, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    this.getInventoryItemStmt = db.prepare('SELECT * FROM inventory_items WHERE id = ?');
    this.getInventoryItemByGidStmt = db.prepare('SELECT * FROM inventory_items WHERE gid = ?');
    this.listInventoryItemsStmt = db.prepare('SELECT * FROM inventory_items ORDER BY id ASC');
    this.updateInventoryItemStmt = db.prepare(
      'UPDATE inventory_items SET sku = ?, tracked = ?, available = ?, updated_at = ? WHERE id = ?'
    );
  }

  // Shopify-specific methods

  /** Create a token record */
  createToken(token: string, shopDomain: string, scopes: string): void {
    if (!this.createTokenStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    this.createTokenStmt.run(token, shopDomain, scopes, now);
  }

  /** Get a token record by token string */
  getToken(token: string): { token: string; shop_domain: string; scopes: string; created_at: number } | undefined {
    if (!this.getTokenStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getTokenStmt.get(token) as { token: string; shop_domain: string; scopes: string; created_at: number } | undefined;
  }

  /** Create an order and return its ID */
  createOrder(data: { gid: string; name?: string; total_price?: string; currency_code?: string; customer_gid?: string; line_items?: any; financial_status?: string }): number {
    if (!this.createOrderStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    const lineItemsJson = data.line_items ? JSON.stringify(data.line_items) : null;
    const result = this.createOrderStmt.run(
      data.gid,
      data.name ?? null,
      data.total_price ?? null,
      data.currency_code ?? null,
      data.customer_gid ?? null,
      lineItemsJson,
      'UNFULFILLED',
      data.financial_status ?? 'PENDING',
      null, // closed_at
      now,
      now
    );
    return result.lastInsertRowid as number;
  }

  /** Update an existing order by ID, setting updated_at to current timestamp */
  updateOrder(id: number, data: { name?: string; total_price?: string; currency_code?: string; customer_gid?: string; line_items?: any }): void {
    if (!this.updateOrderStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    const lineItemsJson = data.line_items ? JSON.stringify(data.line_items) : null;
    this.updateOrderStmt.run(
      data.name ?? null,
      data.total_price ?? null,
      data.currency_code ?? null,
      data.customer_gid ?? null,
      lineItemsJson,
      now,
      id
    );
  }

  /** Get an order by internal ID */
  getOrder(id: number): any | undefined {
    if (!this.getOrderStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getOrderStmt.get(id);
  }

  /** Get an order by Shopify GID */
  getOrderByGid(gid: string): any | undefined {
    if (!this.getOrderByGidStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getOrderByGidStmt.get(gid);
  }

  /** List all orders */
  listOrders(): any[] {
    if (!this.listOrdersStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.listOrdersStmt.all();
  }

  /** Update the display_fulfillment_status of an order */
  updateOrderFulfillmentStatus(id: number, status: string): void {
    if (!this.updateOrderFulfillmentStatusStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    this.updateOrderFulfillmentStatusStmt.run(status, now, id);
  }

  /** Update the display_financial_status of an order */
  updateOrderFinancialStatus(id: number, status: string): void {
    if (!this.updateOrderFinancialStatusStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    this.updateOrderFinancialStatusStmt.run(status, now, id);
  }

  /** Close an order by setting closed_at to the current unix timestamp */
  closeOrder(id: number): void {
    if (!this.closeOrderStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    this.closeOrderStmt.run(now, now, id);
  }

  /** Create a product and return its ID */
  createProduct(data: { gid: string; title?: string; description?: string; vendor?: string; product_type?: string; price?: string }): number {
    if (!this.createProductStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    const result = this.createProductStmt.run(
      data.gid,
      data.title ?? null,
      data.description ?? null,
      data.vendor ?? null,
      data.product_type ?? null,
      data.price ?? null,
      now,
      now
    );
    return result.lastInsertRowid as number;
  }

  /** Get a product by internal ID */
  getProduct(id: number): any | undefined {
    const stmt = this.database.prepare('SELECT * FROM products WHERE id = ?');
    return stmt.get(id);
  }

  /** Get a product by Shopify GID */
  getProductByGid(gid: string): any | undefined {
    if (!this.getProductByGidStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getProductByGidStmt.get(gid);
  }

  /** List all products */
  listProducts(): any[] {
    if (!this.listProductsStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.listProductsStmt.all();
  }

  /** Update an existing product by ID, setting updated_at to current timestamp */
  updateProduct(id: number, data: { title?: string; description?: string; vendor?: string; product_type?: string; price?: string }): void {
    if (!this.updateProductStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    this.updateProductStmt.run(
      data.title ?? null,
      data.description ?? null,
      data.vendor ?? null,
      data.product_type ?? null,
      data.price ?? null,
      now,
      id
    );
  }

  /** Create a fulfillment and return its ID */
  createFulfillment(data: { gid: string; order_gid?: string; status?: string; tracking_number?: string }): number {
    if (!this.createFulfillmentStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    const result = this.createFulfillmentStmt.run(
      data.gid,
      data.order_gid ?? null,
      data.status ?? 'pending',
      data.tracking_number ?? null,
      now,
      now
    );
    return result.lastInsertRowid as number;
  }

  /** Get a fulfillment by internal ID */
  getFulfillment(id: number): any | undefined {
    if (!this.getFulfillmentStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getFulfillmentStmt.get(id);
  }

  /** List all fulfillments */
  listFulfillments(): any[] {
    if (!this.listFulfillmentsStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.listFulfillmentsStmt.all();
  }

  /** Create a customer and return its ID */
  createCustomer(data: { gid: string; email?: string; first_name?: string; last_name?: string }): number {
    if (!this.createCustomerStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    const result = this.createCustomerStmt.run(
      data.gid,
      data.email ?? null,
      data.first_name ?? null,
      data.last_name ?? null,
      now,
      now
    );
    return result.lastInsertRowid as number;
  }

  /** Get a customer by internal ID */
  getCustomer(id: number): any | undefined {
    const stmt = this.database.prepare('SELECT * FROM customers WHERE id = ?');
    return stmt.get(id);
  }

  /** Get a customer by Shopify GID */
  getCustomerByGid(gid: string): any | undefined {
    if (!this.getCustomerByGidStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getCustomerByGidStmt.get(gid);
  }

  /** List all customers */
  listCustomers(): any[] {
    if (!this.listCustomersStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.listCustomersStmt.all();
  }

  /** Update an existing customer by ID, setting updated_at to current timestamp */
  updateCustomer(id: number, data: { email?: string; first_name?: string; last_name?: string }): void {
    if (!this.updateCustomerStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    this.updateCustomerStmt.run(
      data.email ?? null,
      data.first_name ?? null,
      data.last_name ?? null,
      now,
      id
    );
  }

  /** Create a webhook subscription */
  createWebhookSubscription(topic: string, callbackUrl: string): void {
    if (!this.createWebhookSubscriptionStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    this.createWebhookSubscriptionStmt.run(topic, callbackUrl, now);
  }

  /** List all webhook subscriptions */
  listWebhookSubscriptions(): any[] {
    if (!this.listWebhookSubscriptionsStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.listWebhookSubscriptionsStmt.all();
  }

  /** Create or replace an error configuration */
  createErrorConfig(operationName: string, config: { status_code?: number; error_body?: any; delay_ms?: number; enabled?: boolean }): void {
    if (!this.createErrorConfigStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const errorBodyJson = config.error_body ? JSON.stringify(config.error_body) : null;
    this.createErrorConfigStmt.run(
      operationName,
      config.status_code ?? null,
      errorBodyJson,
      config.delay_ms ?? null,
      config.enabled !== false ? 1 : 0
    );
  }

  /** Get error configuration for an operation */
  getErrorConfig(operationName: string): any | undefined {
    if (!this.getErrorConfigStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getErrorConfigStmt.get(operationName);
  }

  /** Clear all error configurations */
  clearErrorConfigs(): void {
    if (!this.clearErrorConfigsStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    this.clearErrorConfigsStmt.run();
  }

  // InventoryItem methods

  /** Create an inventory item and return its ID */
  createInventoryItem(data: { gid: string; sku?: string; tracked?: boolean; available?: number }): number {
    if (!this.createInventoryItemStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    const result = this.createInventoryItemStmt.run(
      data.gid,
      data.sku ?? null,
      data.tracked !== undefined ? (data.tracked ? 1 : 0) : 1,
      data.available ?? 0,
      now,
      now
    );
    return result.lastInsertRowid as number;
  }

  /** Get an inventory item by internal ID */
  getInventoryItem(id: number): any | undefined {
    if (!this.getInventoryItemStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getInventoryItemStmt.get(id);
  }

  /** Get an inventory item by GID */
  getInventoryItemByGid(gid: string): any | undefined {
    if (!this.getInventoryItemByGidStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.getInventoryItemByGidStmt.get(gid);
  }

  /** List all inventory items */
  listInventoryItems(): any[] {
    if (!this.listInventoryItemsStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    return this.listInventoryItemsStmt.all();
  }

  /** Update an existing inventory item by ID */
  updateInventoryItem(id: number, data: { sku?: string; tracked?: boolean; available?: number }): void {
    if (!this.updateInventoryItemStmt) {
      throw new Error('StateManager not initialized. Call init() first.');
    }
    const now = Math.floor(Date.now() / 1000);
    this.updateInventoryItemStmt.run(
      data.sku ?? null,
      data.tracked !== undefined ? (data.tracked ? 1 : 0) : 1,
      data.available ?? 0,
      now,
      id
    );
  }
}
