import { json } from '../_lib/media.js';

async function readJson(bucket, key, fallback) {
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return fallback;
  }
}

function toUrl(key) {
  return key ? `/photos/${String(key).split('/').map(encodeURIComponent).join('/')}` : null;
}

export async function onRequestGet({ env }) {
  const items = await readJson(env.PHOTO_BUCKET, 'photography/meta/index.json', []);
  const payload = (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    originalUrl: toUrl(item.originalKey),
    displayUrl: toUrl(item.displayKey || item.originalKey),
    thumbUrl: toUrl(item.thumbKey),
  }));
  return json(payload, { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } });
}
