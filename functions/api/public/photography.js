import { json } from '../../_lib/media.js';

const MANIFEST_KEY = 'manifests/photography.json';

function encodeURIComponentPath(key = '') {
  return String(key)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function fallbackTitle(item = {}) {
  if (item.id) return String(item.id);
  const sourceKey = item.originalKey || item.displayKey || item.thumbKey || '';
  const filename = sourceKey.split('/').pop() || 'Untitled';
  return filename.replace(/\.[a-z0-9]+$/i, '') || filename;
}

function fallbackId(item = {}) {
  return String(item.id || item.originalKey || item.displayKey || item.thumbKey || crypto.randomUUID());
}

function proxiedUrl(key) {
  return key ? `/media/${encodeURIComponentPath(key)}` : null;
}

function enrichRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const thumbKey = raw.thumbKey || null;
  const displayKey = raw.displayKey || null;
  const originalKey = raw.originalKey || null;

  return {
    ...raw,
    id: fallbackId(raw),
    title: raw.title || fallbackTitle(raw),
    thumbKey,
    displayKey,
    originalKey,
    thumbUrl: proxiedUrl(thumbKey),
    displayUrl: proxiedUrl(displayKey || originalKey),
    originalUrl: proxiedUrl(originalKey),
  };
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  const bucket = context.env.PHOTO_BUCKET || context.env.MEDIA_BUCKET;
  if (!bucket) return json([]);

  const object = await bucket.get(MANIFEST_KEY);
  if (!object) return json([]);

  try {
    const parsed = JSON.parse(await object.text());
    if (!Array.isArray(parsed)) return json([]);
    const payload = parsed.map(enrichRecord).filter(Boolean);
    return json(payload, {
      headers: {
        'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return json([]);
  }
}
