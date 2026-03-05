import { json } from '../../_lib/media.js';

const MANIFEST_KEY = 'manifests/photography.json';

export async function onRequestGet({ env }) {
  const bucket = env.PHOTO_BUCKET || env.MEDIA_BUCKET;
  if (!bucket || typeof bucket.get !== 'function') return json([]);

  let items = [];
  try {
    const obj = await bucket.get(MANIFEST_KEY);
    if (obj) {
      const parsed = JSON.parse(await obj.text());
      items = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    items = [];
  }

  const payload = items.map((item) => {
    const thumbKey = item?.thumbKey || null;
    const displayKey = item?.displayKey || null;
    const originalKey = item?.originalKey || null;

    return {
      ...item,
      thumbKey,
      displayKey,
      originalKey,
      thumbUrl: thumbKey ? mediaUrl(thumbKey) : null,
      displayUrl: displayKey ? mediaUrl(displayKey) : (originalKey ? mediaUrl(originalKey) : null),
      originalUrl: originalKey ? mediaUrl(originalKey) : null,
    };
  });

  return json(payload, {
    headers: {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}

function mediaUrl(key) {
  return `/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}
