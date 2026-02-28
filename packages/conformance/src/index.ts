/**
 * @dtu/conformance - Generic conformance testing framework
 *
 * Validates twin behavior against real API responses.
 * Any twin can plug in via the adapter interface.
 */

// Types
export type {
  ConformanceOperation,
  ConformanceResponse,
  ConformanceTest,
  ConformanceSuite,
  FieldNormalizerConfig,
  ComparisonResult,
  Difference,
  ConformanceReport,
} from './types.js';

// Adapter interface
export type { ConformanceAdapter } from './adapter.js';

// Comparator
export { compareResponses } from './comparator.js';

// Runner
export { ConformanceRunner } from './runner.js';

// Reporter
export { ConformanceReporter } from './reporter.js';
export type { ReporterOptions } from './reporter.js';

// Fixture Store
export { FixtureStore } from './fixture-store.js';
