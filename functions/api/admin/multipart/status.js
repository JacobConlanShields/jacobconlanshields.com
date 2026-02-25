import { badRequest, getBucketName, handleOptions, json, requireAdmin, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const r2Base = url.searchParams.get("r2Base");
  if (!key || !uploadId || !r2Base) return withCors(badRequest("Missing key/uploadId/r2Base"));

  const record = await env.DB.prepare("SELECT upload_id, r2_base FROM multipart_uploads WHERE key = ? AND upload_id = ?").bind(key, uploadId).first();
  if (!record || record.r2_base !== r2Base) return withCors(badRequest("Upload record not found", 404));

  const bucket = getBucketName(env, r2Base);
  const query = `uploadId=${encodeURIComponent(uploadId)}`;
  const req = await signR2Request({ method: "GET", bucket, key, query, env, payloadHash: "UNSIGNED-PAYLOAD", headers: {} });

  const resp = await fetch(req.url, {
    headers: { authorization: req.authorization, "x-amz-date": req.amzDate, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
  });
  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to query parts: ${xml}`, 502));

  const partMatches = [...xml.matchAll(/<Part>\s*<PartNumber>(\d+)<\/PartNumber>[\s\S]*?<ETag>"?([^<"]+)"?<\/ETag>[\s\S]*?<\/Part>/g)];
  const uploadedParts = partMatches.map((m) => ({ partNumber: Number(m[1]), etag: m[2] }));

  return withCors(json({ uploadedParts }));
}
