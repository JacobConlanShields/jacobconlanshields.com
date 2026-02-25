import { badRequest, getBucketName, handleOptions, json, requireAdmin, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));

  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { r2Base, key, uploadId, partNumber } = await request.json();
  if (!r2Base || !key || !uploadId || !partNumber) return withCors(badRequest("Missing r2Base/key/uploadId/partNumber"));

  const record = await env.DB.prepare("SELECT r2_base FROM multipart_uploads WHERE key = ? AND upload_id = ?").bind(key, uploadId).first();
  if (!record || record.r2_base !== r2Base) return withCors(badRequest("Upload record not found", 404));

  const bucket = getBucketName(env, r2Base);
  const query = `partNumber=${Number(partNumber)}&uploadId=${encodeURIComponent(uploadId)}`;
  const signed = await signR2Request({ method: "PUT", bucket, key, query, env, expires: 900, payloadHash: "UNSIGNED-PAYLOAD" });

  return withCors(json({ url: signed.url }));
}
