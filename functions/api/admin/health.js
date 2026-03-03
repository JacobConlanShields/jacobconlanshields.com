import { handleOptions, json, missingUploadConfig, withCors } from '../../_lib/media.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') {
    return withCors(json({ error: 'Method not allowed' }, { status: 405 }));
  }

  const missing = missingUploadConfig(env);
  const parsed = Number(env.UPLOAD_MAX_MB);
  const uploadMaxMb = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;

  if (missing.length) {
    return withCors(json({ ok: false, missing, uploadMaxMb }));
  }

  return withCors(json({ ok: true, uploadMaxMb }));
}
