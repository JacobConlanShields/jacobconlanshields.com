import { badRequest, handleOptions, json, requireAdmin, withCors } from '../../_lib/media.js';

const ROOTS = new Set(['photography', 'spincline']);
const SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

function extFromName(name = '') {
  const idx = name.lastIndexOf('.');
  return idx > -1 ? name.slice(idx + 1).toLowerCase() : 'bin';
}

function bucketFor(root, env) {
  return root === 'photography' ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
}

function manifestKeyFor(root) {
  return root === 'photography' ? 'manifests/photography.json' : 'manifests/spincline.json';
}

async function readManifest(bucket, key) {
  const current = await bucket.get(key);
  if (!current) return [];
  try {
    const parsed = JSON.parse(await current.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validateMeta(meta = {}) {
  if (!ROOTS.has(meta.root)) return 'Invalid root';
  if (meta.root === 'spincline' && !SECTIONS.has(meta.section)) return 'Invalid spincline section';
  return null;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));

  await requireAdmin(request);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return withCors(badRequest('Expected multipart/form-data'));

  const form = await request.formData();
  const metaRaw = form.get('meta');
  if (typeof metaRaw !== 'string') return withCors(badRequest('Missing meta field'));

  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return withCors(badRequest('Invalid meta JSON'));
  }

  const validationError = validateMeta(meta);
  if (validationError) return withCors(badRequest(validationError));

  const original = form.get('original');
  const display = form.get('display');
  const thumb = form.get('thumb');
  if (!(original instanceof File)) return withCors(badRequest('Missing original file'));

  const bucket = bucketFor(meta.root, env);
  const prefix = meta.root === 'photography' ? 'photography' : `spincline/${meta.section}`;
  const id = String(meta.clientId || crypto.randomUUID());
  const originalKey = `${prefix}/original/${id}.${extFromName(original.name)}`;
  const displayKey = display instanceof File ? `${prefix}/display/${id}.jpg` : null;
  const thumbKey = thumb instanceof File ? `${prefix}/thumb/${id}.jpg` : null;

  await bucket.put(originalKey, original.stream(), { httpMetadata: { contentType: original.type || 'application/octet-stream' } });
  if (displayKey && display instanceof File) {
    await bucket.put(displayKey, display.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
  }
  if (thumbKey && thumb instanceof File) {
    await bucket.put(thumbKey, thumb.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
  }

  const record = {
    id,
    createdAt: new Date().toISOString(),
    root: meta.root,
    section: meta.root === 'spincline' ? meta.section : null,
    title: String(meta.title || ''),
    location: meta.root === 'photography' ? String(meta.secondary || '') || null : null,
    description: meta.root === 'spincline' ? String(meta.secondary || '') || null : null,
    originalKey,
    displayKey,
    thumbKey,
    originalContentType: original.type || 'application/octet-stream',
    displayContentType: displayKey ? 'image/jpeg' : null,
    thumbContentType: thumbKey ? 'image/jpeg' : null,
  };

  const manifestKey = manifestKeyFor(meta.root);
  const manifest = await readManifest(bucket, manifestKey);
  manifest.push(record);
  await bucket.put(manifestKey, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  });

  return withCors(json({ ok: true, item: record }));
}
