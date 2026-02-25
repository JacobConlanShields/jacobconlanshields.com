import { badRequest, getBucketName, handleOptions, json, nowIso, requireAdmin, s3AuthHeaders, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { r2Base, key, uploadId } = await request.json();
  if (!r2Base || !key || !uploadId) return withCors(badRequest("Missing r2Base/key/uploadId"));

  const bucketName = getBucketName(r2Base, env);
  if (!bucketName) return withCors(badRequest("Invalid r2Base"));

  const req = await signR2Request({
    method: "DELETE",
    bucket: bucketName,
    key,
    query: `uploadId=${encodeURIComponent(uploadId)}`,
    env,
  });

  const resp = await fetch(req.url, { method: "DELETE", headers: s3AuthHeaders(req) });
  if (!resp.ok) {
    const txt = await resp.text();
    return withCors(badRequest(`Abort failed: ${txt}`, 502));
  }

  await env.DB.prepare("UPDATE multipart_uploads SET status = 'aborted', updated_at = ? WHERE key = ?")
    .bind(nowIso(), key)
    .run();

  return withCors(json({ ok: true }));
}
