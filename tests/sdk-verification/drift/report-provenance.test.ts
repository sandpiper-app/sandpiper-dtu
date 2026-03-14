/**
 * Unit tests for coverage report provenance and freshness validators (INFRA-25)
 *
 * These tests prove the negative cases:
 *   - Missing provenance.evidenceSource fails
 *   - Stale generatedAt (older than artifact timestamps) fails
 *   - Legacy top-level testFile field in any symbol entry fails
 *   - A well-formed Phase 40 report with fresh artifacts passes
 */

import { describe, it, expect } from 'vitest';
import {
  validateCoverageReportTruthfulness,
  type ValidationResult,
} from './report-provenance.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Build a minimal well-formed Phase 40-shaped coverage report. */
function makeValidReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: '2026-03-14T20:00:13.598Z',
    phase: '40',
    evidenceSource: 'runtime-symbol-execution',
    executionArtifact: 'tests/sdk-verification/coverage/symbol-execution.json',
    vitestArtifact: 'tests/sdk-verification/coverage/vitest-evidence.json',
    provenance: {
      evidenceSource: 'runtime-symbol-execution',
      executionArtifact: 'tests/sdk-verification/coverage/symbol-execution.json',
      vitestArtifact: 'tests/sdk-verification/coverage/vitest-evidence.json',
      symbolExecutionGeneratedAt: '2026-03-14T20:00:05.482Z',
      totalSymbolHits: 226,
    },
    summary: { live: 222, deferred: 50 },
    packages: {
      '@shopify/admin-api-client@1.1.1': {
        createAdminApiClient: {
          tier: 'live',
          evidence: {
            hitCount: 11,
            testFiles: ['tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts'],
          },
        },
      },
    },
    ...overrides,
  };
}

/**
 * Build a minimal fake symbol-execution.json content (not disk-read).
 * The validator is pure — it accepts these artifacts as parsed objects.
 */
function makeSymbolExecution(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: '2026-03-14T20:00:05.482Z',
    hitCount: 351,
    hits: [],
    ...overrides,
  };
}

/**
 * Build a minimal fake vitest-evidence.json content (not disk-read).
 */
function makeVitestEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    startTime: 1773518379509, // 2026-03-14T15:59:39.509Z (earlier than generatedAt)
    numTotalTestSuites: 86,
    numPassedTestSuites: 86,
    testResults: [],
    ...overrides,
  };
}

// ── Test 1: Missing provenance.evidenceSource ─────────────────────────────────

describe('validateCoverageReportTruthfulness — missing provenance', () => {
  it('fails when provenance block is absent from the report', () => {
    const report = makeValidReport({ provenance: undefined });
    const symbolExec = makeSymbolExecution();
    const vitestEvidence = makeVitestEvidence();

    const result: ValidationResult = validateCoverageReportTruthfulness(
      report,
      symbolExec,
      vitestEvidence
    );

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/provenance/i);
  });

  it('fails when provenance.evidenceSource is missing', () => {
    const report = makeValidReport({
      provenance: {
        executionArtifact: 'tests/sdk-verification/coverage/symbol-execution.json',
        vitestArtifact: 'tests/sdk-verification/coverage/vitest-evidence.json',
        symbolExecutionGeneratedAt: '2026-03-14T20:00:05.482Z',
        totalSymbolHits: 226,
        // evidenceSource intentionally omitted
      },
    });
    const result = validateCoverageReportTruthfulness(
      report,
      makeSymbolExecution(),
      makeVitestEvidence()
    );

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/evidenceSource/i);
  });

  it('fails when provenance.evidenceSource is not "runtime-symbol-execution"', () => {
    const report = makeValidReport({
      provenance: {
        evidenceSource: 'hand-authored-evidence-map',
        executionArtifact: 'tests/sdk-verification/coverage/symbol-execution.json',
        vitestArtifact: 'tests/sdk-verification/coverage/vitest-evidence.json',
        symbolExecutionGeneratedAt: '2026-03-14T20:00:05.482Z',
        totalSymbolHits: 226,
      },
    });
    const result = validateCoverageReportTruthfulness(
      report,
      makeSymbolExecution(),
      makeVitestEvidence()
    );

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/runtime-symbol-execution/i);
  });

  it('fails when provenance.executionArtifact is missing', () => {
    const report = makeValidReport({
      provenance: {
        evidenceSource: 'runtime-symbol-execution',
        // executionArtifact intentionally omitted
        vitestArtifact: 'tests/sdk-verification/coverage/vitest-evidence.json',
        symbolExecutionGeneratedAt: '2026-03-14T20:00:05.482Z',
        totalSymbolHits: 226,
      },
    });
    const result = validateCoverageReportTruthfulness(
      report,
      makeSymbolExecution(),
      makeVitestEvidence()
    );

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/executionArtifact/i);
  });

  it('fails when provenance.vitestArtifact is missing', () => {
    const report = makeValidReport({
      provenance: {
        evidenceSource: 'runtime-symbol-execution',
        executionArtifact: 'tests/sdk-verification/coverage/symbol-execution.json',
        // vitestArtifact intentionally omitted
        symbolExecutionGeneratedAt: '2026-03-14T20:00:05.482Z',
        totalSymbolHits: 226,
      },
    });
    const result = validateCoverageReportTruthfulness(
      report,
      makeSymbolExecution(),
      makeVitestEvidence()
    );

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/vitestArtifact/i);
  });
});

// ── Test 2: Stale generatedAt ─────────────────────────────────────────────────

