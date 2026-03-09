/**
 * ts-morph export walker for SDK surface inventory.
 *
 * Uses ts-morph 25.0.1 (which bundles TS 5.7.3) exclusively.
 * Do NOT upgrade ts-morph to 26.x — that bundles TS 5.8 and creates
 * an unnecessary divergence from the project's TypeScript version.
 */

import { Project, SyntaxKind, type ClassDeclaration, type Type } from 'ts-morph';

export interface ManifestSymbol {
  kind: string;
  members?: string[]; // public method + property names for classes/interfaces
}

export interface PackageManifest {
  package: string;
  version: string;
  generatedAt: string;
  symbolCount: number;
  minimumExpectedSymbols: number;
  symbols: Record<string, ManifestSymbol>;
}

export interface WalkOptions {
  packageName: string;
  version: string;
  /** Absolute path to the package's index.d.ts */
  entryPoint: string;
  minimumExpectedSymbols: number;
  /**
   * Minimum number of members the WebClient (or any class) must expose.
   * Used for @slack/web-api to catch silent enumeration failures.
   */
  minimumExpectedMembers?: {
    symbolName: string;
    count: number;
  };
}

/**
 * Recursively collect leaf member names from a ts-morph Type.
 * Handles deeply nested object types (e.g., Methods' admin.analytics.getFile pattern).
 *
 * @param type   - A ts-morph Type to introspect
 * @param prefix - Dot-notation prefix for nested names (empty for top-level)
 * @param depth  - Recursion depth guard (stops at depth > 6)
 * @param seen   - Visited keys to prevent infinite recursion
 */
function collectMembersFromType(
  type: Type,
  prefix: string,
  depth: number,
  seen: Set<string>,
): string[] {
  if (depth > 6) return [];

  const cycleKey = `${prefix}:${type.getText().slice(0, 60)}`;
  if (seen.has(cycleKey)) return [];
  seen.add(cycleKey);

  const names: string[] = [];

  for (const sym of type.getProperties()) {
    const propName = sym.getName();
    if (!propName || propName.startsWith('_') || propName === '__type') continue;

    const fullName = prefix ? `${prefix}.${propName}` : propName;

    // Resolve the property's type via its value declaration
    let propType: Type | undefined;
    try {
      const valueDecl = sym.getValueDeclaration();
      if (valueDecl) {
        propType = valueDecl.getType();
      } else {
        const decls = sym.getDeclarations();
        if (decls.length > 0) {
          propType = decls[0].getType();
        }
      }
    } catch {
      continue; // Cannot determine type — skip
    }

    if (!propType) continue;

    if (propType.getCallSignatures().length > 0) {
      // It's a callable — leaf method
      names.push(fullName);
    } else {
      const nestedProps = propType.getProperties();
      if (nestedProps.length > 0) {
        const nested = collectMembersFromType(propType, fullName, depth + 1, seen);
        if (nested.length > 0) {
          names.push(...nested);
        } else {
          names.push(fullName); // leaf object property
        }
      } else {
        names.push(fullName); // primitive or empty type
      }
    }
  }

  return names;
}

/**
 * Collect all public member names from a class declaration node.
 *
 * Strategy:
 * 1. Direct method declarations on the class (getMethods)
 * 2. Direct property declarations (getProperties), recursing into nested object types
 * 3. Inherited members via getType().getBaseTypes() — handles abstract base classes
 *    like @slack/web-api's Methods which declares 275 API methods as nested objects
 */
