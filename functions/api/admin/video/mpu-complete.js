import { handleOptions, json, requireAdmin, withCors } from '../../../_lib/media.js';
import { manifestKeyFor, validateDestination } from './_shared.js';

function bucketFor(root, env) {
  return root === 'photography' ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
}

async function readManifest(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return [];
  try {
    const parsed = JSON.parse(await object.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));
  await requireAdmin(request);

  const body = await request.json().catch(() => null);
  if (!body) return withCors(json({ error: 'Invalid JSON' }, { status: 400 }));

  const { key, uploadId, parts, root, section, title, description, posterKey = null } = body;
  if (!key || !uploadId || !Array.isArray(parts) || !parts.length) {
    return withCors(json({ error: 'Missing key/uploadId/parts' }, { status: 400 }));
  }

  const validationError = validateDestination(root, section);
  if (validationError) return withCors(json({ error: validationError }, { status: 400 }));

  const bucket = bucketFor(root, env);
  const mpu = bucket.resumeMultipartUpload(key, uploadId);
  await mpu.complete(parts);

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    root,
    section: root === 'spincline' ? section : null,
    title: String(title || ''),
    description: String(description || '') || null,
    location: null,
    originalKey: null,
    displayKey: null,
    thumbKey: null,
    originalContentType: null,
    displayContentType: null,
    thumbContentType: null,
    videoKey: key,
    posterKey,
  };

  const manifestKey = manifestKeyFor(root);
  const manifest = await readManifest(bucket, manifestKey);
  manifest.push(record);
  await bucket.put(manifestKey, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  });

  return withCors(json({ ok: true, item: record }));
}
