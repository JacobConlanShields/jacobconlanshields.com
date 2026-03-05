import { json } from '../../_lib/media.js';
import { photoPublicUrl, readPhotoIndex, readPhotoLayout } from '../../_lib/photos-manifest.js';

function enrich(item) {
  const aspect = item.aspect || (item.width && item.height ? item.width / item.height : 1);
  return {
    ...item,
    aspect,
    thumbUrl: item.thumbKey ? photoPublicUrl(item.thumbKey) : null,
    displayUrl: item.displayKey ? photoPublicUrl(item.displayKey) : null,
    originalUrl: item.originalKey ? photoPublicUrl(item.originalKey) : null,
  };
}

export async function onRequestGet({ env }) {
  const index = await readPhotoIndex(env);
  const layout = await readPhotoLayout(env);
  const items = index.map(enrich);
  return json({ items, layout: layout || { order: items.map((item) => item.id) } }, {
    headers: {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
