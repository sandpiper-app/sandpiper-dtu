/**
 * Pure validation helpers for coverage report provenance and freshness (INFRA-25).
 *
 * This module is intentionally side-effect-free and data-driven so it can be
 * called by both unit tests (with fabricated objects) and by check-drift.ts
 * (with objects parsed directly from disk).
 *
 * Rules enforced:
 *   1. provenance.evidenceSource must equal "runtime-symbol-execution"
 *   2. provenance.executionArtifact and provenance.vitestArtifact must be present
 *   3. symbol-execution.json must expose a top-level generatedAt (parsable ISO string)
 *   4. vitest-evidence.json must expose a top-level startTime (numeric epoch ms)
 *   5. coverage-report.json.generatedAt must be >= both of those embedded timestamps
 *   6. No symbol entry may contain a legacy top-level testFile field
 */

// ── Public types ──────────────────────────────────────────────────────────────

/** Result returned by validateCoverageReportTruthfulness. */
export interface ValidationResult {
  /** true = all rules passed; false = at least one rule failed */
  ok: boolean;
  /**
   * Present on failure: short machine-readable rule name that failed.
   * Matches the literal strings that check-drift.ts surfaces in CI output.
   */
  rule?: string;
  /** Present on failure: human-readable explanation. */
  message?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function fail(rule: string, message: string): ValidationResult {
  return { ok: false, rule, message };
}

const OK: ValidationResult = { ok: true };

/**
 * Parse a value as an epoch-millisecond timestamp.
 * Accepts ISO strings (for generatedAt fields) or numeric ms (for startTime).
 * Returns NaN when the value is missing or unparsable.
 */
function toEpochMs(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return ms; // NaN if unparsable
  }
  return NaN;
}

// ── Main validator ────────────────────────────────────────────────────────────

/**
 * Validate the truthfulness of a coverage report by checking provenance,
 * freshness, and legacy shape rules.
 *
 * All three arguments are already-parsed JavaScript objects — no file I/O is
 * performed here. The caller (check-drift.ts or test suite) is responsible for
 * reading the files from disk before calling this function.
 *
 * @param report        Parsed coverage-report.json content.
 * @param symbolExec    Parsed symbol-execution.json content.
 * @param vitestEvidence Parsed vitest-evidence.json content.
 */
export function validateCoverageReportTruthfulness(
  report: Record<string, unknown>,
  symbolExec: Record<string, unknown>,
  vitestEvidence: Record<string, unknown>
): ValidationResult {

  // ── Rule 1: provenance block must be present ──────────────────────────────

  const provenance = report.provenance as Record<string, unknown> | undefined;

  if (provenance === null || provenance === undefined) {
    return fail(
      'missing-provenance',
      'coverage-report.json is missing the top-level "provenance" block'
    );
  }

  // ── Rule 2: provenance.evidenceSource must equal "runtime-symbol-execution" ─

  if (!('evidenceSource' in provenance)) {
    return fail(
      'missing-evidenceSource',
      'provenance.evidenceSource is absent — must be "runtime-symbol-execution"'
    );
  }

  if (provenance.evidenceSource !== 'runtime-symbol-execution') {
    return fail(
      'wrong-evidenceSource: expected runtime-symbol-execution',
      `provenance.evidenceSource is "${provenance.evidenceSource}" — must be "runtime-symbol-execution"`
    );
  }

  // ── Rule 3: provenance.executionArtifact must be present ─────────────────

  if (!provenance.executionArtifact) {
    return fail(
      'missing-executionArtifact',
      'provenance.executionArtifact is absent — must reference symbol-execution.json path'
    );
  }

  // ── Rule 4: provenance.vitestArtifact must be present ────────────────────

  if (!provenance.vitestArtifact) {
    return fail(
      'missing-vitestArtifact',
      'provenance.vitestArtifact is absent — must reference vitest-evidence.json path'
    );
  }

  // ── Rule 5a: coverage-report.json.generatedAt must be parsable ───────────

  const reportGeneratedAtMs = toEpochMs(report.generatedAt);
  if (!report.generatedAt || isNaN(reportGeneratedAtMs)) {
    return fail(
      'missing-or-unparsable-generatedAt',
      `coverage-report.json.generatedAt is missing or unparsable (value: ${report.generatedAt})`
    );
  }

  // ── Rule 5b: symbol-execution.json must have a parsable top-level generatedAt

  if (symbolExec.generatedAt === undefined || symbolExec.generatedAt === null) {
    return fail(
      'symbol-execution-missing-generatedAt',
      'symbol-execution.json is missing the top-level "generatedAt" field'
    );
  }

  const symbolExecMs = toEpochMs(symbolExec.generatedAt);
  if (isNaN(symbolExecMs)) {
    return fail(
      'symbol-execution-unparsable-generatedAt',
      `symbol-execution.json.generatedAt is unparsable (value: ${symbolExec.generatedAt})`
    );
  }

  // ── Rule 5c: vitest-evidence.json must have a top-level startTime ────────

  if (vitestEvidence.startTime === undefined || vitestEvidence.startTime === null) {
    return fail(
      'vitest-missing-startTime',
      'vitest-evidence.json is missing the top-level "startTime" field'
    );
  }

  const vitestStartMs = toEpochMs(vitestEvidence.startTime);
  if (isNaN(vitestStartMs)) {
    return fail(
      'vitest-unparsable-startTime',
      `vitest-evidence.json.startTime is unparsable (value: ${vitestEvidence.startTime})`
    );
  }

  // ── Rule 5d: coverage-report.json.generatedAt must be >= symbol-execution ─

  if (reportGeneratedAtMs < symbolExecMs) {
    return fail(
      'stale-report-vs-symbol-execution',
      `coverage-report.json generatedAt (${report.generatedAt}) is older than ` +
      `symbol-execution.json generatedAt (${symbolExec.generatedAt}) — ` +
      'report was generated from stale execution evidence; re-run: pnpm coverage:generate'
    );
  }

  // ── Rule 5e: coverage-report.json.generatedAt must be >= vitest startTime ─

  if (reportGeneratedAtMs < vitestStartMs) {
    return fail(
      'stale-report-vs-vitest-evidence',
      `coverage-report.json generatedAt (${report.generatedAt}) is older than ` +
      `vitest-evidence.json startTime (${new Date(vitestStartMs).toISOString()}) — ` +
      'report was generated before the most recent test run; re-run: pnpm coverage:generate'
    );
  }

  // ── Rule 6: no symbol entry may have a legacy top-level testFile field ────

  const packages = report.packages as Record<string, Record<string, unknown>> | undefined;
  if (packages) {
    for (const [pkgKey, symbols] of Object.entries(packages)) {
      for (const [symbolName, entry] of Object.entries(symbols)) {
        if (
          entry !== null &&
          typeof entry === 'object' &&
          'testFile' in (entry as Record<string, unknown>)
        ) {
          return fail(
            'legacy-testFile-field',
            `${pkgKey}/${symbolName} contains a top-level "testFile" field — ` +
            'this is the legacy hand-authored attribution shape; re-run: pnpm coverage:generate'
          );
        }
      }
    }
  }

  return OK;
}
