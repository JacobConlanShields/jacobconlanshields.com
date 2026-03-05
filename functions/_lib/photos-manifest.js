const LEGACY_MANIFEST_KEY = 'manifest/photos.json';
export const PHOTO_ROOT_PREFIX = 'photography';
export const PHOTO_META_PREFIX = `${PHOTO_ROOT_PREFIX}/meta`;
export const PHOTO_INDEX_KEY = `${PHOTO_META_PREFIX}/index.json`;
export const PHOTO_LAYOUT_KEY = `${PHOTO_META_PREFIX}/layout.json`;

async function readJson(bucket, key, fallback) {
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return fallback;
  }
}

async function writeJson(bucket, key, payload) {
  await bucket.put(key, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

export async function readPhotosManifest(env) {
  const parsed = await readJson(env.PHOTO_BUCKET, LEGACY_MANIFEST_KEY, []);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.items)) return parsed.items;
  return [];
}

export async function writePhotosManifest(env, items) {
  const sorted = items
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  await writeJson(env.PHOTO_BUCKET, LEGACY_MANIFEST_KEY, sorted);
}

export async function readPhotoIndex(env) {
  const parsed = await readJson(env.PHOTO_BUCKET, PHOTO_INDEX_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function writePhotoIndex(env, items) {
  await writeJson(env.PHOTO_BUCKET, PHOTO_INDEX_KEY, items);
}

export async function readPhotoLayout(env) {
  const parsed = await readJson(env.PHOTO_BUCKET, PHOTO_LAYOUT_KEY, null);
  if (parsed && Array.isArray(parsed.order)) return parsed;
  return null;
}

export async function ensurePhotoLayout(env, indexItems = []) {
  const existing = await readPhotoLayout(env);
  if (existing) return existing;
  const created = { order: indexItems.map((item) => item.id).filter(Boolean) };
  await writeJson(env.PHOTO_BUCKET, PHOTO_LAYOUT_KEY, created);
  return created;
}

export async function writePhotoLayout(env, order = []) {
  const normalized = [...new Set(order.map((id) => String(id || '').trim()).filter(Boolean))];
  const payload = { order: normalized };
  await writeJson(env.PHOTO_BUCKET, PHOTO_LAYOUT_KEY, payload);
  return payload;
}

export function photoPublicUrl(key) {
  return `/photos/${key.split('/').map(encodeURIComponent).join('/')}`;
}
