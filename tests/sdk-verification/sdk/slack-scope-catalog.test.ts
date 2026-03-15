/**
 * Scope catalog completeness test — Phase 41 plan 04 (SLCK-20)
 *
 * Proves that METHOD_SCOPES in twins/slack/src/services/method-scopes.ts is
 * exhaustive: every Slack Web API method that passes through checkScope() or
 * reads METHOD_SCOPES[] must have an explicit entry in the catalog.
 *
 * The audit uses TypeScript-AST-based identifier resolution (ts-morph) to:
 *   1. Find direct string-literal arguments in checkScope('method.name', ...)
 *   2. Resolve identifier-backed call sites: checkScope(methodName, ...) where
 *      methodName is a const string literal in the same scope
 *   3. Find wrapper/helper call sites:
 *      - stub('method.name') in stubs.ts / admin.ts / new-families.ts
 *      - checkAuth(..., 'method.name') in conversations.ts / users.ts
 *      - checkAuthRateError(..., 'method.name') in chat.ts
 *      - authCheck(..., 'method.name') in pins.ts / reactions.ts / views.ts
 *      - METHOD_SCOPES[methodName] reads where methodName is a resolved literal
 *
 * Design note:
 *   Helper functions (stub, checkAuth, authCheck, etc.) forward their `method`
 *   parameter to checkScope() internally. Those internal calls resolve to a
 *   function parameter, not a string literal — they are skipped (the outer
 *   call sites of the helpers already emit the concrete strings).
 *   Only truly dynamic, non-parameter, non-literal call sites are reported as
 *   unresolved.
 *
 * Two tests:
 *   1. "scope catalog is exhaustive for every auth-checked Slack method" — fails if
 *      any discovered method is absent from METHOD_SCOPES.
 *   2. "scope catalog rejects unresolved dynamic method names" — fails if any
 *      method argument path cannot be resolved to a concrete string literal
 *      AND is not a forwarded function parameter.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Project, Node } from 'ts-morph';
import { METHOD_SCOPES } from '../../../twins/slack/src/services/method-scopes.js';

// ── Paths ─────────────────────────────────────────────────────────────────────

const REPO_ROOT   = path.resolve(__dirname, '../../../');
const PLUGINS_DIR = path.join(REPO_ROOT, 'twins/slack/src/plugins/web-api');
const OAUTH_FILE  = path.join(REPO_ROOT, 'twins/slack/src/plugins/oauth.ts');
const TSCONFIG    = path.join(REPO_ROOT, 'twins/slack/tsconfig.json');

// Sentinel: argument is a function parameter being forwarded — skip it.
const PARAM_FORWARD = Symbol('PARAM_FORWARD');

// ── AST audit helpers ─────────────────────────────────────────────────────────

/**
 * Collect all .ts plugin files to scan.
 * Includes every file under plugins/web-api/ and plugins/oauth.ts.
 */
function collectPluginFiles(): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(PLUGINS_DIR)) {
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(path.join(PLUGINS_DIR, entry));
    }
  }
  if (fs.existsSync(OAUTH_FILE)) {
    files.push(OAUTH_FILE);
  }
  return files;
}

/**
 * Try to resolve a call argument to a concrete string literal.
 *
 * Returns:
 *   - string  — resolved literal value
 *   - PARAM_FORWARD — the identifier is a function parameter (forwarded from caller);
 *                     the outer call site already records the literal; skip this one.
 *   - null    — unresolvable dynamic value (should be reported as an error)
 */
function resolveStringArg(arg: Node): string | typeof PARAM_FORWARD | null {
  // Direct string literal
  if (Node.isStringLiteral(arg)) {
    return arg.getLiteralValue();
  }

  // Identifier: attempt resolution
  if (Node.isIdentifier(arg)) {
    const symbol = arg.getSymbol();
    if (!symbol) return null;
    for (const decl of symbol.getDeclarations()) {
      // VariableDeclaration: check initializer is a string literal
      if (Node.isVariableDeclaration(decl)) {
        const init = decl.getInitializer();
        if (init && Node.isStringLiteral(init)) {
          return init.getLiteralValue();
        }
        // Initializer present but not a literal (dynamic) → report
        if (init) return null;
        // No initializer — might be a declared parameter; fall through
      }
      // ParameterDeclaration: this identifier is a function parameter.
      // The helper function forwards it to checkScope() — the concrete value
      // is provided at the outer call site, which we capture separately.
      if (Node.isParameterDeclaration(decl)) {
        // If the parameter has a string literal default, capture that.
        const init = decl.getInitializer();
        if (init && Node.isStringLiteral(init)) {
          return init.getLiteralValue();
        }
        // Otherwise it's a forwarded parameter — skip silently.
        return PARAM_FORWARD;
      }
    }
    return null;
  }

  return null;
}

type AuditResult = {
  /** All concrete method names discovered */
  resolved: string[];
  /** Locations where we could NOT resolve a method name (not a forwarded param) */
  unresolved: Array<{ file: string; line: number; text: string }>;
};

