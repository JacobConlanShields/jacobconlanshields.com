import { photoPublicUrl } from './photos-manifest.js';

export const PHOTOGRAPHY_PREFIX = 'photography';
export const INDEX_KEY = `${PHOTOGRAPHY_PREFIX}/meta/index.json`;
export const LAYOUT_KEY = `${PHOTOGRAPHY_PREFIX}/meta/layout.json`;

export function normalizePhotoRecord(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const width = Number(raw.width) || null;
  const height = Number(raw.height) || null;
  const aspect = width && height ? width / height : null;
  const entry = {
    id: String(raw.id || crypto.randomUUID()),
    destination: 'photography',
    title: String(raw.title || 'Untitled'),
    location: String(raw.location || ''),
    description: String(raw.description || ''),
    width,
    height,
    aspect,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    originalKey: raw.originalKey ? String(raw.originalKey) : null,
    displayKey: raw.displayKey ? String(raw.displayKey) : null,
    thumbKey: raw.thumbKey ? String(raw.thumbKey) : null,
    originalUrl: raw.originalKey ? photoPublicUrl(String(raw.originalKey)) : null,
    displayUrl: raw.displayKey ? photoPublicUrl(String(raw.displayKey)) : null,
    thumbUrl: raw.thumbKey ? photoPublicUrl(String(raw.thumbKey)) : null,
    captureDate: raw.captureDate ? String(raw.captureDate) : null,
  };
  return entry;
}

export async function readJsonObject(bucket, key, fallback) {
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return fallback;
  }
}

export async function writeJsonObject(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

export async function readPhotoIndex(env) {
  const parsed = await readJsonObject(env.PHOTO_BUCKET, INDEX_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function writePhotoIndex(env, items) {
  const normalized = items
    .map((item) => normalizePhotoRecord(item))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  await writeJsonObject(env.PHOTO_BUCKET, INDEX_KEY, normalized);
}

export async function ensureLayout(env, indexItems = []) {
  const parsed = await readJsonObject(env.PHOTO_BUCKET, LAYOUT_KEY, null);
  if (parsed && Array.isArray(parsed.order)) return parsed;
  const created = { order: indexItems.map((item) => item.id) };
  await writeJsonObject(env.PHOTO_BUCKET, LAYOUT_KEY, created);
  return created;
}
