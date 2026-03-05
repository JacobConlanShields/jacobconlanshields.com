import { json } from '../../_lib/media.js';
import { readPhotosManifest } from '../../_lib/photos-manifest.js';

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

async function pickFirstExistingKey(bucket, keys = []) {
  for (const key of keys) {
    if (!key) continue;
    const obj = await bucket.head(key);
    if (obj) return key;
  }
  return null;
}

async function enrichRecord(raw, bucket) {
  if (!raw || typeof raw !== 'object') return null;

  const thumbKey = raw.thumbKey || raw.thumb_key || null;
  const displayKey = raw.displayKey || raw.display_key || null;
  const originalKey = raw.originalKey || raw.original_key || raw.key || null;

  const renderKey = await pickFirstExistingKey(bucket, [thumbKey, displayKey, originalKey]);
  const fullKey = await pickFirstExistingKey(bucket, [displayKey, originalKey]);
  const rawKey = await pickFirstExistingKey(bucket, [originalKey, displayKey, thumbKey]);

  return {
    ...raw,
    id: fallbackId(raw),
    title: raw.title || fallbackTitle(raw),
    location: raw.location || raw.description || '',
    thumbKey,
    displayKey,
    originalKey,
    thumbUrl: proxiedUrl(renderKey),
    displayUrl: proxiedUrl(fullKey),
    originalUrl: proxiedUrl(rawKey),
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

  try {
    const parsed = await readPhotosManifest({ ...context.env, PHOTO_BUCKET: bucket });
    const list = Array.isArray(parsed) ? parsed : [];
    const payload = (await Promise.all(list.map((item) => enrichRecord(item, bucket)))).filter(Boolean);
    return json(payload, {
      headers: {
        'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return json([]);
  }
}