function auditPluginFiles(files: string[]): AuditResult {
  const project = new Project({
    tsConfigFilePath: TSCONFIG,
    addFilesFromTsConfig: false,
    skipFileDependencyResolution: true,
  });

  for (const f of files) {
    project.addSourceFileAtPath(f);
  }

  const resolved = new Set<string>();
  const unresolved: AuditResult['unresolved'] = [];

  /**
   * Try to collect all string elements from a for...of loop variable.
   *
   * If `identifier` is declared as the iteration variable of a `for...of` loop
   * over an array literal of string literals, return those strings.
   * Otherwise return null.
   */
  function resolveForOfVariable(identifier: Node): string[] | null {
    if (!Node.isIdentifier(identifier)) return null;
    const symbol = identifier.getSymbol();
    if (!symbol) return null;

    for (const decl of symbol.getDeclarations()) {
      if (!Node.isVariableDeclaration(decl)) continue;
      const varList = decl.getParent();
      if (!Node.isVariableDeclarationList(varList)) continue;
      const forOf = varList.getParent();
      // SyntaxKind.ForOfStatement = 250 in TypeScript AST
      if (!forOf || forOf.getKind() !== 250) continue;

      // Get the iterable expression from the for...of statement
      const iterableExpr = (forOf as any).getExpression?.();
      if (!iterableExpr) continue;

      // Resolve the iterable to an array literal (direct or via identifier)
      let arrayLiteral: Node | null = null;
      if (Node.isIdentifier(iterableExpr)) {
        const iterSymbol = iterableExpr.getSymbol();
        if (iterSymbol) {
          for (const iterDecl of iterSymbol.getDeclarations()) {
            if (Node.isVariableDeclaration(iterDecl)) {
              const init = iterDecl.getInitializer();
              if (init && Node.isArrayLiteralExpression(init)) {
                arrayLiteral = init;
                break;
              }
            }
          }
        }
      } else if (Node.isArrayLiteralExpression(iterableExpr)) {
        arrayLiteral = iterableExpr;
      }

      if (!arrayLiteral || !Node.isArrayLiteralExpression(arrayLiteral)) continue;

      const values: string[] = [];
      for (const elem of arrayLiteral.getElements()) {
        if (Node.isStringLiteral(elem)) {
          values.push(elem.getLiteralValue());
        }
      }
      if (values.length > 0) return values;
    }
    return null;
  }

  /**
   * Attempt to record a method name from a call argument.
   * Silently ignores forwarded function parameters.
   * Expands for...of loop variables to all iterated string literals.
   */
  function record(arg: Node, filePath: string): void {
    // Check for for...of loop variable first (most complex case)
    if (Node.isIdentifier(arg)) {
      const forOfValues = resolveForOfVariable(arg);
      if (forOfValues !== null) {
        for (const v of forOfValues) resolved.add(v);
        return;
      }
    }

    const value = resolveStringArg(arg);
    if (value === PARAM_FORWARD) {
      // This is a helper's internal forwarding call — skip.
      return;
    }
    if (value !== null) {
      resolved.add(value);
    } else {
      const pos = arg.getStartLineNumber();
      unresolved.push({
        file: path.relative(REPO_ROOT, filePath),
        line: pos,
        text: arg.getText().substring(0, 80),
      });
    }
  }

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    // Walk all CallExpressions
    sourceFile.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;

      const expr = node.getExpression();
      const calleeName = Node.isIdentifier(expr)
        ? expr.getText()
        : Node.isPropertyAccessExpression(expr)
          ? expr.getName()
          : null;

      if (!calleeName) return;

      const args = node.getArguments();

      // Pattern 1: checkScope('method', ...)
      if (calleeName === 'checkScope' && args.length >= 1) {
        record(args[0], filePath);
        return;
      }

      // Pattern 2: checkAuth(fastify, request, reply, 'method')
      if (calleeName === 'checkAuth' && args.length >= 4) {
        record(args[3], filePath);
        return;
      }

      // Pattern 3: checkAuthRateError(fastify, request, reply, 'method')
      if (calleeName === 'checkAuthRateError' && args.length >= 4) {
        record(args[3], filePath);
        return;
      }

      // Pattern 4: authCheck(request, reply, 'method')
      if (calleeName === 'authCheck' && args.length >= 3) {
        record(args[2], filePath);
        return;
      }

      // Pattern 5: stub('method', ...) — local helper in stubs/admin/new-families
      if (calleeName === 'stub' && args.length >= 1) {
        record(args[0], filePath);
        return;
      }
    });

    // Pattern 6: METHOD_SCOPES[methodName] element accesses
    sourceFile.forEachDescendant((node) => {
      if (!Node.isElementAccessExpression(node)) return;
      const obj = node.getExpression();
      if (!Node.isIdentifier(obj) || obj.getText() !== 'METHOD_SCOPES') return;
      const argNode = node.getArgumentExpression();
      if (!argNode) return;
      record(argNode, filePath);
    });
  }

  return { resolved: [...resolved], unresolved };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Slack scope catalog completeness', () => {
  const files = collectPluginFiles();
  const audit = auditPluginFiles(files);

  it('scope catalog is exhaustive for every auth-checked Slack method', () => {
    const missing = audit.resolved.filter((m) => !(m in METHOD_SCOPES));

    expect(missing, [
      'The following methods pass through checkScope() or METHOD_SCOPES[] but are absent',
      'from METHOD_SCOPES in twins/slack/src/services/method-scopes.ts:',
      '',
      missing.map((m) => `  - ${m}`).join('\n'),
    ].join('\n')).toEqual([]);
  });

  it('scope catalog rejects unresolved dynamic method names', () => {
    expect(audit.unresolved, [
      'The following call sites pass a method argument that could not be resolved',
      'to a concrete string literal. Either inline the string literal or add a',
      'const variable declaration with a string initializer in the same scope:',
      '',
      audit.unresolved.map((u) => `  ${u.file}:${u.line}  ${u.text}`).join('\n'),
    ].join('\n')).toEqual([]);
  });
});
