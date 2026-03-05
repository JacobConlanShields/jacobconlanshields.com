import { json } from '../../_lib/media.js';
import { LAYOUT_KEY, readPhotoIndex, readJsonObject } from '../../_lib/photography-meta.js';

function orderByLayout(items, layout) {
  if (!layout || !Array.isArray(layout.order)) return items;
  const rank = new Map(layout.order.map((id, idx) => [String(id), idx]));
  return items.slice().sort((a, b) => {
    const aRank = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export async function onRequestGet({ env }) {
  if (!env.PHOTO_BUCKET) return json([]);

  const index = await readPhotoIndex(env);
  const layout = await readJsonObject(env.PHOTO_BUCKET, LAYOUT_KEY, { order: [] });
  const payload = orderByLayout(index, layout);

  return json(payload, {
    headers: {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}

export const onRequest = onRequestGet;
