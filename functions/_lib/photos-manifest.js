const PRIMARY_MANIFEST_KEY = 'manifests/photography.json';
const LEGACY_MANIFEST_KEY = 'manifest/photos.json';

export async function readPhotosManifest(env) {
  const keys = [PRIMARY_MANIFEST_KEY, LEGACY_MANIFEST_KEY];
  for (const key of keys) {
    const obj = await env.PHOTO_BUCKET.get(key);
    if (!obj) continue;
    try {
      const parsed = JSON.parse(await obj.text());
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.items)) return parsed.items;
    } catch {
      // keep trying fallback key
    }
  }
  return [];
}

export async function writePhotosManifest(env, items) {
  const sorted = items
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  await env.PHOTO_BUCKET.put(PRIMARY_MANIFEST_KEY, JSON.stringify(sorted, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

export function photoPublicUrl(key) {
  return `/photos/${key.split('/').map(encodeURIComponent).join('/')}`;
}
