/**
 * Unit tests for the conformance response comparator.
 *
 * Tests field normalization (stripping, placeholders, wildcards)
 * and structural comparison of twin vs baseline responses.
 */

import { describe, it, expect } from 'vitest';
import { compareResponses, compareResponsesStructurally } from '../src/comparator.js';
import type { ConformanceResponse, FieldNormalizerConfig } from '../src/types.js';

const emptyNormalizer: FieldNormalizerConfig = {
  stripFields: [],
  normalizeFields: {},
};

function makeResponse(overrides?: Partial<ConformanceResponse>): ConformanceResponse {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: { data: { order: { id: '123', name: '#1001', total: '99.99' } } },
    ...overrides,
  };
}

describe('compareResponses', () => {
  it('identical responses result in passed=true with no differences', () => {
    const response = makeResponse();
    const result = compareResponses(
      'test-1', 'Identical test', 'orders',
      response, response, emptyNormalizer
    );

    expect(result.passed).toBe(true);
    expect(result.differences).toHaveLength(0);
    expect(result.testId).toBe('test-1');
    expect(result.testName).toBe('Identical test');
    expect(result.category).toBe('orders');
  });

  it('different status codes result in failure', () => {
    const twin = makeResponse({ status: 200 });
    const baseline = makeResponse({ status: 201 });

    const result = compareResponses(
      'test-2', 'Status diff', 'orders',
      twin, baseline, emptyNormalizer
    );

    expect(result.passed).toBe(false);
    expect(result.differences.length).toBeGreaterThan(0);
    const statusDiff = result.differences.find(d => d.path === 'status');
    expect(statusDiff).toBeDefined();
    expect(statusDiff!.kind).toBe('changed');
    expect(statusDiff!.lhs).toBe(200);
    expect(statusDiff!.rhs).toBe(201);
  });

  it('different body fields result in failure with differences listed', () => {
    const twin = makeResponse({ body: { data: { name: 'Alice' } } });
    const baseline = makeResponse({ body: { data: { name: 'Bob' } } });

    const result = compareResponses(
      'test-3', 'Body diff', 'customers',
      twin, baseline, emptyNormalizer
    );

    expect(result.passed).toBe(false);
    expect(result.differences.length).toBeGreaterThan(0);
  });

  it('stripped fields are ignored in comparison', () => {
    const twin = makeResponse({
      body: { data: { id: 'twin-id-111', name: '#1001', created_at: '2024-01-01' } },
    });
    const baseline = makeResponse({
      body: { data: { id: 'live-id-222', name: '#1001', created_at: '2024-06-15' } },
    });

    const normalizer: FieldNormalizerConfig = {
      stripFields: ['data.id', 'data.created_at'],
      normalizeFields: {},
    };

    const result = compareResponses(
      'test-4', 'Strip fields', 'orders',
      twin, baseline, normalizer
    );

    expect(result.passed).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it('normalized fields are replaced with placeholders before comparison', () => {
    const twin = makeResponse({
      body: { data: { id: 'gid://shopify/Order/111', name: '#1001' } },
    });
    const baseline = makeResponse({
      body: { data: { id: 'gid://shopify/Order/999', name: '#1001' } },
    });

    const normalizer: FieldNormalizerConfig = {
      stripFields: [],
      normalizeFields: { 'data.id': '<GID>' },
    };

    const result = compareResponses(
      'test-5', 'Normalize GID', 'orders',
      twin, baseline, normalizer
    );

    expect(result.passed).toBe(true);
  });

  it('nested field stripping works', () => {
    const twin = makeResponse({
      body: { data: { order: { id: '1', created_at: 'ts1', name: '#1001' } } },
    });
    const baseline = makeResponse({
      body: { data: { order: { id: '2', created_at: 'ts2', name: '#1001' } } },
    });

    const normalizer: FieldNormalizerConfig = {
      stripFields: ['data.order.id', 'data.order.created_at'],
      normalizeFields: {},
    };

    const result = compareResponses(
      'test-6', 'Nested strip', 'orders',
      twin, baseline, normalizer
    );

    expect(result.passed).toBe(true);
  });

  it('array wildcard strips fields from all elements', () => {
    const twin = makeResponse({
      body: {
        data: {
          edges: [
            { node: { id: 'twin-1', name: 'A' } },
            { node: { id: 'twin-2', name: 'B' } },
          ],
        },
      },
    });
    const baseline = makeResponse({
      body: {
        data: {
          edges: [
            { node: { id: 'live-1', name: 'A' } },
            { node: { id: 'live-2', name: 'B' } },
          ],
        },
      },
    });

    const normalizer: FieldNormalizerConfig = {
      stripFields: ['data.edges.*.node.id'],
      normalizeFields: {},
    };

    const result = compareResponses(
      'test-7', 'Array wildcard strip', 'orders',
      twin, baseline, normalizer
    );

    expect(result.passed).toBe(true);
  });

  it('extra field in twin not in baseline is reported as added', () => {
    const twin = makeResponse({
      body: { data: { name: 'A', extra: 'bonus' } },
    });
    const baseline = makeResponse({
      body: { data: { name: 'A' } },
    });

    const result = compareResponses(
      'test-8', 'Extra field', 'orders',
      twin, baseline, emptyNormalizer
    );

    expect(result.passed).toBe(false);
    const added = result.differences.find(d => d.kind === 'added');
    expect(added).toBeDefined();
    expect(added!.path).toContain('extra');
  });

  it('missing field in twin is reported as deleted', () => {
    const twin = makeResponse({
      body: { data: { name: 'A' } },
    });
    const baseline = makeResponse({
      body: { data: { name: 'A', important: 'field' } },
    });

    const result = compareResponses(
      'test-9', 'Missing field', 'orders',
      twin, baseline, emptyNormalizer
    );

    expect(result.passed).toBe(false);
    const deleted = result.differences.find(d => d.kind === 'deleted');
    expect(deleted).toBeDefined();
    expect(deleted!.path).toContain('important');
  });

  it('passes requirement IDs through to result', () => {
    const response = makeResponse();
    const result = compareResponses(
      'test-10', 'Reqs test', 'orders',
      response, response, emptyNormalizer,
      ['INFRA-05', 'SHOP-03']
    );

    expect(result.requirements).toEqual(['INFRA-05', 'SHOP-03']);
  });

  it('custom normalizer function is applied', () => {
    const twin = makeResponse({
      body: { data: { timestamp: 1000, name: 'A' } },
    });
    const baseline = makeResponse({
      body: { data: { timestamp: 9999, name: 'A' } },
    });

    const normalizer: FieldNormalizerConfig = {
      stripFields: [],
      normalizeFields: {},
      custom: (obj: unknown) => {
        if (obj && typeof obj === 'object' && 'data' in obj) {
          const data = (obj as Record<string, any>).data;
          if (data && 'timestamp' in data) {
            data.timestamp = '<NORMALIZED>';
          }
        }
        return obj;
      },
    };

    const result = compareResponses(
      'test-11', 'Custom normalizer', 'orders',
      twin, baseline, normalizer
    );

    expect(result.passed).toBe(true);
  });
});

describe('compareResponsesStructurally', () => {
  it('detects baseline-only field missing from twin (bidirectional)', () => {
    const twin = makeResponse({ body: { ok: true } });
    const baseline = makeResponse({ body: { ok: true, needed_field: 'value' } });
    const result = compareResponsesStructurally(
      'struct-1', 'baseline field missing from twin', 'test',
      twin, baseline, [], emptyNormalizer
    );
    expect(result.passed).toBe(false);
    const d = result.differences.find(d => d.path.includes('needed_field'));
    expect(d).toBeDefined();
    expect(d!.kind).toBe('deleted');
  });

  it('detects twin-only field not in baseline (original direction)', () => {
    const twin = makeResponse({ body: { ok: true, extra_field: 'bonus' } });
    const baseline = makeResponse({ body: { ok: true } });
    const result = compareResponsesStructurally(
      'struct-2', 'twin extra field', 'test',
      twin, baseline, [], emptyNormalizer
    );
    expect(result.passed).toBe(false);
    const d = result.differences.find(d => d.path.includes('extra_field'));
    expect(d).toBeDefined();
    expect(d!.kind).toBe('added');
  });

  it('detects mismatch in second array element (not just index 0)', () => {
    const twin = makeResponse({
      body: { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] },
    });
    const baseline = makeResponse({
      body: { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B', required: 'yes' }] },
    });
    const result = compareResponsesStructurally(
      'struct-3', 'all array elements', 'test',
      twin, baseline, [], emptyNormalizer
    );
    expect(result.passed).toBe(false);
    const d = result.differences.find(d => d.path.includes('[1]'));
    expect(d).toBeDefined();
  });

  it('detects array length mismatch — extra baseline element reported as deleted', () => {
    const twin = makeResponse({ body: { items: [{ id: 1 }] } });
    const baseline = makeResponse({ body: { items: [{ id: 1 }, { id: 2 }] } });
    const result = compareResponsesStructurally(
      'struct-4', 'array length mismatch', 'test',
      twin, baseline, [], emptyNormalizer
    );
    expect(result.passed).toBe(false);
    const d = result.differences.find(d => d.path.includes('[1]'));
    expect(d).toBeDefined();
    expect(d!.kind).toBe('deleted');
  });

  it('detects array length mismatch — extra twin element reported as added', () => {
    const twin = makeResponse({ body: { items: [{ id: 1 }, { id: 2 }, { id: 3 }] } });
    const baseline = makeResponse({ body: { items: [{ id: 1 }, { id: 2 }] } });
    const result = compareResponsesStructurally(
      'struct-4b', 'array length mismatch twin longer', 'test',
      twin, baseline, [], emptyNormalizer
    );
    expect(result.passed).toBe(false);
    const d = result.differences.find(d => d.path.includes('[2]'));
    expect(d).toBeDefined();
    expect(d!.kind).toBe('added');
  });

  it('sortFields: out-of-order arrays pass after sorting', () => {
    const twin = makeResponse({ body: { channels: ['C2', 'C1', 'C3'] } });
    const baseline = makeResponse({ body: { channels: ['C1', 'C2', 'C3'] } });
    const normalizer: FieldNormalizerConfig = {
      stripFields: [],
      normalizeFields: {},
      sortFields: ['channels'],
    };
    const result = compareResponsesStructurally(
      'struct-5', 'sortFields normalizer', 'test',
      twin, baseline, [], normalizer
    );
    expect(result.passed).toBe(true);
  });

  it('structural mode: identical shape passes even when primitive values differ', () => {
    const twin = makeResponse({ body: { ok: true, ts: '1000.0001', user: 'U_TWIN' } });
    const baseline = makeResponse({ body: { ok: true, ts: '9999.9999', user: 'U_REAL' } });
    const result = compareResponsesStructurally(
      'struct-6', 'primitive values differ — structural passes', 'test',
      twin, baseline, [], emptyNormalizer
    );
    expect(result.passed).toBe(true);
  });

  it('compareValueFields: primitive value mismatch in structural mode is reported', () => {
    const twin = makeResponse({ body: { ok: false, error: 'twin_error' } });
    const baseline = makeResponse({ body: { ok: true, error: 'baseline_error' } });
    const normalizer: FieldNormalizerConfig = {
      stripFields: [],
      normalizeFields: {},
      compareValueFields: ['ok'],
    };
    const result = compareResponsesStructurally(
      'struct-7', 'compareValueFields mismatch', 'test',
      twin, baseline, [], normalizer
    );
    expect(result.passed).toBe(false);
    const d = result.differences.find(d => d.path.includes('ok'));
    expect(d).toBeDefined();
    expect(d!.kind).toBe('changed');
    expect(d!.lhs).toBe(false);
    expect(d!.rhs).toBe(true);
  });

  it('compareValueFields: matching primitive values pass; non-declared differing values are ignored', () => {
    const twin = makeResponse({ body: { ok: true, ts: '1000.0001' } });
    const baseline = makeResponse({ body: { ok: true, ts: '9999.9999' } });
    const normalizer: FieldNormalizerConfig = {
      stripFields: [],
      normalizeFields: {},
      compareValueFields: ['ok'],
    };
    const result = compareResponsesStructurally(
      'struct-8', 'compareValueFields match passes', 'test',
      twin, baseline, [], normalizer
    );
    // ok:true matches; ts differs but NOT in compareValueFields — must pass
    expect(result.passed).toBe(true);
  });

  it('compareValueFields: type mismatch already reported by compareStructure is not double-reported', () => {
    const twin = makeResponse({ body: { ok: 'not-a-boolean', ts: '1000' } });
    const baseline = makeResponse({ body: { ok: true, ts: '1000' } });
    const normalizer: FieldNormalizerConfig = {
      stripFields: [],
      normalizeFields: {},
      compareValueFields: ['ok'],
    };
    const result = compareResponsesStructurally(
      'struct-9', 'compareValueFields dedup', 'test',
      twin, baseline, [], normalizer
    );
    expect(result.passed).toBe(false);
    // compareStructure reports the type mismatch; compareValueFields should NOT add a second diff
    const okDiffs = result.differences.filter(d => d.path === 'body.ok');
    expect(okDiffs).toHaveLength(1);
  });
});
