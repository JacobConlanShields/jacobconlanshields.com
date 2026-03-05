import { json } from '../_lib/media.js';
import { photoPublicUrl, readPhotoIndex, readPhotoLayout } from '../_lib/photos-manifest.js';

export async function onRequestGet({ env }) {
  const items = await readPhotoIndex(env);
  const layout = await readPhotoLayout(env);
  const payload = items.map((item) => ({
    ...item,
    originalUrl: item.originalKey ? photoPublicUrl(item.originalKey) : null,
    displayUrl: item.displayKey ? photoPublicUrl(item.displayKey) : null,
    thumbUrl: item.thumbKey ? photoPublicUrl(item.thumbKey) : null,
  }));
  return json({ items: payload, layout: layout || { order: payload.map((item) => item.id) } }, {
    headers: {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
