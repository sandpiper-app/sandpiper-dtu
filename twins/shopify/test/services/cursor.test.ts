/**
 * Unit tests for cursor encode/decode utilities.
 *
 * Tests verify:
 * - Encode/decode roundtrip for each resource type
 * - Decode rejects cursor with wrong resource type (cross-resource injection)
 * - Decode rejects invalid base64
 * - Decode rejects malformed cursor format
 */

import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../../src/services/cursor.js';

describe('Cursor utilities', () => {
  describe('encodeCursor', () => {
    it('encodes Order cursor with correct base64 format', () => {
      const cursor = encodeCursor('Order', 42);
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      expect(decoded).toBe('arrayconnection:Order:42');
    });

    it('encodes Product cursor with correct base64 format', () => {
      const cursor = encodeCursor('Product', 100);
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      expect(decoded).toBe('arrayconnection:Product:100');
    });

    it('encodes Customer cursor with correct base64 format', () => {
      const cursor = encodeCursor('Customer', 7);
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      expect(decoded).toBe('arrayconnection:Customer:7');
    });
  });

  describe('decodeCursor', () => {
    it('roundtrip encode/decode for Order', () => {
      const id = 42;
      const cursor = encodeCursor('Order', id);
      const decodedId = decodeCursor(cursor, 'Order');
      expect(decodedId).toBe(id);
    });

    it('roundtrip encode/decode for Product', () => {
      const id = 100;
      const cursor = encodeCursor('Product', id);
      const decodedId = decodeCursor(cursor, 'Product');
      expect(decodedId).toBe(id);
    });

    it('roundtrip encode/decode for Customer', () => {
      const id = 7;
      const cursor = encodeCursor('Customer', id);
      const decodedId = decodeCursor(cursor, 'Customer');
      expect(decodedId).toBe(id);
    });

    it('rejects Order cursor when decoded as Product (cross-resource injection)', () => {
      const cursor = encodeCursor('Order', 1);
      expect(() => decodeCursor(cursor, 'Product')).toThrow(
        /expected resource type "Product", got "Order"/
      );
    });

    it('rejects Product cursor when decoded as Customer', () => {
      const cursor = encodeCursor('Product', 5);
      expect(() => decodeCursor(cursor, 'Customer')).toThrow(
        /expected resource type "Customer", got "Product"/
      );
    });

    it('rejects Customer cursor when decoded as Order', () => {
      const cursor = encodeCursor('Customer', 99);
      expect(() => decodeCursor(cursor, 'Order')).toThrow(
        /expected resource type "Order", got "Customer"/
      );
    });

    it('rejects completely invalid base64 string', () => {
      // Not valid base64 — Buffer.from handles it but it decodes to garbage
      // The malformed format check will catch it
      expect(() => decodeCursor('!!!not-base64!!!', 'Order')).toThrow(/Invalid cursor/);
    });

    it('rejects cursor with malformed format (missing arrayconnection prefix)', () => {
      const malformed = Buffer.from('wrongprefix:Order:1').toString('base64');
      expect(() => decodeCursor(malformed, 'Order')).toThrow(/Invalid cursor format/);
    });

    it('rejects cursor with only two colon-separated parts', () => {
      const malformed = Buffer.from('arrayconnection:Order').toString('base64');
      expect(() => decodeCursor(malformed, 'Order')).toThrow(/Invalid cursor format/);
    });

    it('rejects cursor where ID part is not a number', () => {
      const malformed = Buffer.from('arrayconnection:Order:notanumber').toString('base64');
      expect(() => decodeCursor(malformed, 'Order')).toThrow(/ID component is not a number/);
    });
  });
});
