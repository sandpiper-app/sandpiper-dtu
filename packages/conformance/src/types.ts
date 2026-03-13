/**
 * @dtu/conformance - Core type definitions
 *
 * Generic conformance testing types. Not Shopify-specific.
 * Any twin can implement these interfaces.
 */

/** An API operation to execute during conformance testing */
export interface ConformanceOperation {
  /** Unique operation name for reporting */
  name: string;
  /** Human-readable description */
  description: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** URL path (relative to base) */
  path: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT/PATCH) */
  body?: unknown;
  /** GraphQL query (for GraphQL APIs) */
  graphql?: { query: string; variables?: Record<string, unknown> };
}

/** Normalized API response for comparison */
export interface ConformanceResponse {
  /** HTTP status code */
  status: number;
  /** Response headers (normalized to lowercase keys) */
  headers: Record<string, string>;
  /** Parsed response body */
  body: unknown;
}

/** A single conformance test */
export interface ConformanceTest {
  /** Unique test ID */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Category for grouping in reports */
  category: string;
  /** Setup operations to run before the test (create fixtures, etc.) */
  setup?: ConformanceOperation[];
  /** The operation to compare */
  operation: ConformanceOperation;
  /** Teardown operations to run after the test */
  teardown?: ConformanceOperation[];
  /** Requirement IDs this test validates */
  requirements?: string[];
  /** Skip this test in live mode (e.g., twin-specific debug endpoints) */
  liveSkip?: boolean;
  /** Override operation to use in live mode (e.g., when real API schema differs from twin schema) */
  liveOperation?: ConformanceOperation;
  /**
   * Comparison mode for live mode. Default: 'structural'.
   * 'structural': field shapes and types must match; primitive values may differ.
   * 'exact': full deep-equal after normalization (same as twin/offline mode).
   */
  comparisonMode?: 'structural' | 'exact';
}

/** A collection of conformance tests with shared normalizer */
export interface ConformanceSuite {
  /** Suite name (e.g., "Shopify Orders") */
  name: string;
  /** Suite description */
  description: string;
  /** Tests in this suite */
  tests: ConformanceTest[];
  /** Field normalizer config for this suite */
  normalizer: FieldNormalizerConfig;
}

/** Configuration for normalizing non-deterministic fields before comparison */
export interface FieldNormalizerConfig {
  /** Fields to strip entirely before comparison (auto-generated IDs, timestamps) */
  stripFields: string[];
  /** Fields to replace with placeholder values (field path -> placeholder) */
  normalizeFields: Record<string, string>;
  /**
   * Array field paths to sort before comparison (prevents order sensitivity).
   * Example: ['channels'] sorts the top-level 'channels' array in both twin
   * and baseline before comparison, so different orderings pass.
   */
  sortFields?: string[];
  /**
   * Primitive field paths whose values must match exactly even in structural mode.
   * Paths use dot notation relative to response body (e.g., 'ok', 'error', 'data.status').
   * Only applies in structural mode; in exact mode all fields are value-compared via deep-diff.
   * Only supports simple dot-notation paths to primitive fields (no array bracket notation).
   * For array-path comparison use comparisonMode: 'exact'.
   */
  compareValueFields?: string[];
  /** Custom normalizer function for complex cases */
  custom?: (obj: unknown) => unknown;
}

/** Result of comparing two responses */
export interface ComparisonResult {
  /** Test ID */
  testId: string;
  /** Test name */
  testName: string;
  /** Test category */
  category: string;
  /** Whether the comparison passed */
  passed: boolean;
  /** Differences found (empty if passed) */
  differences: Difference[];
  /** Requirement IDs validated */
  requirements: string[];
}

/** A single difference between twin and baseline response */
export interface Difference {
  /** Dot-notation path to the differing field */
  path: string;
  /** Kind of difference */
  kind: 'added' | 'deleted' | 'changed' | 'array';
  /** Value in twin response */
  lhs?: unknown;
  /** Value in baseline response */
  rhs?: unknown;
}

/** Full conformance test report */
export interface ConformanceReport {
  /** Suite name */
  suiteName: string;
  /** Execution mode */
  mode: 'twin' | 'live' | 'offline';
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Total duration in milliseconds */
  duration: number;
  /** Total number of tests */
  total: number;
  /** Number of passing tests */
  passed: number;
  /** Number of failing tests */
  failed: number;
  /** Per-test results */
  results: ComparisonResult[];
}
