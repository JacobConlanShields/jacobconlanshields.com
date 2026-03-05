export async function onRequestGet(ctx) {
  return proxyMedia(ctx);
}

export async function onRequestHead(ctx) {
  return proxyMedia(ctx, { head: true });
}

async function proxyMedia({ params, env }, { head = false } = {}) {
  const raw = params.key || '';
  const key = normalizeKey(raw);
  if (!key) return new Response('Not found', { status: 404 });

  const bucket = env.PHOTO_BUCKET || env.MEDIA_BUCKET;
  if (!bucket || typeof bucket.get !== 'function') return new Response('Not configured', { status: 503 });

  const object = head ? await bucket.head(key) : await bucket.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  if (object.httpMetadata?.contentType) headers.set('content-type', object.httpMetadata.contentType);
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  headers.set('cache-control', key.startsWith('manifests/') ? 'no-store' : 'public, max-age=31536000, immutable');

  return new Response(head ? null : object.body, { status: 200, headers });
}

function normalizeKey(rawKey) {
  const parts = String(rawKey)
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  const key = parts.join('/').replace(/\\/g, '/');
  if (!key || key.includes('..')) return '';
  return key;
}
