import { json } from '../../_lib/media.js';

const INDEX_KEY = 'photography/meta/index.json';
const LAYOUT_KEY = 'photography/meta/layout.json';
const LEGACY_MANIFEST_KEY = 'manifests/photography.json';

function encodePath(key = '') {
  return String(key).split('/').map(encodeURIComponent).join('/');
}

function photoUrl(key) {
  return key ? `/photos/${encodePath(key)}` : null;
}

async function readJson(bucket, key, fallback) {
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return fallback;
  }
}

function normalizeItem(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const width = Number(raw.width) || null;
  const height = Number(raw.height) || null;
  const aspect = width && height ? width / height : Number(raw.aspect) || 1;
  return {
    ...raw,
    id: String(raw.id || crypto.randomUUID()),
    width,
    height,
    aspect,
    thumbUrl: photoUrl(raw.thumbKey),
    displayUrl: photoUrl(raw.displayKey || raw.originalKey),
    originalUrl: photoUrl(raw.originalKey),
  };
}

function applyLayout(indexItems, layout) {
  const order = Array.isArray(layout?.order) ? layout.order.map(String) : [];
  if (!order.length) return indexItems;
  const rank = new Map(order.map((id, idx) => [id, idx]));
  return indexItems.slice().sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
  const bucket = env.PHOTO_BUCKET || env.MEDIA_BUCKET;
  if (!bucket) return json([]);

  const index = await readJson(bucket, INDEX_KEY, null);
  const layout = await readJson(bucket, LAYOUT_KEY, null);

  let items = Array.isArray(index) ? index : null;
  if (!items) {
    const legacy = await readJson(bucket, LEGACY_MANIFEST_KEY, []);
    items = Array.isArray(legacy) ? legacy : [];
  }

  const normalized = items.map(normalizeItem).filter(Boolean);
  const payload = applyLayout(normalized, layout);
  return json(payload, { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } });
}
