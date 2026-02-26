const MANIFEST_KEY = 'manifest/photos.json';

export async function readPhotosManifest(env) {
  const obj = await env.PHOTO_BUCKET.get(MANIFEST_KEY);
  if (!obj) return [];
  try {
    const parsed = JSON.parse(await obj.text());
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
}

export async function writePhotosManifest(env, items) {
  const sorted = items
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  await env.PHOTO_BUCKET.put(MANIFEST_KEY, JSON.stringify(sorted, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

export function photoPublicUrl(key) {
  return `/photos/${key.split('/').map(encodeURIComponent).join('/')}`;
}
