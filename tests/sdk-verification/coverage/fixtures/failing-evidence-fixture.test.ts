/**
 * Failing evidence fixture — Phase 41, INFRA-25.
 *
 * This test intentionally fails after recording a symbol hit so that the
 * runtime-artifact-resilience test can prove that symbol-execution.json
 * survives even when a test run exits non-zero.
 *
 * It does NOT use the normal sdk-verification vitest project (globalSetup /
 * setupFiles). Instead it records a hit directly and relies on the
 * execution-evidence-runtime failure-path flush hooks to write the artifact
 * before the process exits.
 *
 * This file must remain standalone — no imports from globalSetup or seeders.
 */

import { describe, it, expect } from 'vitest';
import { recordSymbolHit } from '../../setup/execution-evidence-runtime.js';

describe('failing-evidence-fixture', () => {
  it('records a symbol hit then intentionally fails', () => {
    // Record at least one symbol hit before the assertion fails
    recordSymbolHit('@slack/web-api@7.14.1/WebClient.chat.postMessage');

    // Intentional failing assertion — this is the point of this fixture
    expect(true).toBe(false); // INTENTIONAL FAILURE — do not fix
  });
});
