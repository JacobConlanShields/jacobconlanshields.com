import { json } from '../_lib/media.js';
import { photoPublicUrl, readPhotosManifest } from '../_lib/photos-manifest.js';

export async function onRequestGet({ env }) {
  const items = await readPhotosManifest(env);
  const payload = items.map((item) => ({
    ...item,
    title: item.title || item.filename || 'Untitled',
    location: item.location || item.description || '',
    originalUrl: item.originalKey ? photoPublicUrl(item.originalKey) : null,
    displayUrl: item.displayKey ? photoPublicUrl(item.displayKey) : null,
    thumbUrl: item.thumbKey ? photoPublicUrl(item.thumbKey) : null,
  }));
  return json(payload, {
    headers: {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
