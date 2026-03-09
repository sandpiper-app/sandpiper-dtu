import { WebClient } from '@slack/web-api';

/**
 * Create a Slack WebClient wired to the local Slack twin.
 *
 * slackApiUrl must end with '/' — WebClient appends the method name directly
 * (e.g., slackApiUrl + 'auth.test'). Omitting the trailing slash produces
 * malformed URLs like '/api/apiauth.test'.
 */
export function createSlackClient(token?: string): WebClient {
  const slackApiUrl = process.env.SLACK_API_URL!;
  return new WebClient(token ?? 'xoxb-test-token', {
    slackApiUrl: slackApiUrl.replace(/\/$/, '') + '/api/',
  });
}
