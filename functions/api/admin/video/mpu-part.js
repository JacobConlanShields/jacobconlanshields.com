import { handleOptions, json, requireAdmin, withCors } from '../../../_lib/media.js';

function bucketForKey(key, env) {
  return key.startsWith('photography/') ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'PUT') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));
  await requireAdmin(request);

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const uploadId = url.searchParams.get('uploadId');
  const partNumber = Number(url.searchParams.get('partNumber'));

  if (!key || !uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
    return withCors(json({ error: 'Missing key/uploadId/partNumber' }, { status: 400 }));
  }

  const bucket = bucketForKey(key, env);
  const mpu = bucket.resumeMultipartUpload(key, uploadId);
  const uploadedPart = await mpu.uploadPart(partNumber, request.body);
  return withCors(json({ etag: uploadedPart.etag, partNumber: uploadedPart.partNumber }));
}