function collectClassMembers(cls: ClassDeclaration): string[] {
  const members: string[] = [];

  // 1. Direct method declarations (standard classes)
  try {
    for (const method of cls.getMethods()) {
      if (method.hasModifier(SyntaxKind.PrivateKeyword)) continue;
      if (method.hasModifier(SyntaxKind.ProtectedKeyword)) continue;
      const name = method.getName();
      if (name) members.push(name);
    }
  } catch {
    // Skip if getMethods() is unavailable
  }

  // 2. Property declarations on the class
  try {
    for (const prop of cls.getProperties()) {
      if (prop.hasModifier(SyntaxKind.PrivateKeyword)) continue;
      if (prop.hasModifier(SyntaxKind.ProtectedKeyword)) continue;

      const name = prop.getName();
      if (!name || name.startsWith('#')) continue;

      let propType: Type;
      try {
        propType = prop.getType();
      } catch {
        members.push(name);
        continue;
      }

      if (propType.getCallSignatures().length > 0) {
        members.push(name);
      } else {
        const nestedProps = propType.getProperties();
        if (nestedProps.length > 0) {
          const nested = collectMembersFromType(propType, name, 0, new Set());
          if (nested.length > 0) {
            members.push(...nested);
          } else {
            members.push(name);
          }
        } else {
          members.push(name);
        }
      }
    }
  } catch {
    // Skip if getProperties() is unavailable
  }

  // 3. Inherited members via getType().getBaseTypes()
  //    This handles abstract base classes like Methods in @slack/web-api
  try {
    const classType = cls.getType();
    for (const baseType of classType.getBaseTypes()) {
      const inherited = collectMembersFromType(baseType, '', 0, new Set());
      members.push(...inherited);
    }
  } catch {
    // Base type traversal failed — skip
  }

  // Deduplicate (can occur via inheritance)
  return [...new Set(members)];
}

/**
 * Walk all exported declarations from a package's .d.ts entry point and
 * produce a PackageManifest.
 */
export function walkPackageExports(opts: WalkOptions): PackageManifest {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      // ModuleResolutionKind.Node (2) — standard for .d.ts resolution
      moduleResolution: 2,
      declaration: true,
    },
  });

  const sourceFile = project.addSourceFileAtPath(opts.entryPoint);
  const manifest: Record<string, ManifestSymbol> = {};

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    const decl = declarations[0];
    if (!decl) continue;

    const kind = decl.getKindName();
    const entry: ManifestSymbol = { kind };

    // Classes: enumerate public members (methods + properties, incl. nested namespaces)
    if (decl.getKind() === SyntaxKind.ClassDeclaration) {
      try {
        entry.members = collectClassMembers(decl as ClassDeclaration);
      } catch {
        entry.members = [];
      }
    }
    // Interfaces: enumerate their properties/methods directly
    else if (decl.getKind() === SyntaxKind.InterfaceDeclaration) {
      const iface = decl as import('ts-morph').InterfaceDeclaration;
      const memberNames: string[] = [];
      try {
        for (const member of iface.getMembers()) {
          if ('getName' in member && typeof (member as any).getName === 'function') {
            const n = (member as any).getName() as string | undefined;
            if (n) memberNames.push(n);
          }
        }
      } catch {
        // Skip member enumeration failure
      }
      if (memberNames.length > 0) entry.members = memberNames;
    }

    manifest[name] = entry;
  }

  const symbolCount = Object.keys(manifest).length;

  if (symbolCount < opts.minimumExpectedSymbols) {
    throw new Error(
      `Export enumeration for ${opts.packageName} found only ${symbolCount} symbols, ` +
        `expected at least ${opts.minimumExpectedSymbols}. Walker may have a bug or ` +
        `the package entry point is incorrect.`,
    );
  }

  // Optional per-class member count enforcement (used for WebClient)
  if (opts.minimumExpectedMembers) {
    const { symbolName, count } = opts.minimumExpectedMembers;
    const entry = manifest[symbolName];
    const actualCount = entry?.members?.length ?? 0;
    if (actualCount < count) {
      throw new Error(
        `Member enumeration for ${opts.packageName}.${symbolName} found only ${actualCount} members, ` +
          `expected at least ${count}. Check the walker's collectClassMembers() logic ` +
          `against the package's .d.ts file.`,
      );
    }
  }

  return {
    package: opts.packageName,
    version: opts.version,
    generatedAt: new Date().toISOString(),
    symbolCount,
    minimumExpectedSymbols: opts.minimumExpectedSymbols,
    symbols: manifest,
  };
}
