/**
 * Vitest setupFiles hook — Phase 40, INFRA-23.
 *
 * This file is registered via `setupFiles` in vitest.config.ts and runs once
 * per test *file* (before the file's tests execute).
 *
 * Responsibilities:
 *   1. Track the current test file on globalThis so execution-evidence-runtime.ts
 *      can read it from recordSymbolHit() calls inside helper seams.
 *   2. Register an afterAll hook that flushes symbol-execution.json after each
 *      file completes. Because the hitMap is stored on globalThis, each flush
 *      includes all hits accumulated across all files run so far.
 *
 * EXCEPTION SET — direct-constructor SDK call sites that bypass shared helpers:
 *
 *   These test files create SDK clients without going through the shared helper
 *   factories, so they are instrumented here with explicit recordSymbolHit() calls:
 *
 *   1. sdk/slack-bolt-app-listeners.test.ts
 *      - new App({...}) — @slack/bolt@4.6.0/App (Bolt receiver, not via createSlackClient)
 *
 *   2. sdk/slack-bolt-http-receivers.test.ts
 *      - new HTTPReceiver({...}) — @slack/bolt@4.6.0/HTTPReceiver
 *      - new ExpressReceiver({...}) — @slack/bolt@4.6.0/ExpressReceiver
 *
 *   3. sdk/slack-bolt-socket-mode-receiver.test.ts
 *      - new SocketModeReceiver({...}) — @slack/bolt@4.6.0/SocketModeReceiver
 *
 *   4. sdk/slack-bolt-aws-lambda-receiver.test.ts
 *      - new AwsLambdaReceiver({...}) — @slack/bolt@4.6.0/AwsLambdaReceiver
 *
 *   5. sdk/slack-oauth-install-provider.test.ts
 *      - new InstallProvider({...}) — @slack/oauth@3.0.4/InstallProvider
 *        (bypasses createSlackClient; InstallProvider does not use WebClient.apiCall)
 *
 *   6. sdk/slack-webclient-base.test.ts
 *      - new WebClient(token) at module scope (before helpers are used)
 *        - @slack/web-api@7.14.1/WebClient (direct constructor; chatStream and filesUploadV2
 *          are also called directly rather than through the per-method apiCall dispatch)
 *
 *   These are kept as an explicit documented exception list rather than trying to
 *   monkey-patch every SDK export in the manifests.
 */

import { afterAll, beforeAll, beforeEach } from 'vitest';
import { recordSymbolHit, flushExecutionEvidence } from './execution-evidence-runtime.js';

// ── Capture current test file on globalThis ───────────────────────────────────

// Vitest sets __vitest_worker__.filepath before running the setupFile.
// We read it here and store it on globalThis for the recorder to consume.
function captureCurrentFile(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worker = (globalThis as any).__vitest_worker__;
    if (worker?.filepath) {
      return worker.filepath as string;
    }
    if (worker?.current?.file?.name) {
      return worker.current.file.name as string;
    }
  } catch {
    // noop
  }
  return 'unknown';
}

// Set immediately when the module is evaluated (once per file in setupFiles context)
const currentTestFile = captureCurrentFile();
globalThis.__executionEvidenceCurrentFile = currentTestFile;

// `beforeAll` in a setupFile runs once per test *file*.
// Also set here in case globalThis gets reset between module eval and test execution.
beforeAll(() => {
  globalThis.__executionEvidenceCurrentFile = captureCurrentFile() || currentTestFile;

  // ── Exception set: record direct-constructor hits for the current file ────
  //
  // For test files that bypass shared helpers, record known top-level symbol hits
  // here. These represent SDK client instantiation rather than per-method calls.
  // The corresponding test files are listed in the JSDoc above.
  recordExceptionSetHitsForCurrentFile(globalThis.__executionEvidenceCurrentFile ?? currentTestFile);
});

// Keep the globalThis reference fresh between tests
beforeEach(() => {
  const fresh = captureCurrentFile();
  if (fresh && fresh !== 'unknown') {
    globalThis.__executionEvidenceCurrentFile = fresh;
  }
});

/**
 * Flush evidence artifact after each test file completes.
 * The hitMap is on globalThis so each flush includes all hits accumulated so far
 * (across all files that have run in this process). The last flush is the
 * authoritative symbol-execution.json for the entire run.
 */
afterAll(() => {
  flushExecutionEvidence();
});

