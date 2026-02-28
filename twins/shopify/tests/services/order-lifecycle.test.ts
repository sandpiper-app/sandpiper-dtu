/**
 * Unit tests for order lifecycle validation functions.
 *
 * Tests verify state machine rules for fulfillment and order close transitions:
 * - validateFulfillment: allows UNFULFILLED, rejects FULFILLED, rejects closed
 * - validateClose: validates fulfillment status + financial status + closedAt
 */

import { describe, it, expect } from 'vitest';
import { validateFulfillment, validateClose } from '../../src/services/order-lifecycle.js';

describe('validateFulfillment', () => {
  it('allows fulfillment when order is UNFULFILLED and open', () => {
    const result = validateFulfillment({
      fulfillmentStatus: 'UNFULFILLED',
      closedAt: null,
    });
    expect(result).toBeNull();
  });

  it('allows fulfillment when order is IN_PROGRESS and open', () => {
    const result = validateFulfillment({
      fulfillmentStatus: 'IN_PROGRESS',
      closedAt: null,
    });
    expect(result).toBeNull();
  });

  it('allows fulfillment when order is PARTIALLY_FULFILLED and open', () => {
    const result = validateFulfillment({
      fulfillmentStatus: 'PARTIALLY_FULFILLED',
      closedAt: null,
    });
    expect(result).toBeNull();
  });

  it('rejects fulfillment when order is already FULFILLED', () => {
    const result = validateFulfillment({
      fulfillmentStatus: 'FULFILLED',
      closedAt: null,
    });
    expect(result).toBe('Order is already fulfilled');
  });

  it('rejects fulfillment when order is closed (closedAt set)', () => {
    const result = validateFulfillment({
      fulfillmentStatus: 'UNFULFILLED',
      closedAt: 1700000000,
    });
    expect(result).toBe('Cannot fulfill a closed order');
  });

  it('rejects fulfillment when order is closed even if status is UNFULFILLED', () => {
    const result = validateFulfillment({
      fulfillmentStatus: 'UNFULFILLED',
      closedAt: 1700000000,
    });
    expect(result).not.toBeNull();
  });
});

describe('validateClose', () => {
  it('allows close when order is FULFILLED and PAID', () => {
    const result = validateClose({
      fulfillmentStatus: 'FULFILLED',
      financialStatus: 'PAID',
      closedAt: null,
    });
    expect(result).toBeNull();
  });

  it('allows close when order is FULFILLED and PARTIALLY_REFUNDED', () => {
    const result = validateClose({
      fulfillmentStatus: 'FULFILLED',
      financialStatus: 'PARTIALLY_REFUNDED',
      closedAt: null,
    });
    expect(result).toBeNull();
  });

  it('allows close when order is FULFILLED and REFUNDED', () => {
    const result = validateClose({
      fulfillmentStatus: 'FULFILLED',
      financialStatus: 'REFUNDED',
      closedAt: null,
    });
    expect(result).toBeNull();
  });

  it('rejects close when order is already closed', () => {
    const result = validateClose({
      fulfillmentStatus: 'FULFILLED',
      financialStatus: 'PAID',
      closedAt: 1700000000,
    });
    expect(result).toBe('Order is already closed');
  });

  it('rejects close when order is UNFULFILLED', () => {
    const result = validateClose({
      fulfillmentStatus: 'UNFULFILLED',
      financialStatus: 'PAID',
      closedAt: null,
    });
    expect(result).toBe('Order must be fully fulfilled before closing');
  });

  it('rejects close when order is PARTIALLY_FULFILLED', () => {
    const result = validateClose({
      fulfillmentStatus: 'PARTIALLY_FULFILLED',
      financialStatus: 'PAID',
      closedAt: null,
    });
    expect(result).toBe('Order must be fully fulfilled before closing');
  });

  it('rejects close when order is IN_PROGRESS', () => {
    const result = validateClose({
      fulfillmentStatus: 'IN_PROGRESS',
      financialStatus: 'PAID',
      closedAt: null,
    });
    expect(result).toBe('Order must be fully fulfilled before closing');
  });

  it('rejects close when financial status is PENDING', () => {
    const result = validateClose({
      fulfillmentStatus: 'FULFILLED',
      financialStatus: 'PENDING',
      closedAt: null,
    });
    expect(result).toBe('Order must have completed financial transactions before closing');
  });

  it('rejects close when financial status is AUTHORIZED', () => {
    const result = validateClose({
      fulfillmentStatus: 'FULFILLED',
      financialStatus: 'AUTHORIZED',
      closedAt: null,
    });
    expect(result).toBe('Order must have completed financial transactions before closing');
  });

  it('checks already-closed before fulfillment status (closedAt takes priority)', () => {
    const result = validateClose({
      fulfillmentStatus: 'UNFULFILLED',
      financialStatus: 'PENDING',
      closedAt: 1700000000,
    });
    expect(result).toBe('Order is already closed');
  });
});
