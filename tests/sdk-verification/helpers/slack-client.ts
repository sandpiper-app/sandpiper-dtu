import { WebClient } from '@slack/web-api';
import { recordSymbolHit } from '../setup/execution-evidence-runtime.js';

/**
 * Create a Slack WebClient wired to the local Slack twin.
 *
 * slackApiUrl must end with '/' — WebClient appends the method name directly
 * (e.g., slackApiUrl + 'auth.test'). Omitting the trailing slash produces
 * malformed URLs like '/api/apiauth.test'.
 *
 * Helper-seam capture (Phase 40, INFRA-23):
 *   The Slack SDK binds method stubs (admin.users.list, chat.postMessage, etc.)
 *   to `this.apiCall` at construction time via `self.apiCall.bind(self, method)`.
 *   Because bindings capture `self.apiCall` before we can patch the instance,
 *   we patch `WebClient.prototype.apiCall` before constructing the instance.
 *   This ensures the bound methods call our instrumented version.
 *
 *   We restore the prototype after construction so other WebClient instances
 *   (e.g., in exception-set test files) are not affected.
 */
export function createSlackClient(token?: string): WebClient {
  const slackApiUrl = process.env.SLACK_API_URL!;

  // Capture the real prototype method before patching
  const originalProtoApiCall = WebClient.prototype.apiCall;

  // Patch the prototype so that bindings created during construction reference our wrapper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (WebClient.prototype as any).apiCall = async function instrumentedApiCall(
    method: string,
    options?: Record<string, unknown>
  ) {
    recordSymbolHit(`@slack/web-api@7.14.1/WebClient.${method}`);
    return originalProtoApiCall.call(this, method, options);
  };

  // Construct the client while the prototype is patched so method bindings
  // (admin.users.list, chat.postMessage, etc.) capture our instrumented version.
  const client = new WebClient(token ?? 'xoxb-test-token', {
    slackApiUrl: slackApiUrl.replace(/\/$/, '') + '/api/',
  });

  // Restore the prototype immediately after construction.
  // The bound methods on `client` already captured the instrumented version —
  // restoration only affects future WebClient instances.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (WebClient.prototype as any).apiCall = originalProtoApiCall;

  return client;
}
