/**
 * Files Web API routes for Slack twin
 *
 * Implements the 3-endpoint chain required by WebClient.filesUploadV2:
 *   1. POST /api/files.getUploadURLExternal  — step 1: get an absolute upload URL
 *   2. POST /api/_upload/:file_id            — step 2: binary upload (no auth)
 *   3. POST /api/files.completeUploadExternal — step 3: commit the upload
 *
 * CRITICAL: upload_url in step 1 MUST be an absolute URL. The SDK calls it
 * directly via axios (not through WebClient), so it must be resolvable without
 * a base URL. SLACK_API_URL is read per-request because globalSetup sets it
 * AFTER the twin boots.
 */

import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import { checkScope, METHOD_SCOPES } from '../../services/method-scopes.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';

declare module 'fastify' {
  interface FastifyInstance { slackStateManager: SlackStateManager; }
}

const filesPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /api/files.getUploadURLExternal — step 1 of filesUploadV2 chain
  fastify.post('/api/files.getUploadURLExternal', async (request, reply) => {
    const token = extractToken(request);
    if (!token) return reply.send({ ok: false, error: 'not_authed' });
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
    // SLCK-18: scope enforcement
    const scopeCheck = checkScope('files.getUploadURLExternal', tokenRecord.scope);
    if (scopeCheck) return reply.status(200).send({ ok: false, ...scopeCheck });
    // SLCK-19: scope headers
    reply.header('X-OAuth-Scopes', tokenRecord.scope);
    reply.header('X-Accepted-OAuth-Scopes', METHOD_SCOPES['files.getUploadURLExternal']?.join(',') ?? '');
    const file_id = `F_${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
    // CRITICAL: upload_url MUST be absolute — SDK calls it directly, not via slackApiUrl
    // Read SLACK_API_URL per-request (set by globalSetup AFTER twin boots)
    const baseUrl = (process.env.SLACK_API_URL ?? '').replace(/\/api\/?$/, '');
    const upload_url = `${baseUrl}/api/_upload/${file_id}`;
    return { ok: true, file_id, upload_url };
  });

  // POST /api/_upload/:file_id — step 2 of filesUploadV2 chain (binary upload)
  // No auth required — SDK calls upload_url directly using axios.post(), not through WebClient auth
  // CRITICAL: Must be POST — WebClient.postFileUploadsToExternalURL() calls axios.post(url, body, config)
  fastify.post('/api/_upload/:file_id', async () => {
    // Accept upload, return 200. No state storage needed for conformance.
    return {};
  });

  // POST /api/files.completeUploadExternal — step 3 of filesUploadV2 chain
  fastify.post('/api/files.completeUploadExternal', async (request, reply) => {
    const token = extractToken(request);
    if (!token) return reply.send({ ok: false, error: 'not_authed' });
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
    // SLCK-18: scope enforcement
    const scopeCheck = checkScope('files.completeUploadExternal', tokenRecord.scope);
    if (scopeCheck) return reply.status(200).send({ ok: false, ...scopeCheck });
    // SLCK-19: scope headers
    reply.header('X-OAuth-Scopes', tokenRecord.scope);
    reply.header('X-Accepted-OAuth-Scopes', METHOD_SCOPES['files.completeUploadExternal']?.join(',') ?? '');

    // Normalize files field: upstream SDK serializes it as a JSON string
    const rawFiles = (request.body as any)?.files;
    let filesArray: any[];
    if (typeof rawFiles === 'string') {
      try {
        filesArray = JSON.parse(rawFiles);
      } catch {
        return reply.send({ ok: false, error: 'invalid_arguments' });
      }
    } else if (Array.isArray(rawFiles)) {
      filesArray = rawFiles;
    } else {
      return reply.send({ ok: false, error: 'invalid_arguments' });
    }
    if (!Array.isArray(filesArray)) {
      return reply.send({ ok: false, error: 'invalid_arguments' });
    }

    const userId = tokenRecord.user_id ?? 'U_BOT_TWIN';
    const completed = filesArray.map((f: any) => {
      const name = f.title ?? f.name ?? 'uploaded-file.txt';
      return {
        id: f.id,
        name,
        title: name,
        mimetype: 'text/plain',
        filetype: 'text',
        user: userId,
        url_private: `https://twin-workspace.slack.com/files/${userId}/${f.id}/${encodeURIComponent(name)}`,
        permalink: `https://twin-workspace.slack.com/files/${userId}/${f.id}/${encodeURIComponent(name)}`,
      };
    });

    return { ok: true, files: completed, response_metadata: {} };
  });
};

export default filesPlugin;
export { filesPlugin };
