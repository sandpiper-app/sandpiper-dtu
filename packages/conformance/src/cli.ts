#!/usr/bin/env node

/**
 * CLI entry point for running conformance suites.
 *
 * Usage:
 *   dtu-conformance --suite ./suites/orders.ts --mode twin
 *   dtu-conformance --suite ./suites/orders.ts --mode live --live-adapter ./adapters/live.ts
 *   dtu-conformance --suite ./suites/orders.ts --mode offline --fixtures ./fixtures
 *   dtu-conformance --record --suite ./suites/orders.ts --live-adapter ./adapters/live.ts --fixtures ./fixtures
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ConformanceRunner } from './runner.js';
import { ConformanceReporter } from './reporter.js';
import { FixtureStore } from './fixture-store.js';
import type { ConformanceAdapter } from './adapter.js';
import type { ConformanceSuite } from './types.js';

interface CliArgs {
  suite?: string;
  mode: 'twin' | 'live' | 'offline';
  twinAdapter?: string;
  liveAdapter?: string;
  fixtures?: string;
  json: boolean;
  verbose: boolean;
  record: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    mode: 'twin',
    json: false,
    verbose: false,
    record: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--suite':
        result.suite = args[++i];
        break;
      case '--mode':
        result.mode = args[++i] as CliArgs['mode'];
        break;
      case '--twin-adapter':
        result.twinAdapter = args[++i];
        break;
      case '--live-adapter':
        result.liveAdapter = args[++i];
        break;
      case '--fixtures':
        result.fixtures = args[++i];
        break;
      case '--json':
        result.json = true;
        break;
      case '--verbose':
        result.verbose = true;
        break;
      case '--record':
        result.record = true;
        break;
      default:
        // Positional argument = suite path
        if (!args[i].startsWith('-') && !result.suite) {
          result.suite = args[i];
        }
    }
  }

  return result;
}

async function loadModule(modulePath: string): Promise<Record<string, unknown>> {
  const absolutePath = resolve(process.cwd(), modulePath);
  const url = pathToFileURL(absolutePath).href;
  return import(url);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.suite) {
    console.error('Error: --suite <path> is required');
    process.exit(1);
  }

  // Load suite module
  const suiteModule = await loadModule(args.suite);
  const suite = (suiteModule.default ?? suiteModule.suite) as ConformanceSuite;
  if (!suite || !suite.tests) {
    console.error('Error: Suite module must export a ConformanceSuite (default or named "suite")');
    process.exit(1);
  }

  // Load adapters
  let twinAdapter: ConformanceAdapter | null = null;
  let liveAdapter: ConformanceAdapter | null = null;

  if (args.twinAdapter) {
    const mod = await loadModule(args.twinAdapter);
    const AdapterClass = mod.default ?? mod.TwinAdapter ?? Object.values(mod)[0];
    twinAdapter = typeof AdapterClass === 'function'
      ? new (AdapterClass as new () => ConformanceAdapter)()
      : AdapterClass as ConformanceAdapter;
  }

  if (args.liveAdapter) {
    const mod = await loadModule(args.liveAdapter);
    const AdapterClass = mod.default ?? mod.LiveAdapter ?? Object.values(mod)[0];
    liveAdapter = typeof AdapterClass === 'function'
      ? new (AdapterClass as new () => ConformanceAdapter)()
      : AdapterClass as ConformanceAdapter;
  }

  // Set up fixture store
  const fixtureStore = args.fixtures ? new FixtureStore(args.fixtures) : null;

  // Create reporter
  const reporter = new ConformanceReporter({
    json: args.json,
    verbose: args.verbose,
  });

  if (!twinAdapter) {
    console.error('Error: --twin-adapter <path> is required');
    process.exit(1);
  }

  // Create runner
  const runner = new ConformanceRunner(
    twinAdapter,
    liveAdapter,
    fixtureStore,
    reporter,
    args.mode
  );

  if (args.record) {
    await runner.record(suite);
    process.exit(0);
  }

  const report = await runner.run(suite);

  // Exit with appropriate code
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Conformance runner failed:', error);
  process.exit(1);
});
