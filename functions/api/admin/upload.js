import { badRequest, handleOptions, json, nowIso, withCors } from '../../_lib/media.js';

const ROOTS = new Set(['photography', 'spincline']);
const SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

function extFrom(file, fallbackType = '') {
  const name = file?.name || '';
  const dot = name.lastIndexOf('.');
  if (dot > -1 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase();
  const type = fallbackType || file?.type || '';
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'bin';
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

async function writeManifest(bucket, key, items) {
  await bucket.put(key, JSON.stringify(items, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return withCors(badRequest('Method not allowed', 405));

  const form = await request.formData();
  const metaRaw = form.get('meta');
  const original = form.get('original');
  const display = form.get('display');
  const thumb = form.get('thumb');

  if (typeof metaRaw !== 'string') return withCors(badRequest('Missing meta'));
  if (!(original instanceof File)) return withCors(badRequest('Missing original file'));

  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return withCors(badRequest('Invalid meta JSON'));
  }

  const root = String(meta.root || '');
  const section = meta.section == null ? null : String(meta.section);
  if (!ROOTS.has(root)) return withCors(badRequest('Invalid root'));
  if (root === 'spincline' && !SECTIONS.has(section || '')) return withCors(badRequest('Invalid spincline section'));

  const id = String(meta.id || crypto.randomUUID());
  const createdAt = nowIso();
  const isPhotography = root === 'photography';
  const bucket = isPhotography ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
  if (!bucket) return withCors(badRequest('Missing R2 bucket config', 503));

  const basePrefix = isPhotography ? 'photography' : `spincline/${section}`;
  const originalExt = extFrom(original, meta.originalType);
  const originalKey = `${basePrefix}/original/${id}.${originalExt}`;
  const displayKey = display instanceof File ? `${basePrefix}/display/${id}.jpg` : null;
  const thumbKey = thumb instanceof File ? `${basePrefix}/thumb/${id}.jpg` : null;

  await bucket.put(originalKey, original.stream(), {
    httpMetadata: { contentType: meta.originalType || original.type || 'application/octet-stream' },
  });

  if (displayKey && display instanceof File) {
    await bucket.put(displayKey, display.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
  }

  if (thumbKey && thumb instanceof File) {
    await bucket.put(thumbKey, thumb.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
  }

  const record = {
    id,
    createdAt,
    root,
    section: isPhotography ? null : section,
    title: String(meta.title || '').trim(),
    location: isPhotography ? String(meta.secondary || '').trim() || null : null,
    description: isPhotography ? null : String(meta.secondary || '').trim() || null,
    originalKey,
    displayKey,
    thumbKey,
    originalContentType: meta.originalType || original.type || 'application/octet-stream',
    displayContentType: displayKey ? 'image/jpeg' : null,
    thumbContentType: thumbKey ? 'image/jpeg' : null,
  };

  const manifestKey = isPhotography ? 'manifests/photography.json' : 'manifests/spincline.json';
  const manifest = await readManifest(bucket, manifestKey);
  manifest.push(record);
  await writeManifest(bucket, manifestKey, manifest);

  return withCors(json({ ok: true, item: record }));
}
