import { badRequest, getBucketName, handleOptions, json, nowIso, requireAdmin, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { r2Base, key, uploadId } = await request.json();
  if (!r2Base || !key || !uploadId) return withCors(badRequest("Missing r2Base/key/uploadId"));

  const record = await env.DB.prepare("SELECT r2_base FROM multipart_uploads WHERE key = ? AND upload_id = ?").bind(key, uploadId).first();
  if (!record || record.r2_base !== r2Base) return withCors(badRequest("Upload record not found", 404));
  const bucket = getBucketName(env, r2Base);

  const req = await signR2Request({ method: "DELETE", bucket, key, query: `uploadId=${encodeURIComponent(uploadId)}`, env });
  const resp = await fetch(req.url, { method: "DELETE", headers: { authorization: req.authorization, "x-amz-date": req.amzDate, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" } });
  if (!resp.ok) {
    const txt = await resp.text();
    return withCors(badRequest(`Abort failed: ${txt}`, 502));
  }

  await env.DB.prepare("UPDATE multipart_uploads SET status = 'aborted', updated_at = ? WHERE key = ? AND upload_id = ?").bind(nowIso(), key, uploadId).run();
  return withCors(json({ ok: true }));
}
