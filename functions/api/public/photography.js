import { json } from '../../_lib/media.js';

const MANIFEST_KEY = 'manifests/photography.json';

function encodeURIComponentPath(key = '') {
  return String(key)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizeManifestKey(value) {
  if (!value) return null;
  let key = String(value).trim();
  if (!key) return null;

  // Some manifests may contain full public URLs instead of bare object keys.
  if (key.startsWith('http://') || key.startsWith('https://')) {
    try {
      const url = new URL(key);
      key = url.pathname || '';
    } catch {
      return null;
    }
  }

  try {
    key = decodeURIComponent(key);
  } catch {
    // keep raw value when it contains malformed escapes
  }

  // R2 object keys are stored without a leading slash.
  key = key.replace(/^\/+/, '');
  return key || null;
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

  const thumbKey = normalizeManifestKey(raw.thumbKey || raw.thumb || raw.thumbnailKey || raw.thumbnail);
  const displayKey = normalizeManifestKey(raw.displayKey || raw.display || raw.previewKey || raw.imageKey);
  const originalKey = normalizeManifestKey(raw.originalKey || raw.original || raw.sourceKey || raw.fileKey);

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
