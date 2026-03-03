import { badRequest, handleOptions, json, requireAdmin, withCors } from '../../_lib/media.js';

const VALID_ROOTS = new Set(['photography', 'spincline']);
const VALID_SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

function extFromName(name = '', type = '') {
  const fromName = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (fromName) return fromName;
  const fromType = String(type || '').split('/')[1];
  return fromType || 'bin';
}

async function readJsonManifest(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return [];
  try {
    const parsed = JSON.parse(await object.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJsonManifest(bucket, key, list) {
  await bucket.put(key, JSON.stringify(list, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

function parseMeta(raw) {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));

  await requireAdmin(request);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return withCors(badRequest('Expected multipart/form-data'));

  const form = await request.formData();
  const meta = parseMeta(form.get('meta'));
  const original = form.get('original');
  const display = form.get('display');
  const thumb = form.get('thumb');

  if (!meta) return withCors(badRequest('Invalid or missing meta JSON'));
  if (!(original instanceof File)) return withCors(badRequest('original file is required'));

  const { id, root, section = null, title = '', secondary = '', originalName = original.name, originalType = original.type } = meta;

  if (!id || typeof id !== 'string') return withCors(badRequest('meta.id is required'));
  if (!VALID_ROOTS.has(root)) return withCors(badRequest('Invalid root'));
  if (root === 'spincline' && !VALID_SECTIONS.has(section)) return withCors(badRequest('Invalid spincline section'));

  const bucket = root === 'photography' ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
  if (!bucket || typeof bucket.put !== 'function') return withCors(json({ error: 'Upload bucket is not configured' }, { status: 503 }));

  const prefix = root === 'photography' ? 'photography' : `spincline/${section}`;
  const originalExt = extFromName(originalName || original.name, originalType || original.type);

  const originalKey = `${prefix}/original/${id}.${originalExt}`;
  const displayKey = display instanceof File ? `${prefix}/display/${id}.jpg` : null;
  const thumbKey = thumb instanceof File ? `${prefix}/thumb/${id}.jpg` : null;

  await bucket.put(originalKey, original.stream(), {
    httpMetadata: { contentType: originalType || original.type || 'application/octet-stream' },
  });

  if (displayKey) {
    await bucket.put(displayKey, display.stream(), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
  }

  if (thumbKey) {
    await bucket.put(thumbKey, thumb.stream(), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
  }

  const manifestKey = root === 'photography' ? 'manifests/photography.json' : 'manifests/spincline.json';
  const list = await readJsonManifest(bucket, manifestKey);

  const record = {
    id,
    createdAt: new Date().toISOString(),
    root,
    section: root === 'spincline' ? section : null,
    title: String(title || ''),
    location: root === 'photography' ? String(secondary || '') || null : null,
    description: root === 'spincline' ? String(secondary || '') || null : null,
    originalKey,
    displayKey,
    thumbKey,
    originalContentType: originalType || original.type || 'application/octet-stream',
    displayContentType: displayKey ? 'image/jpeg' : null,
    thumbContentType: thumbKey ? 'image/jpeg' : null,
  };

  list.push(record);
  await writeJsonManifest(bucket, manifestKey, list);

  return withCors(json({ ok: true, item: record }));
}
