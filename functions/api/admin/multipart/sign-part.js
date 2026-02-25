import { badRequest, getBucketName, handleOptions, json, requireAdmin, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));

  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { r2Base, key, uploadId, partNumber } = await request.json();
  if (!r2Base || !key || !uploadId || !partNumber) return withCors(badRequest("Missing r2Base/key/uploadId/partNumber"));

  const bucketName = getBucketName(r2Base, env);
  if (!bucketName) return withCors(badRequest("Invalid r2Base"));

  const query = `partNumber=${Number(partNumber)}&uploadId=${encodeURIComponent(uploadId)}`;
  const signed = await signR2Request({ method: "PUT", bucket: bucketName, key, query, env, expires: 900 });

  return withCors(json({ url: signed.url }));
}
