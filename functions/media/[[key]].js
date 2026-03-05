export async function onRequest({ request, params, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { allow: 'GET, HEAD' },
    });
  }

  const key = decodeKeyParam(params.key || '');
  if (!key) return new Response('Not found', { status: 404 });

  const bucket = selectBucketForKey(key, env);
  if (!bucket || typeof bucket.get !== 'function') return new Response('Not found', { status: 404 });

  const object = await bucket.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);

  if (!headers.has('content-type') && object.httpMetadata?.contentType) {
    headers.set('content-type', object.httpMetadata.contentType);
  }

  if (object.httpEtag) headers.set('etag', object.httpEtag);
  headers.set('cache-control', key.startsWith('manifests/') ? 'no-store' : 'public, max-age=31536000, immutable');

  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}

function decodeKeyParam(raw) {
  if (!raw) return '';
  const parts = String(raw).split('/').filter(Boolean);
  const decoded = [];
  for (const part of parts) {
    try {
      decoded.push(decodeURIComponent(part));
    } catch {
      decoded.push(part);
    }
  }
  return decoded.join('/');
}

function selectBucketForKey(key, env) {
  if (key.startsWith('spincline/')) return env.SPINCLINE_BUCKET || env.PHOTO_BUCKET || env.MEDIA_BUCKET;
  return env.PHOTO_BUCKET || env.MEDIA_BUCKET;
}
