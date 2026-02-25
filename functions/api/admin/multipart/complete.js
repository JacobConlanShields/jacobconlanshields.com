import { badRequest, getBucketName, handleOptions, json, mediaUrl, nowIso, requireAdmin, sha256Hex, signR2Request, uuid, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection, r2Base, key, uploadId, parts, title = "", description = "", width = null, height = null, aspect_ratio = null, poster_r2_key = null } = await request.json();
  if (!collection || !r2Base || !key || !uploadId || !Array.isArray(parts) || !parts.length) return withCors(badRequest("Missing required fields"));

  const record = await env.DB.prepare("SELECT collection, r2_base FROM multipart_uploads WHERE key = ? AND upload_id = ?").bind(key, uploadId).first();
  if (!record || record.collection !== collection || record.r2_base !== r2Base) return withCors(badRequest("Upload record not found", 404));

  const bucket = getBucketName(env, r2Base);
  const xmlBody = `<CompleteMultipartUpload>${parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>\"${String(p.etag).replace(/\"/g, "")}\"</ETag></Part>`)
    .join("")}</CompleteMultipartUpload>`;
  const payloadHash = await sha256Hex(xmlBody);

  const req = await signR2Request({
    method: "POST",
    bucket,
    key,
    query: `uploadId=${encodeURIComponent(uploadId)}`,
    headers: { "content-type": "application/xml", "x-amz-content-sha256": payloadHash },
    payloadHash,
    env,
  });

  const resp = await fetch(req.url, {
    method: "POST",
    headers: { authorization: req.authorization, "x-amz-date": req.amzDate, "x-amz-content-sha256": payloadHash, "content-type": "application/xml" },
    body: xmlBody,
  });

  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to complete upload: ${xml}`, 502));

  const id = uuid();
  const createdAt = nowIso();
  await env.DB.prepare(`INSERT INTO media_items (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, poster_r2_key, created_at)
    VALUES (?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, record.collection, record.r2_base, key, title, description, width, height, aspect_ratio, poster_r2_key, createdAt).run();
  await env.DB.prepare("UPDATE multipart_uploads SET status = 'completed', updated_at = ? WHERE key = ? AND upload_id = ?").bind(nowIso(), key, uploadId).run();

  return withCors(json({ id, collection: record.collection, media_type: "video", r2_base: record.r2_base, r2_key: key, url: mediaUrl(record.r2_base, key), poster_r2_key, title, description, width, height, aspect_ratio, created_at: createdAt }));
}
