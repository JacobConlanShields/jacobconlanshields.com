import { handleOptions, json, withCors } from '../../../_lib/media.js';

const ALLOWED_ROOTS = new Set(['photography', 'spincline']);
const ALLOWED_SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

function safeName(name = 'upload.bin') {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));

  try {
    const uploadMaxMb = Number(env.UPLOAD_MAX_MB || 100);
    const body = await request.json();
    if (!ALLOWED_ROOTS.has(body.root)) return withCors(json({ error: 'invalid root' }, { status: 400 }));
    if (body.root === 'spincline' && !ALLOWED_SECTIONS.has(body.section)) {
      return withCors(json({ error: 'invalid section' }, { status: 400 }));
    }

    const prefix = body.root === 'photography' ? 'photography/video' : `spincline/${body.section}/video`;
    const key = `${prefix}/${crypto.randomUUID()}-${safeName(body.filename)}`;
    const bucket = body.root === 'photography' ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;

    const basePartSize = Math.floor(uploadMaxMb * 0.8 * 1024 * 1024);
    const partSizeBytes = Math.max(5 * 1024 * 1024, Math.min(25 * 1024 * 1024, basePartSize));
    const mpu = await bucket.createMultipartUpload(key, {
      httpMetadata: { contentType: body.contentType || 'application/octet-stream' },
    });

    return withCors(json({ key, uploadId: mpu.uploadId, partSizeBytes }));
  } catch (error) {
    return withCors(json({ error: error.message || 'failed to create multipart upload' }, { status: 500 }));
  }
}
