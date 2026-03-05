import { json } from '../_lib/media.js';
import { LAYOUT_KEY, readJsonObject, readPhotoIndex } from '../_lib/photography-meta.js';

function withLayout(items, layout) {
  if (!layout || !Array.isArray(layout.order)) return items;
  const rank = new Map(layout.order.map((id, index) => [String(id), index]));
  return items.slice().sort((a, b) => {
    const ar = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
    const br = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
    return ar - br;
  });
}

export async function onRequestGet({ env }) {
  const items = await readPhotoIndex(env);
  const layout = await readJsonObject(env.PHOTO_BUCKET, LAYOUT_KEY, { order: [] });
  return json(withLayout(items, layout), {
    headers: {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
