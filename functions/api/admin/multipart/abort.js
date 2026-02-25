import { badRequest, handleOptions, json, nowIso, requireAdmin, resolveBucketName, signedAdminFetch, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { r2Base, key, uploadId } = await request.json();
  if (!r2Base || !key || !uploadId) return withCors(badRequest("Missing r2Base/key/uploadId"));

  const bucket = resolveBucketName(env, r2Base);
  const resp = await signedAdminFetch({ method: "DELETE", env, bucket, key, query: `uploadId=${encodeURIComponent(uploadId)}`, contentType: null });
  if (!resp.ok) {
    const txt = await resp.text();
    return withCors(badRequest(`Abort failed: ${txt}`, 502));
  }

  await env.DB.prepare("UPDATE multipart_uploads SET status = 'aborted', updated_at = ? WHERE key = ?").bind(nowIso(), key).run();
  return withCors(json({ ok: true }));
}
