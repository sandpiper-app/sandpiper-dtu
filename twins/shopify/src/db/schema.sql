-- Shopify Twin Database Schema
-- This file documents the database schema for the Shopify twin.
-- Actual migrations are run by StateManager.

-- OAuth tokens
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gid TEXT UNIQUE NOT NULL,                            -- Shopify GID: gid://shopify/Order/{id}
  name TEXT,                                           -- Order name: #1001
  total_price TEXT,                                    -- Total price as string
  currency_code TEXT,                                  -- Currency code: USD
  customer_gid TEXT,                                   -- Reference to customer GID
  line_items TEXT,                                     -- JSON array of line items
  display_fulfillment_status TEXT DEFAULT 'UNFULFILLED', -- Fulfillment lifecycle status
  display_financial_status TEXT DEFAULT 'PENDING',     -- Financial lifecycle status
  closed_at INTEGER,                                   -- Unix timestamp when order was closed, NULL if open
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_gid ON orders(gid);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gid TEXT UNIQUE NOT NULL,          -- Shopify GID: gid://shopify/Product/{id}
  title TEXT,                         -- Product title
  description TEXT,                   -- Product description
  vendor TEXT,                        -- Product vendor
  product_type TEXT,                  -- Product type
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_gid ON products(gid);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gid TEXT UNIQUE NOT NULL,          -- Shopify GID: gid://shopify/Customer/{id}
  email TEXT UNIQUE,                  -- Customer email
  first_name TEXT,                    -- First name
  last_name TEXT,                     -- Last name
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_gid ON customers(gid);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- Inventory Items
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gid TEXT UNIQUE NOT NULL,          -- Shopify GID: gid://shopify/InventoryItem/{id}
  sku TEXT,                           -- Stock keeping unit
  tracked BOOLEAN,                    -- Whether inventory is tracked
  available INTEGER,                  -- Available quantity
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Fulfillments
CREATE TABLE IF NOT EXISTS fulfillments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gid TEXT UNIQUE NOT NULL,          -- Shopify GID: gid://shopify/Fulfillment/{id}
  order_gid TEXT,                     -- Reference to order GID
  status TEXT,                        -- Fulfillment status
  tracking_number TEXT,               -- Tracking number
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Webhook Subscriptions
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,               -- Webhook topic: orders/create, products/update, etc.
  callback_url TEXT NOT NULL,        -- URL to POST webhook payload to
  created_at INTEGER NOT NULL
);

-- Error Simulation Configuration
CREATE TABLE IF NOT EXISTS error_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_name TEXT UNIQUE NOT NULL, -- GraphQL operation name
  status_code INTEGER,                  -- HTTP status code to return
  error_body TEXT,                      -- JSON error body
  delay_ms INTEGER,                     -- Delay before response (for timeout simulation)
  enabled BOOLEAN DEFAULT 1             -- Whether error simulation is enabled
);
