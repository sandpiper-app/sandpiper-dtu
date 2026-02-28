/**
 * Order lifecycle state machine validation.
 *
 * Shopify orders follow a lifecycle with strict state transition rules:
 * - New orders default to UNFULFILLED / PENDING
 * - A fulfillment must be created to transition to FULFILLED
 * - An order may only be closed when FULFILLED and financially complete (PAID/PARTIALLY_REFUNDED/REFUNDED)
 *
 * Exports validateFulfillment and validateClose which return a string error message
 * on invalid transitions, or null when the transition is allowed.
 */

export type FulfillmentStatus = 'UNFULFILLED' | 'IN_PROGRESS' | 'PARTIALLY_FULFILLED' | 'FULFILLED';
export type FinancialStatus = 'PENDING' | 'AUTHORIZED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

/**
 * Validate that a fulfillment can be created for the given order.
 *
 * @returns null if allowed, or an error message string if the transition is invalid
 */
export function validateFulfillment(order: {
  fulfillmentStatus: FulfillmentStatus;
  closedAt: number | null;
}): string | null {
  if (order.closedAt !== null) {
    return 'Cannot fulfill a closed order';
  }
  if (order.fulfillmentStatus === 'FULFILLED') {
    return 'Order is already fulfilled';
  }
  return null;
}

/**
 * Validate that an order can be closed.
 *
 * @returns null if allowed, or an error message string if the transition is invalid
 */
export function validateClose(order: {
  fulfillmentStatus: FulfillmentStatus;
  financialStatus: FinancialStatus;
  closedAt: number | null;
}): string | null {
  if (order.closedAt !== null) {
    return 'Order is already closed';
  }
  if (order.fulfillmentStatus !== 'FULFILLED') {
    return 'Order must be fully fulfilled before closing';
  }
  const completedFinancialStatuses: FinancialStatus[] = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];
  if (!completedFinancialStatuses.includes(order.financialStatus)) {
    return 'Order must have completed financial transactions before closing';
  }
  return null;
}
