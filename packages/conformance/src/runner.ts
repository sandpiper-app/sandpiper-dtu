/**
 * Conformance test runner
 *
 * Orchestrates conformance test execution: adapter setup, test execution,
 * response comparison, and report generation.
 */

import type { ConformanceAdapter } from './adapter.js';
import type { FixtureStore } from './fixture-store.js';
import type { ConformanceReporter } from './reporter.js';
import { compareResponses, compareResponsesStructurally } from './comparator.js';
import type {
  ConformanceSuite,
  ConformanceReport,
  ComparisonResult,
  ConformanceResponse,
} from './types.js';

export class ConformanceRunner {
  private twin: ConformanceAdapter;
  private baseline: ConformanceAdapter | null;
  private fixtureStore: FixtureStore | null;
  private reporter: ConformanceReporter;
  private mode: 'twin' | 'live' | 'offline';

  /**
   * Create a conformance runner.
   *
   * @param twin - Adapter targeting the twin
   * @param baseline - Adapter targeting the real API (null for twin-only or offline mode)
   * @param fixtureStore - Fixture store for offline mode (null for live mode)
   * @param reporter - Reporter for output
   * @param mode - Execution mode
   */
  constructor(
    twin: ConformanceAdapter,
    baseline: ConformanceAdapter | null,
    fixtureStore: FixtureStore | null,
    reporter: ConformanceReporter,
    mode: 'twin' | 'live' | 'offline' = 'twin'
  ) {
    this.twin = twin;
    this.baseline = baseline;
    this.fixtureStore = fixtureStore;
    this.reporter = reporter;
    this.mode = mode;
  }

  /**
   * Run a conformance suite and return the report.
   */
  async run(suite: ConformanceSuite): Promise<ConformanceReport> {
    const start = Date.now();
    const results: ComparisonResult[] = [];

    // Initialize adapters
    await this.twin.init();
    if (this.baseline) {
      await this.baseline.init();
    }

    try {
      for (const test of suite.tests) {
        // Skip tests marked as live-only incompatible
        if (test.liveSkip && this.mode === 'live') {
          continue;
        }

        try {
          // Run setup operations
          if (test.setup) {
            for (const setupOp of test.setup) {
              await this.twin.execute(setupOp);
              if (this.baseline && this.mode === 'live') {
                await this.baseline.execute(setupOp);
              }
            }
          }

          // Execute the operation on twin
          const twinResponse = await this.twin.execute(test.operation);

          // Get baseline response
          let baselineResponse: ConformanceResponse | null = null;

          if (this.mode === 'live' && this.baseline) {
            const liveOp = test.liveOperation ?? test.operation;
            baselineResponse = await this.baseline.execute(liveOp);
          } else if (this.mode === 'offline' && this.fixtureStore) {
            baselineResponse = this.fixtureStore.load(test.id);
          } else if (this.mode === 'twin') {
            // Twin-only mode: no comparison, just validate structure
            // We compare against itself (always passes) or skip comparison
            baselineResponse = twinResponse;
          }

          if (baselineResponse) {
            const result = this.mode === 'live'
              ? compareResponsesStructurally(
                  test.id, test.name, test.category,
                  twinResponse, baselineResponse,
                  test.requirements ?? [],
                  suite.normalizer
                )
              : compareResponses(
                  test.id, test.name, test.category,
                  twinResponse, baselineResponse,
                  suite.normalizer, test.requirements ?? []
                );
            results.push(result);
          } else {
            // No baseline available
            results.push({
              testId: test.id,
              testName: test.name,
              category: test.category,
              passed: false,
              differences: [
                {
                  path: '<baseline>',
                  kind: 'deleted',
                  rhs: 'No baseline response available (missing fixture or adapter)',
                },
              ],
              requirements: test.requirements ?? [],
            });
          }

          // Run teardown operations
          if (test.teardown) {
            for (const teardownOp of test.teardown) {
              await this.twin.execute(teardownOp);
              if (this.baseline && this.mode === 'live') {
                await this.baseline.execute(teardownOp);
              }
            }
          }
        } catch (error) {
          // Test-level error
          results.push({
            testId: test.id,
            testName: test.name,
            category: test.category,
            passed: false,
            differences: [
              {
                path: '<error>',
                kind: 'changed',
                lhs: error instanceof Error ? error.message : String(error),
              },
            ],
            requirements: test.requirements ?? [],
          });
        }
      }
    } finally {
      // Teardown adapters
      await this.twin.teardown();
      if (this.baseline) {
        await this.baseline.teardown();
      }
    }

    const duration = Date.now() - start;
    const passed = results.filter((r) => r.passed).length;

    const report: ConformanceReport = {
      suiteName: suite.name,
      mode: this.mode,
      timestamp: new Date().toISOString(),
      duration,
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    };

    this.reporter.report(report);

    return report;
  }

  /**
   * Record mode: run tests against live API and save responses as fixtures.
   * Useful for bootstrapping offline mode.
   */
  async record(suite: ConformanceSuite): Promise<void> {
    if (!this.baseline) {
      throw new Error('Record mode requires a live baseline adapter');
    }
    if (!this.fixtureStore) {
      throw new Error('Record mode requires a fixture store');
    }

    await this.baseline.init();

    try {
      for (const test of suite.tests) {
        // Run setup
        if (test.setup) {
          for (const setupOp of test.setup) {
            await this.baseline.execute(setupOp);
          }
        }

        // Execute and record
        const response = await this.baseline.execute(test.operation);
        this.fixtureStore.save(test.id, response);
        console.log(`Recorded: ${test.id} (${test.name})`);

        // Run teardown
        if (test.teardown) {
          for (const teardownOp of test.teardown) {
            await this.baseline.execute(teardownOp);
          }
        }
      }
    } finally {
      await this.baseline.teardown();
    }

    console.log(`\nRecorded ${suite.tests.length} fixtures to ${this.fixtureStore.constructor.name}`);
  }
}
