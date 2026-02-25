import { badRequest, handleOptions, json, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET") return withCors(badRequest("Method not allowed", 405));

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return withCors(badRequest("Missing key"));

  const record = await env.DB.prepare("SELECT upload_id, r2_base FROM multipart_uploads WHERE key = ?").bind(key).first();
  if (!record) return withCors(badRequest("Upload record not found", 404));

  const bucketName = record.r2_base === "SPINCLINE" ? env.SPINCLINE_BUCKET.name : env.PHOTO_BUCKET.name;
  const query = `uploadId=${encodeURIComponent(record.upload_id)}`;
  const req = await signR2Request({ method: "GET", bucket: bucketName, key, query, env, payloadHash: "UNSIGNED-PAYLOAD", headers: {} });

  const resp = await fetch(req.url, {
    headers: { authorization: req.authorization, "x-amz-date": req.amzDate, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
  });
  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to query parts: ${xml}`, 502));

  const partMatches = [...xml.matchAll(/<Part>\s*<PartNumber>(\d+)<\/PartNumber>[\s\S]*?<ETag>"?([^<"]+)"?<\/ETag>[\s\S]*?<\/Part>/g)];
  const uploadedParts = partMatches.map((m) => Number(m[1]));
  const etags = partMatches.map((m) => ({ partNumber: Number(m[1]), etag: m[2] }));

  return withCors(json({ key, uploadId: record.upload_id, uploadedParts, etags }));
}