describe('validateCoverageReportTruthfulness — stale report', () => {
  it('fails when coverage-report.json generatedAt is older than symbol-execution.json generatedAt', () => {
    // report generatedAt is BEFORE symbol-execution generatedAt → stale
    const report = makeValidReport({ generatedAt: '2026-03-14T19:00:00.000Z' });
    const symbolExec = makeSymbolExecution({ generatedAt: '2026-03-14T20:00:05.482Z' });
    const vitestEvidence = makeVitestEvidence({ startTime: 1773514800000 }); // 19:00:00 UTC

    const result = validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence);

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/stale|generatedAt|freshness/i);
  });

  it('fails when coverage-report.json generatedAt is older than vitest-evidence.json startTime', () => {
    // vitest startTime is 2026-03-14T21:00:00Z, report generatedAt is earlier
    const vitestStartMs = new Date('2026-03-14T21:00:00.000Z').getTime();
    const report = makeValidReport({ generatedAt: '2026-03-14T20:00:13.598Z' });
    const symbolExec = makeSymbolExecution({ generatedAt: '2026-03-14T19:00:00.000Z' }); // older than report — fine
    const vitestEvidence = makeVitestEvidence({ startTime: vitestStartMs }); // newer than report — fail

    const result = validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence);

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/stale|vitest|freshness/i);
  });

  it('fails when symbol-execution.json generatedAt is missing', () => {
    const report = makeValidReport();
    const symbolExec = makeSymbolExecution({ generatedAt: undefined });
    const vitestEvidence = makeVitestEvidence();

    const result = validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence);

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/generatedAt|symbol-execution/i);
  });

  it('fails when symbol-execution.json generatedAt is unparsable', () => {
    const report = makeValidReport();
    const symbolExec = makeSymbolExecution({ generatedAt: 'not-a-date' });
    const vitestEvidence = makeVitestEvidence();

    const result = validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence);

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/generatedAt|unparsable|symbol-execution/i);
  });

  it('fails when vitest-evidence.json startTime is missing', () => {
    const report = makeValidReport();
    const symbolExec = makeSymbolExecution();
    const vitestEvidence = makeVitestEvidence({ startTime: undefined });

    const result = validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence);

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/startTime|vitest/i);
  });

  it('fails when coverage-report.json generatedAt is missing', () => {
    const report = makeValidReport({ generatedAt: undefined });
    const result = validateCoverageReportTruthfulness(
      report,
      makeSymbolExecution(),
      makeVitestEvidence()
    );

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/generatedAt/i);
  });
});

// ── Test 3: Legacy top-level testFile field ────────────────────────────────────

describe('validateCoverageReportTruthfulness — legacy testFile field', () => {
  it('fails when any symbol entry contains a top-level testFile field', () => {
    const report = makeValidReport({
      packages: {
        '@shopify/admin-api-client@1.1.1': {
          createAdminApiClient: {
            tier: 'live',
            testFile: 'tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts', // legacy shape
            evidence: {
              hitCount: 11,
              testFiles: ['tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts'],
            },
          },
        },
      },
    });
    const result = validateCoverageReportTruthfulness(
      report,
      makeSymbolExecution(),
      makeVitestEvidence()
    );

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/testFile|legacy/i);
  });

  it('fails when multiple symbol entries contain legacy testFile field', () => {
    const report = makeValidReport({
      packages: {
        '@shopify/admin-api-client@1.1.1': {
          createAdminApiClient: {
            tier: 'live',
            testFile: 'tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts',
          },
          AdminApiClient: {
            tier: 'live',
            testFile: 'tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts',
          },
        },
      },
    });
    const result = validateCoverageReportTruthfulness(
      report,
      makeSymbolExecution(),
      makeVitestEvidence()
    );

    expect(result.ok).toBe(false);
    expect(result.rule).toMatch(/testFile|legacy/i);
  });

  it('does NOT fail for deferred symbol entries without testFile', () => {
    // deferred entries have no evidence/testFile — this is allowed
    const report = makeValidReport({
      packages: {
        '@shopify/admin-api-client@1.1.1': {
          AdminQueries: {
            tier: 'deferred',
            evidence: null,
          },
        },
      },
    });
    const result = validateCoverageReportTruthfulness(
      report,
      makeSymbolExecution(),
      makeVitestEvidence()
    );

    expect(result.ok).toBe(true);
  });
});

// ── Test 4: Passing Phase 40-shaped report ────────────────────────────────────

describe('validateCoverageReportTruthfulness — valid Phase 40 report', () => {
  it('passes for a report with runtime-symbol-execution provenance and fresh artifacts', () => {
    const report = makeValidReport();
    const symbolExec = makeSymbolExecution();
    const vitestEvidence = makeVitestEvidence();

    const result = validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence);

    expect(result.ok).toBe(true);
    expect(result.rule).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  it('passes when report generatedAt exactly equals symbol-execution generatedAt', () => {
    const ts = '2026-03-14T20:00:13.598Z';
    const report = makeValidReport({ generatedAt: ts });
    const symbolExec = makeSymbolExecution({ generatedAt: ts });
    // vitest startTime is earlier
    const vitestEvidence = makeVitestEvidence({ startTime: new Date('2026-03-14T19:00:00Z').getTime() });

    const result = validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence);

    expect(result.ok).toBe(true);
  });

  it('passes when report generatedAt exactly equals vitest-evidence startTime', () => {
    const reportTs = '2026-03-14T20:00:13.598Z';
    const vitestStartMs = new Date(reportTs).getTime();
    const report = makeValidReport({ generatedAt: reportTs });
    const symbolExec = makeSymbolExecution({ generatedAt: '2026-03-14T19:00:00.000Z' }); // older
    const vitestEvidence = makeVitestEvidence({ startTime: vitestStartMs });

    const result = validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence);

    expect(result.ok).toBe(true);
  });
});
