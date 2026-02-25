import { badRequest, handleOptions, json, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));


  const { key, uploadId, partNumber } = await request.json();
  if (!key || !uploadId || !partNumber) return withCors(badRequest("Missing key/uploadId/partNumber"));

  const record = await env.DB.prepare("SELECT r2_base FROM multipart_uploads WHERE key = ? AND upload_id = ?").bind(key, uploadId).first();
  if (!record) return withCors(badRequest("Upload record not found", 404));

  const bucketName = record.r2_base === "SPINCLINE" ? env.SPINCLINE_BUCKET.name : env.PHOTO_BUCKET.name;
  const query = `partNumber=${Number(partNumber)}&uploadId=${encodeURIComponent(uploadId)}`;
  const signed = await signR2Request({
    method: "PUT",
    bucket: bucketName,
    key,
    query,
    env,
    expires: 900,
  });

  return withCors(json({ url: signed.url }));
}
