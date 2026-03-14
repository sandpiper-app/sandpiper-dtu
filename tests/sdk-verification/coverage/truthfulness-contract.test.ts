/**
 * Truthfulness contract for Phase 40 — INFRA-23, INFRA-24, INFRA-25
 *
 * RED contract: All four assertions in this file are expected to FAIL on the
 * current branch (pre-Phase-40 implementation). Later Phase 40 plans must turn
 * them GREEN by:
 *   - emitting runtime symbol execution evidence (INFRA-23)
 *   - replacing EVIDENCE_MAP hand-authored attribution with runtime instrumentation (INFRA-23)
 *   - removing overstated conformance wording (INFRA-24)
 *   - adding provenance metadata to coverage-report.json (INFRA-25)
 *
 * Do NOT patch implementation files to make these tests pass until the
 * corresponding Phase 40 implementation plan lands.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');

// ── Paths ─────────────────────────────────────────────────────────────────────

const coverageReportPath = join(__dirname, 'coverage-report.json');
const generatorPath = join(__dirname, 'generate-report-evidence.ts');
const slackConformanceIndexPath = join(root, 'twins/slack/conformance/index.ts');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const coverageReport: Record<string, unknown> = JSON.parse(
  readFileSync(coverageReportPath, 'utf8')
);

const generatorSource: string = readFileSync(generatorPath, 'utf8');
const slackConformanceIndexSource: string = readFileSync(slackConformanceIndexPath, 'utf8');

// ── Test 1: Coverage report phase and top-level provenance fields ──────────────

describe('coverage-report.json provenance (INFRA-25)', () => {
  it('reports phase "40" and carries top-level provenance fields', () => {
    // Phase must be updated to '40' by the Phase 40 implementation plan.
    // Current value is the last phase that regenerated the report.
    expect(coverageReport.phase).toBe('40');

    // These three provenance fields must be present at the top level.
    // They are added by the runtime-symbol-execution evidence pipeline (Plan 40-02).
    // Currently absent because the Phase 40 pipeline has not landed.
    expect(coverageReport).toHaveProperty('evidenceSource', 'runtime-symbol-execution');
    expect(coverageReport).toHaveProperty(
      'executionArtifact',
      'tests/sdk-verification/coverage/symbol-execution.json'
    );
    expect(coverageReport).toHaveProperty(
      'vitestArtifact',
      'tests/sdk-verification/coverage/vitest-evidence.json'
    );
  });
});

// ── Test 2: No bare testFile-only provenance in live symbol entries ────────────

describe('coverage-report.json symbol provenance (INFRA-23)', () => {
  it('no live symbol entry uses a bare testFile field as its only provenance mechanism', () => {
    const packages = coverageReport.packages as Record<
      string,
      Record<string, Record<string, unknown>>
    >;

    const violatingSymbols: string[] = [];

    for (const [pkgKey, symbols] of Object.entries(packages)) {
      for (const [symbolName, entry] of Object.entries(symbols)) {
        // A bare testFile-only entry: has testFile but lacks evidenceFiles.
        // Phase 40 replaces this with evidenceFiles[] sourced from runtime hits.
        if (
          entry.tier === 'live' &&
          typeof entry.testFile === 'string' &&
          !Array.isArray(entry.evidenceFiles)
        ) {
          violatingSymbols.push(`${pkgKey}/${symbolName}`);
        }
      }
    }

    // Expect zero violations. Currently fails because all live entries use
    // the hand-authored EVIDENCE_MAP testFile attribution from Phase 34.
    expect(violatingSymbols).toHaveLength(0);
  });
});

// ── Test 3: Generator source must not declare const EVIDENCE_MAP ───────────────

describe('generate-report-evidence.ts source (INFRA-23)', () => {
  it('does not declare const EVIDENCE_MAP (hand-authored attribution map)', () => {
    // The presence of `const EVIDENCE_MAP` means symbol attribution is still
    // hand-authored rather than derived from runtime execution evidence.
    // Phase 40 Plan 02 replaces this with a runtime symbol recorder.
    expect(generatorSource).not.toContain('const EVIDENCE_MAP');
  });
});

// ── Test 4: Slack conformance index must not overstate suite coverage ──────────

describe('twins/slack/conformance/index.ts wording (INFRA-24)', () => {
  it('does not contain the phrase "Complete Slack Web API conformance suite"', () => {
    // This phrase implies full API parity, which the current suite does not
    // provide (it covers conversations, chat, users, and OAuth only).
    // Phase 40 Plan 04 updates the description to accurately describe the
    // suite's scope as a structural smoke subset, not a complete parity proof.
    expect(slackConformanceIndexSource).not.toContain(
      'Complete Slack Web API conformance suite'
    );
  });
});
