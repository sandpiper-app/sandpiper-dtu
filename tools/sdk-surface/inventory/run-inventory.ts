/**
 * run-inventory.ts — CLI orchestrator for SDK surface manifest generation.
 *
 * Usage: npx tsx tools/sdk-surface/inventory/run-inventory.ts
 *
 * Generates five JSON manifests under tools/sdk-surface/manifests/, one for
 * each targeted SDK package. Manifests are committed to the repo and act as
 * the machine-readable coverage contract for all downstream SDK conformance
 * phases (14–20).
 *
 * Manifest filename convention:
 *   @shopify/admin-api-client@1.1.1 -> shopify-admin-api-client@1.1.1.json
 *   (strip @, replace / with -)
 */

import { walkPackageExports } from './walk-exports.js';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const manifestDir = resolve(__dirname, '../manifests');
mkdirSync(manifestDir, { recursive: true });

interface PackageSpec {
  packageName: string;
  version: string;
  minimumExpectedSymbols: number;
  /** Only set for @slack/web-api to enforce WebClient member count */
  minimumExpectedMembers?: {
    symbolName: string;
    count: number;
  };
}

const packages: PackageSpec[] = [
  {
    packageName: '@shopify/admin-api-client',
    version: '1.1.1',
    minimumExpectedSymbols: 10,
  },
  {
    packageName: '@shopify/shopify-api',
    version: '12.3.0',
    minimumExpectedSymbols: 30,
  },
  {
    packageName: '@slack/web-api',
    version: '7.14.1',
    minimumExpectedSymbols: 20,
    minimumExpectedMembers: {
      symbolName: 'WebClient',
      count: 200,
    },
  },
  {
    packageName: '@slack/oauth',
    version: '3.0.4',
    minimumExpectedSymbols: 10,
  },
  {
    packageName: '@slack/bolt',
    version: '4.6.0',
    minimumExpectedSymbols: 15,
  },
];

/**
 * Resolve the absolute path to a package's TypeScript declaration entry point.
 *
 * Some packages (e.g. @shopify/*) use `exports` in package.json and do not
 * expose `./package.json` via `require.resolve`. We therefore locate the
 * package directory through the module resolution system and then read
 * package.json via readFileSync to avoid triggering the exports guard.
 *
 * Resolution order: `types` > `typings` > try `dist/index.d.ts` > `index.d.ts`
 */
function resolvePackageEntryPoint(packageName: string): string {
  // resolve the package's main JS entrypoint to find the package directory
  let pkgDir: string;
  try {
    // Try resolving package.json first (works for packages that expose it)
    const pkgJsonViaResolve = require.resolve(`${packageName}/package.json`);
    pkgDir = dirname(pkgJsonViaResolve);
  } catch {
    // Package uses `exports` and doesn't expose ./package.json
    // Fall back to resolving the main entry and walking up to find package root
    const mainEntry = require.resolve(packageName);
    // Walk up from mainEntry until we find a package.json
    let dir = dirname(mainEntry);
    while (dir !== dirname(dir)) {
      try {
        readFileSync(join(dir, 'package.json'));
        pkgDir = dir;
        break;
      } catch {
        dir = dirname(dir);
      }
    }
    pkgDir ??= dirname(mainEntry);
  }

  const pkgJsonPath = join(pkgDir, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
    types?: string;
    typings?: string;
    main?: string;
  };

  if (pkgJson.types) {
    return resolve(pkgDir, pkgJson.types);
  }
  if (pkgJson.typings) {
    return resolve(pkgDir, pkgJson.typings);
  }

  // No types field — try common locations
  const candidates = ['dist/index.d.ts', 'index.d.ts'];
  for (const candidate of candidates) {
    const candidatePath = resolve(pkgDir, candidate);
    try {
      readFileSync(candidatePath);
      return candidatePath;
    } catch {
      // try next
    }
  }

  throw new Error(
    `Cannot find TypeScript declaration entry point for ${packageName} in ${pkgDir}. ` +
      `Checked: types field (${pkgJson.types ?? 'none'}), dist/index.d.ts, index.d.ts`,
  );
}

let success = true;

for (const spec of packages) {
  console.log(`Inventorying ${spec.packageName}@${spec.version}...`);

  try {
    const entryPoint = resolvePackageEntryPoint(spec.packageName);

    const manifest = walkPackageExports({
      packageName: spec.packageName,
      version: spec.version,
      entryPoint,
      minimumExpectedSymbols: spec.minimumExpectedSymbols,
      minimumExpectedMembers: spec.minimumExpectedMembers,
    });

    // Filename: strip @, replace / with -
    const safeName = spec.packageName.replace(/^@/, '').replace('/', '-');
    const outputPath = resolve(manifestDir, `${safeName}@${spec.version}.json`);

    writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');

    const wcEntry = manifest.symbols['WebClient'];
    const memberInfo = wcEntry?.members
      ? ` (WebClient: ${wcEntry.members.length} members)`
      : '';
    console.log(`  -> ${manifest.symbolCount} symbols${memberInfo} -> ${outputPath}`);
  } catch (err) {
    console.error(`  ERROR: ${(err as Error).message}`);
    success = false;
  }
}

if (!success) {
  console.error('\nInventory failed — see errors above.');
  process.exit(1);
}

console.log('Inventory complete.');
