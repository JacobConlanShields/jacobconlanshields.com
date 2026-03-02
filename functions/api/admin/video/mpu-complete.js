import { handleOptions, json, withCors } from '../../../_lib/media.js';

const ALLOWED_SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

async function readManifest(bucket, key) {
  try {
    const obj = await bucket.get(key);
    if (!obj) return [];
    const text = await obj.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));

  try {
    const body = await request.json();
    if (!body.key || !body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
      return withCors(json({ error: 'missing key/uploadId/parts' }, { status: 400 }));
    }
    if (body.root === 'spincline' && !ALLOWED_SECTIONS.has(body.section)) {
      return withCors(json({ error: 'invalid section' }, { status: 400 }));
    }

    const bucket = body.key.startsWith('photography/') ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
    const mpu = bucket.resumeMultipartUpload(body.key, body.uploadId);
    await mpu.complete(body.parts);

    const root = body.key.startsWith('photography/') ? 'photography' : 'spincline';
    const manifestKey = root === 'photography' ? 'manifests/photography.json' : 'manifests/spincline.json';
    const records = await readManifest(bucket, manifestKey);

    const record = {
      id: String(body.clientId || crypto.randomUUID()),
      createdAt: new Date().toISOString(),
      root,
      section: root === 'spincline' ? body.section : null,
      title: String(body.title || ''),
      location: root === 'photography' ? null : null,
      description: String(body.description || '') || null,
      videoKey: body.key,
      posterKey: body.posterKey || null,
      originalKey: body.key,
      displayKey: null,
      thumbKey: null,
      originalContentType: String(body.contentType || 'video/mp4'),
      displayContentType: null,
      thumbContentType: null,
    };

    records.push(record);
    await bucket.put(manifestKey, JSON.stringify(records, null, 2), {
      httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    });

    return withCors(json({ ok: true, item: record }));
  } catch (error) {
    return withCors(json({ error: error.message || 'failed to complete upload' }, { status: 500 }));
  }
}
