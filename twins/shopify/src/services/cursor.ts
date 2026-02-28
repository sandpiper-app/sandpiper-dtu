/**
 * Cursor utilities for Relay-spec cursor-based pagination
 *
 * Cursors encode a resource type and numeric ID to prevent cross-resource cursor injection.
 * Format (before base64): "arrayconnection:{ResourceType}:{id}"
 *
 * This matches the research recommendation (Pitfall 5): including the resource type in the
 * cursor encoding ensures that a cursor from one connection (e.g. Order) cannot be injected
 * into a different connection (e.g. Product).
 */

/**
 * Encode a cursor for a given resource type and numeric ID.
 * Returns a base64 string.
 */
export function encodeCursor(resourceType: string, id: number): string {
  return Buffer.from(`arrayconnection:${resourceType}:${id}`).toString('base64');
}

/**
 * Decode a cursor string, validate it matches the expected resource type, and return the numeric ID.
 *
 * Throws if:
 * - The cursor is not valid base64
 * - The decoded string does not match the "arrayconnection:{ResourceType}:{id}" format
 * - The resource type in the cursor does not match `expectedType`
 */
export function decodeCursor(cursor: string, expectedType: string): number {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64').toString('utf8');
  } catch {
    throw new Error(`Invalid cursor: not valid base64`);
  }

  const parts = decoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'arrayconnection') {
    throw new Error(`Invalid cursor format: expected "arrayconnection:{type}:{id}", got "${decoded}"`);
  }

  const [, resourceType, idStr] = parts;

  if (resourceType !== expectedType) {
    throw new Error(
      `Invalid cursor: expected resource type "${expectedType}", got "${resourceType}". Cross-resource cursor injection rejected.`
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    throw new Error(`Invalid cursor: ID component is not a number: "${idStr}"`);
  }

  return id;
}
