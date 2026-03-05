import { json } from '../../_lib/media.js';

const MANIFEST_KEY = 'manifests/photography.json';

export async function onRequestGet({ env }) {
  const bucket = env.PHOTO_BUCKET || env.MEDIA_BUCKET;
  if (!bucket || typeof bucket.get !== 'function') return json([]);

  const object = await bucket.get(MANIFEST_KEY);
  if (!object) return json([]);

  let items;
  try {
    const parsed = JSON.parse(await object.text());
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }

  const payload = items.map((item) => {
    const thumbKey = asString(item.thumbKey);
    const displayKey = asString(item.displayKey);
    const originalKey = asString(item.originalKey);

    return {
      ...item,
      thumbKey,
      displayKey,
      originalKey,
      thumbUrl: thumbKey ? mediaUrlForKey(thumbKey) : null,
      displayUrl: mediaUrlForKey(displayKey || originalKey),
      originalUrl: mediaUrlForKey(originalKey),
    };
  });

  return json(payload, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}

function asString(value) {
  return typeof value === 'string' ? value : '';
}

function mediaUrlForKey(key) {
  if (!key) return null;
  return `/media/${encodeURIComponentPath(key)}`;
}

function encodeURIComponentPath(path) {
  return String(path)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}
