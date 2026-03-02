import { handleOptions, json, requireAdmin, withCors } from '../../../_lib/media.js';
import { keyFor, uploadMaxMb, validateDestination } from './_shared.js';

function bucketFor(root, env) {
  return root === 'photography' ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));
  await requireAdmin(request);

  const body = await request.json().catch(() => null);
  if (!body) return withCors(json({ error: 'Invalid JSON' }, { status: 400 }));

  const { root, section, filename, contentType } = body;
  const validationError = validateDestination(root, section);
  if (validationError) return withCors(json({ error: validationError }, { status: 400 }));

  const key = keyFor(root, section, filename);
  const bucket = bucketFor(root, env);
  const mpu = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: contentType || 'video/mp4' },
  });

  const max = uploadMaxMb(env);
  const partSizeBytes = Math.min(25 * 1024 * 1024, Math.max(5 * 1024 * 1024, Math.floor(max * 0.8 * 1024 * 1024)));
  return withCors(json({ key, uploadId: mpu.uploadId, partSizeBytes }));
}
