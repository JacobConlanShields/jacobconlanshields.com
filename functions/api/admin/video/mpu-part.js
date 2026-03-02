import { handleOptions, json, withCors } from '../../../_lib/media.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'PUT') return withCors(json({ error: 'Method not allowed' }, { status: 405 }));

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const uploadId = url.searchParams.get('uploadId');
    const partNumber = Number(url.searchParams.get('partNumber'));
    if (!key || !uploadId || !partNumber) return withCors(json({ error: 'missing key/uploadId/partNumber' }, { status: 400 }));

    const bucket = key.startsWith('photography/') ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
    const mpu = bucket.resumeMultipartUpload(key, uploadId);
    const uploadedPart = await mpu.uploadPart(partNumber, request.body);
    return withCors(json({ etag: uploadedPart.etag, partNumber: uploadedPart.partNumber }));
  } catch (error) {
    return withCors(json({ error: error.message || 'failed to upload part' }, { status: 500 }));
  }
}
