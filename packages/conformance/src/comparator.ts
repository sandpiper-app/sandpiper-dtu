/**
 * Response comparator with field normalization
 *
 * Compares twin responses against baseline (live or fixture) responses.
 * Supports two comparison modes:
 * - Value comparison (twin/offline mode): deep-diff with field normalization
 * - Structural comparison (live mode): compares response shape (keys + types)
 *   without comparing actual values, since twin and live APIs have different data.
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
 * Compare two responses after applying field normalization (value comparison).
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
        differences.push({ path, kind: 'deleted', rhs: d.rhs });
      } else if (d.kind === 'D') {
        differences.push({ path, kind: 'added', lhs: d.lhs });
      } else if (d.kind === 'E') {
        differences.push({ path, kind: 'changed', lhs: d.lhs, rhs: d.rhs });
      } else if (d.kind === 'A') {
        differences.push({
          path: `${path}[${d.index}]`,
          kind: 'array',
          lhs: d.item?.lhs,
          rhs: d.item?.rhs,
        });
      }
    }
  }

  return { testId, testName, category, passed: differences.length === 0, differences, requirements };
}

/**
 * Structural comparison for live mode.
 *
 * Verifies that the twin's response has the same shape as the baseline:
 * - Status codes must match
 * - Every key in the twin's body must exist in the baseline with a compatible type
 * - Extra keys in the baseline are acceptable (twin can be a simplified subset)
 * - Array lengths can differ; only the first element's structure is compared
 * - Primitive values can differ as long as types match
 */
export function compareResponsesStructurally(
  testId: string,
  testName: string,
  category: string,
  twin: ConformanceResponse,
  baseline: ConformanceResponse,
  requirements: string[] = []
): ComparisonResult {
  const differences: Difference[] = [];

  // Status codes must match exactly
  if (twin.status !== baseline.status) {
    differences.push({
      path: 'status',
      kind: 'changed',
      lhs: twin.status,
      rhs: baseline.status,
    });
  }

  // Compare body structure recursively
  compareStructure(twin.body, baseline.body, 'body', differences);

  return { testId, testName, category, passed: differences.length === 0, differences, requirements };
}

/** Get the structural type of a value */
function getType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Recursively compare the structure of two values.
 * Only flags: type mismatches, twin keys not present in baseline.
 */
function compareStructure(
  twin: unknown,
  baseline: unknown,
  path: string,
  differences: Difference[]
): void {
  const twinType = getType(twin);
  const baselineType = getType(baseline);

  if (twinType !== baselineType) {
    differences.push({
      path,
      kind: 'changed',
      lhs: `[type: ${twinType}]`,
      rhs: `[type: ${baselineType}]`,
    });
    return;
  }

  if (twinType === 'object') {
    const twinObj = twin as Record<string, unknown>;
    const baselineObj = baseline as Record<string, unknown>;

    for (const key of Object.keys(twinObj)) {
      if (!(key in baselineObj)) {
        differences.push({
          path: `${path}.${key}`,
          kind: 'added',
          lhs: `[type: ${getType(twinObj[key])}]`,
        });
      } else {
        compareStructure(twinObj[key], baselineObj[key], `${path}.${key}`, differences);
      }
    }
    return;
  }

  if (twinType === 'array') {
    const twinArr = twin as unknown[];
    const baselineArr = baseline as unknown[];
    if (twinArr.length > 0 && baselineArr.length > 0) {
      compareStructure(twinArr[0], baselineArr[0], `${path}[0]`, differences);
    }
    return;
  }
  // Primitives: types already match, values can differ — no difference reported
}

/**
 * Apply normalization to a response: strip fields, replace with placeholders.
 */
function normalizeResponse(
  response: ConformanceResponse,
  normalizer: FieldNormalizerConfig
): ConformanceResponse {
  // Only keep semantically meaningful headers (content-type).
  const { 'content-type': contentType } = response.headers;
  const normalized: ConformanceResponse = {
    status: response.status,
    headers: contentType ? { 'content-type': contentType } : {},
    body: deepClone(response.body),
  };

  // Strip fields from body (normalizer paths are relative to body)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const fieldPath of normalizer.stripFields) {
    stripField(normalized.body as any, fieldPath);
  }

  // Normalize fields in body (replace with placeholders)
  for (const [fieldPath, placeholder] of Object.entries(normalizer.normalizeFields)) {
    normalizeField(normalized.body as any, fieldPath, placeholder);
  }

  // Apply custom normalizer if provided
  if (normalizer.custom) {
    normalized.body = normalizer.custom(normalized.body);
  }

  return normalized;
}

function deepClone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function stripField(obj: Record<string, unknown>, fieldPath: string): void {
  if (obj === null || obj === undefined || typeof obj !== 'object') return;
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
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (!isLast) stripFieldRecursive(item, parts, index + 1);
      }
    } else {
      for (const key of Object.keys(obj)) {
        if (isLast) {
          delete (obj as Record<string, unknown>)[key];
        } else {
          stripFieldRecursive((obj as Record<string, unknown>)[key], parts, index + 1);
        }
      }
    }
    return;
  }

  if (isLast) {
    if (!Array.isArray(obj)) delete (obj as Record<string, unknown>)[current];
  } else {
    const next = (obj as Record<string, unknown>)[current];
    if (Array.isArray(next) && parts[index + 1] === '*') {
      for (const item of next) {
        stripFieldRecursive(item, parts, index + 2);
      }
    } else {
      stripFieldRecursive(next, parts, index + 1);
    }
  }
}

function normalizeField(
  obj: Record<string, unknown>,
  fieldPath: string,
  placeholder: string
): void {
  if (obj === null || obj === undefined || typeof obj !== 'object') return;
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
        if (!isLast) normalizeFieldRecursive(item, parts, index + 1, placeholder);
      }
    } else {
      for (const key of Object.keys(obj)) {
        if (isLast) {
          (obj as Record<string, unknown>)[key] = placeholder;
        } else {
          normalizeFieldRecursive((obj as Record<string, unknown>)[key], parts, index + 1, placeholder);
        }
      }
    }
    return;
  }

  if (isLast) {
    if (!Array.isArray(obj) && current in (obj as Record<string, unknown>)) {
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
