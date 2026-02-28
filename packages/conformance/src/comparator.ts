/**
 * Response comparator with field normalization
 *
 * Compares twin responses against baseline (live or fixture) responses.
 * Supports stripping non-deterministic fields (IDs, timestamps) and
 * replacing fields with placeholders before comparison.
 *
 * Uses deep-diff for structural comparison.
 */

// deep-diff is a CommonJS module; use default import for ESM interop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import deepDiffModule from 'deep-diff';
const diff = (deepDiffModule as any).diff ?? deepDiffModule;
import type {
  ConformanceResponse,
  FieldNormalizerConfig,
  ComparisonResult,
  Difference,
} from './types.js';

/**
 * Compare two responses after applying field normalization.
 *
 * @param testId - Unique test identifier
 * @param testName - Human-readable test name
 * @param category - Test category for grouping
 * @param twin - Response from the twin
 * @param baseline - Response from the real API or fixture
 * @param normalizer - Field normalization config
 * @param requirements - Requirement IDs this test validates
 * @returns Comparison result with pass/fail and differences
 */
export function compareResponses(
  testId: string,
  testName: string,
  category: string,
  twin: ConformanceResponse,
  baseline: ConformanceResponse,
  normalizer: FieldNormalizerConfig,
  requirements: string[] = []
): ComparisonResult {
  // Normalize both responses
  const normalizedTwin = normalizeResponse(twin, normalizer);
  const normalizedBaseline = normalizeResponse(baseline, normalizer);

  // Compare using deep-diff
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diffs = diff(normalizedTwin as any, normalizedBaseline as any) as
    | Array<{ kind: string; path?: string[]; lhs?: unknown; rhs?: unknown; index?: number; item?: { lhs?: unknown; rhs?: unknown } }>
    | undefined;

  const differences: Difference[] = [];
  if (diffs) {
    for (const d of diffs) {
      const path = d.path ? d.path.join('.') : '<root>';

      if (d.kind === 'N') {
        // New in baseline (missing in twin)
        differences.push({
          path,
          kind: 'deleted',
          rhs: d.rhs,
        });
      } else if (d.kind === 'D') {
        // Deleted from baseline (extra in twin)
        differences.push({
          path,
          kind: 'added',
          lhs: d.lhs,
        });
      } else if (d.kind === 'E') {
        // Edited (different values)
        differences.push({
          path,
          kind: 'changed',
          lhs: d.lhs,
          rhs: d.rhs,
        });
      } else if (d.kind === 'A') {
        // Array change
        differences.push({
          path: `${path}[${d.index}]`,
          kind: 'array',
          lhs: d.item?.lhs,
          rhs: d.item?.rhs,
        });
      }
    }
  }

  return {
    testId,
    testName,
    category,
    passed: differences.length === 0,
    differences,
    requirements,
  };
}

/**
 * Apply normalization to a response: strip fields, replace with placeholders.
 */
function normalizeResponse(
  response: ConformanceResponse,
  normalizer: FieldNormalizerConfig
): ConformanceResponse {
  // Deep clone to avoid mutating original
  const normalized: ConformanceResponse = {
    status: response.status,
    headers: { ...response.headers },
    body: deepClone(response.body),
  };

  // Strip fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const fieldPath of normalizer.stripFields) {
    stripField(normalized as any, fieldPath);
  }

  // Normalize fields (replace with placeholders)
  for (const [fieldPath, placeholder] of Object.entries(normalizer.normalizeFields)) {
    normalizeField(normalized as any, fieldPath, placeholder);
  }

  // Apply custom normalizer if provided
  if (normalizer.custom) {
    normalized.body = normalizer.custom(normalized.body);
  }

  return normalized;
}

/**
 * Deep clone a value using JSON serialization.
 */
function deepClone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Strip a field from a response using dot-notation path with wildcard support.
 *
 * Examples:
 * - "body.id" strips response.body.id
 * - "body.edges.*.node.id" strips id from all nodes in edges array
 * - "status" strips response.status
 */
function stripField(obj: Record<string, unknown>, fieldPath: string): void {
  const parts = fieldPath.split('.');
  stripFieldRecursive(obj, parts, 0);
}

function stripFieldRecursive(
  obj: unknown,
  parts: string[],
  index: number
): void {
  if (obj === null || obj === undefined || typeof obj !== 'object') return;

  const current = parts[index];
  const isLast = index === parts.length - 1;

  if (current === '*') {
    // Wildcard: iterate over all elements (array or object values)
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (isLast) {
          // Can't delete from array with wildcard as last
          continue;
        }
        stripFieldRecursive(item, parts, index + 1);
      }
    } else {
      for (const key of Object.keys(obj)) {
        if (isLast) {
          delete (obj as Record<string, unknown>)[key];
        } else {
          stripFieldRecursive(
            (obj as Record<string, unknown>)[key],
            parts,
            index + 1
          );
        }
      }
    }
    return;
  }

  if (isLast) {
    if (Array.isArray(obj)) return;
    delete (obj as Record<string, unknown>)[current];
  } else {
    const next = (obj as Record<string, unknown>)[current];
    if (Array.isArray(next) && parts[index + 1] === '*') {
      // Next is array and next part is wildcard
      for (const item of next) {
        stripFieldRecursive(item, parts, index + 2);
      }
    } else {
      stripFieldRecursive(next, parts, index + 1);
    }
  }
}

/**
 * Replace a field's value with a placeholder using dot-notation path with wildcard support.
 */
function normalizeField(
  obj: Record<string, unknown>,
  fieldPath: string,
  placeholder: string
): void {
  const parts = fieldPath.split('.');
  normalizeFieldRecursive(obj, parts, 0, placeholder);
}

function normalizeFieldRecursive(
  obj: unknown,
  parts: string[],
  index: number,
  placeholder: string
): void {
  if (obj === null || obj === undefined || typeof obj !== 'object') return;

  const current = parts[index];
  const isLast = index === parts.length - 1;

  if (current === '*') {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (isLast) {
          // Can't normalize array element without key
          continue;
        }
        normalizeFieldRecursive(item, parts, index + 1, placeholder);
      }
    } else {
      for (const key of Object.keys(obj)) {
        if (isLast) {
          (obj as Record<string, unknown>)[key] = placeholder;
        } else {
          normalizeFieldRecursive(
            (obj as Record<string, unknown>)[key],
            parts,
            index + 1,
            placeholder
          );
        }
      }
    }
    return;
  }

  if (isLast) {
    if (Array.isArray(obj)) return;
    if (current in (obj as Record<string, unknown>)) {
      (obj as Record<string, unknown>)[current] = placeholder;
    }
  } else {
    const next = (obj as Record<string, unknown>)[current];
    if (Array.isArray(next) && parts[index + 1] === '*') {
      for (const item of next) {
        normalizeFieldRecursive(item, parts, index + 2, placeholder);
      }
    } else {
      normalizeFieldRecursive(next, parts, index + 1, placeholder);
    }
  }
}
