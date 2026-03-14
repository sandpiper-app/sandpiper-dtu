/**
 * Conformance test reporter
 *
 * Outputs summary tables and diff-style failure details.
 * Supports JSON output for CI consumption.
 */

import type { ConformanceReport } from './types.js';

export interface ReporterOptions {
  /** Output as JSON instead of human-readable text */
  json?: boolean;
  /** Show detailed diff output even for passing tests */
  verbose?: boolean;
}

export class ConformanceReporter {
  private options: ReporterOptions;

  constructor(options: ReporterOptions = {}) {
    this.options = options;
  }

  /**
   * Output the conformance report.
   */
  report(report: ConformanceReport): void {
    if (this.options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // Map the serialized mode value to a human-readable proof-scope label.
    // The underlying report.mode field in JSON output is NOT renamed here —
    // only the console label changes so it names the actual proof class:
    //   live     → live parity       (twin compared against real API responses)
    //   offline  → offline fixture   (twin compared against stored fixture responses)
    //   twin     → twin consistency  (twin compared against itself, structural smoke)
    const proofScopeLabel: Record<typeof report.mode, string> = {
      live: 'live parity',
      offline: 'offline fixture',
      twin: 'twin consistency',
    };
    const displayMode = proofScopeLabel[report.mode] ?? report.mode;

    // Header
    console.log('');
    console.log(`Conformance: ${report.suiteName} (${displayMode})`);
    console.log('='.repeat(60));
    console.log(
      `Total: ${report.total} | Passed: ${report.passed} | Failed: ${report.failed}`
    );
    console.log(`Duration: ${report.duration}ms`);
    console.log('');

    // Results table
    console.log('| Test | Status | Category |');
    console.log('|------|--------|----------|');
    for (const result of report.results) {
      const status = result.passed ? 'PASS' : 'FAIL';
      console.log(`| ${result.testName} | ${status} | ${result.category} |`);
    }

    // Diff-style output for failures
    const failures = report.results.filter((r) => !r.passed);
    if (failures.length > 0) {
      console.log('');
      console.log('--- Failures ---');
      console.log('');
      for (const failure of failures) {
        console.log(`FAIL: ${failure.testName}`);
        for (const d of failure.differences) {
          console.log(`  ${d.path}: ${d.kind}`);
          if (d.lhs !== undefined)
            console.log(`    twin:     ${JSON.stringify(d.lhs)}`);
          if (d.rhs !== undefined)
            console.log(`    baseline: ${JSON.stringify(d.rhs)}`);
        }
        console.log('');
      }
    }

    // Verbose: show all details
    if (this.options.verbose && failures.length === 0) {
      console.log('');
      console.log('All tests passed.');
    }
  }
}
