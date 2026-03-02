import { handleOptions, json, withCors } from '../../_lib/media.js';

const ALLOWED_ROOTS = new Set(['photography', 'spincline']);
const ALLOWED_SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

function extFromName(name = '', type = '') {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext && ext !== name.toLowerCase()) return ext;
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/heic') return 'heic';
  return 'bin';
}

function pickBucket(env, root) {
  return root === 'photography' ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
}

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

async function writeManifest(bucket, key, next) {
  await bucket.put(key, JSON.stringify(next, null, 2), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    customMetadata: { updatedBy: 'admin-upload-v2' },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));

  try {
    const form = await request.formData();
    const rawMeta = form.get('meta');
    const original = form.get('original');
    const display = form.get('display');
    const thumb = form.get('thumb');

    if (typeof rawMeta !== 'string') return withCors(json({ error: 'meta is required' }, { status: 400 }));
    if (!(original instanceof File)) return withCors(json({ error: 'original is required' }, { status: 400 }));

    const meta = JSON.parse(rawMeta);
    const root = meta.root;
    const section = meta.section || null;
    if (!ALLOWED_ROOTS.has(root)) return withCors(json({ error: 'invalid root' }, { status: 400 }));
    if (root === 'spincline' && !ALLOWED_SECTIONS.has(section)) {
      return withCors(json({ error: 'invalid section for spincline' }, { status: 400 }));
    }

    const bucket = pickBucket(env, root);
    const clientId = String(meta.clientId || crypto.randomUUID());
    const originalExt = extFromName(original.name, original.type);

    const base = root === 'photography' ? 'photography' : `spincline/${section}`;
    const originalKey = `${base}/original/${clientId}.${originalExt}`;
    const displayKey = display instanceof File ? `${base}/display/${clientId}.jpg` : null;
    const thumbKey = thumb instanceof File ? `${base}/thumb/${clientId}.jpg` : null;

    await bucket.put(originalKey, original.stream(), {
      httpMetadata: { contentType: original.type || 'application/octet-stream' },
    });

    if (display instanceof File) {
      await bucket.put(displayKey, display.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
    }
    if (thumb instanceof File) {
      await bucket.put(thumbKey, thumb.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
    }

    const record = {
      id: clientId,
      createdAt: new Date().toISOString(),
      root,
      section: root === 'spincline' ? section : null,
      title: String(meta.title || ''),
      location: root === 'photography' ? String(meta.secondary || '') || null : null,
      description: root === 'spincline' ? String(meta.secondary || '') || null : null,
      originalKey,
      displayKey,
      thumbKey,
      originalContentType: original.type || 'application/octet-stream',
      displayContentType: displayKey ? 'image/jpeg' : null,
      thumbContentType: thumbKey ? 'image/jpeg' : null,
    };

    const manifestKey = root === 'photography' ? 'manifests/photography.json' : 'manifests/spincline.json';
    const current = await readManifest(bucket, manifestKey);
    current.push(record);
    await writeManifest(bucket, manifestKey, current);

    return withCors(json({ ok: true, item: record }));
  } catch (error) {
    return withCors(json({ error: error.message || 'upload failed' }, { status: 500 }));
  }
}
