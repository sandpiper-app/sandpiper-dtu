/**
 * Unit tests for the conformance response comparator.
 *
 * Tests field normalization (stripping, placeholders, wildcards)
 * and structural comparison of twin vs baseline responses.
 */

import { describe, it, expect } from 'vitest';
import { compareResponses } from '../src/comparator.js';
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