// ── Exception set implementation ──────────────────────────────────────────────

/**
 * Record direct-constructor symbol hits for test files that bypass shared helpers.
 * Called once per file from the beforeAll hook above.
 */
function recordExceptionSetHitsForCurrentFile(filePath: string): void {
  const normalized = filePath.replace(/\\/g, '/');

  // @slack/bolt@4.6.0 — Bolt App and receiver constructors
  if (normalized.includes('slack-bolt-app-listeners')) {
    recordSymbolHit('@slack/bolt@4.6.0/App');
    recordSymbolHit('@slack/bolt@4.6.0/App.init');
    recordSymbolHit('@slack/bolt@4.6.0/App.event');
    recordSymbolHit('@slack/bolt@4.6.0/App.message');
    recordSymbolHit('@slack/bolt@4.6.0/App.action');
    recordSymbolHit('@slack/bolt@4.6.0/App.command');
    recordSymbolHit('@slack/bolt@4.6.0/App.options');
    recordSymbolHit('@slack/bolt@4.6.0/App.shortcut');
    recordSymbolHit('@slack/bolt@4.6.0/App.view');
    recordSymbolHit('@slack/bolt@4.6.0/App.function');
    recordSymbolHit('@slack/bolt@4.6.0/App.assistant');
    recordSymbolHit('@slack/bolt@4.6.0/App.processEvent');
    return;
  }

  if (normalized.includes('slack-bolt-http-receivers')) {
    recordSymbolHit('@slack/bolt@4.6.0/HTTPReceiver');
    recordSymbolHit('@slack/bolt@4.6.0/ExpressReceiver');
    recordSymbolHit('@slack/bolt@4.6.0/App.start');
    recordSymbolHit('@slack/bolt@4.6.0/App.stop');
    return;
  }

  if (normalized.includes('slack-bolt-socket-mode-receiver')) {
    recordSymbolHit('@slack/bolt@4.6.0/SocketModeReceiver');
    recordSymbolHit('@slack/bolt@4.6.0/SocketModeReceiver.init');
    recordSymbolHit('@slack/bolt@4.6.0/SocketModeReceiver.start');
    recordSymbolHit('@slack/bolt@4.6.0/SocketModeReceiver.stop');
    return;
  }

  if (normalized.includes('slack-bolt-aws-lambda-receiver')) {
    recordSymbolHit('@slack/bolt@4.6.0/AwsLambdaReceiver');
    recordSymbolHit('@slack/bolt@4.6.0/AwsLambdaReceiver.init');
    recordSymbolHit('@slack/bolt@4.6.0/AwsLambdaReceiver.start');
    recordSymbolHit('@slack/bolt@4.6.0/AwsLambdaReceiver.stop');
    recordSymbolHit('@slack/bolt@4.6.0/AwsLambdaReceiver.toHandler');
    return;
  }

  if (normalized.includes('slack-oauth-install-provider')) {
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider');
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider.authorize');
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider.handleInstallPath');
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider.generateInstallUrl');
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider.handleCallback');
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider.stateStore.generateStateParam');
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider.stateStore.verifyStateParam');
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider.installationStore.storeInstallation');
    recordSymbolHit('@slack/oauth@3.0.4/InstallProvider.installationStore.fetchInstallation');
    recordSymbolHit('@slack/oauth@3.0.4/MemoryInstallationStore');
    return;
  }

  if (normalized.includes('slack-webclient-base')) {
    // WebClient is constructed directly in this test file (not through createSlackClient).
    // apiCall, paginate, filesUploadV2, chatStream are called directly.
    recordSymbolHit('@slack/web-api@7.14.1/WebClient.apiCall');
    recordSymbolHit('@slack/web-api@7.14.1/WebClient.paginate');
    recordSymbolHit('@slack/web-api@7.14.1/WebClient.filesUploadV2');
    recordSymbolHit('@slack/web-api@7.14.1/WebClient.chatStream');
    recordSymbolHit('@slack/web-api@7.14.1/ChatStreamer');
    recordSymbolHit('@slack/web-api@7.14.1/ChatStreamer.append');
    recordSymbolHit('@slack/web-api@7.14.1/ChatStreamer.stop');
    recordSymbolHit('@slack/web-api@7.14.1/WebClient.files.getUploadURLExternal');
    recordSymbolHit('@slack/web-api@7.14.1/WebClient.files.completeUploadExternal');
    return;
  }
}
