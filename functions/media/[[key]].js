const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function decodeKey(param = '') {
  const joined = Array.isArray(param) ? param.join('/') : String(param);
  try {
    return joined
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return '';
  }
}

function isManifest(key) {
  return key.startsWith('manifests/');
}

function contentTypeFor(object) {
  return object?.httpMetadata?.contentType || null;
}

async function handleRequest({ request, params, env }) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const key = decodeKey(params.key);
  if (!key) return new Response('Not found', { status: 404 });

  const bucket = env.PHOTO_BUCKET || env.MEDIA_BUCKET;
  if (!bucket) return new Response('Not found', { status: 404 });

  const object = await bucket.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  const contentType = contentTypeFor(object);
  if (contentType) headers.set('content-type', contentType);

  if (object.httpEtag) headers.set('etag', object.httpEtag);
  headers.set('cache-control', isManifest(key) ? 'no-store' : IMAGE_CACHE_CONTROL);

  if (request.method === 'HEAD') {
    return new Response(null, { headers });
  }

  return new Response(object.body, { headers });
}

export const onRequestGet = handleRequest;
export const onRequestHead = handleRequest;
