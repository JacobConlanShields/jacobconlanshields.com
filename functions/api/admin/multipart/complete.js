import {
  badRequest,
  getBucketName,
  getCollectionConfig,
  handleOptions,
  json,
  mediaUrl,
  nowIso,
  requireAdmin,
  s3AuthHeaders,
  sha256Hex,
  signR2Request,
  uuid,
  withCors,
} from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const {
    collection,
    r2Base,
    key,
    uploadId,
    parts,
    title = "",
    description = "",
    width = null,
    height = null,
    aspect_ratio = null,
    poster_r2_key = null,
  } = await request.json();

  if (!collection || !r2Base || !key || !uploadId || !Array.isArray(parts) || !parts.length) {
    return withCors(badRequest("Missing collection/r2Base/key/uploadId/parts"));
  }

  const cfg = getCollectionConfig(collection);
  if (!cfg) return withCors(badRequest("Invalid collection"));
  if (cfg.r2Base !== r2Base) return withCors(badRequest("r2Base does not match collection"));

  const record = await env.DB.prepare(
    "SELECT key FROM multipart_uploads WHERE key = ? AND upload_id = ? AND r2_base = ? AND status = 'initiated'",
  ).bind(key, uploadId, r2Base).first();
  if (!record) return withCors(badRequest("Upload record not found", 404));

  const bucketName = getBucketName(r2Base, env);
  const xmlBody = `<CompleteMultipartUpload>${parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>\"${String(p.etag).replace(/\"/g, "")}\"</ETag></Part>`)
    .join("")}</CompleteMultipartUpload>`;

  const payloadHash = await sha256Hex(xmlBody);
  const req = await signR2Request({
    method: "POST",
    bucket: bucketName,
    key,
    query: `uploadId=${encodeURIComponent(uploadId)}`,
    headers: { "content-type": "application/xml", "x-amz-content-sha256": payloadHash },
    payloadHash,
    env,
  });

  const resp = await fetch(req.url, {
    method: "POST",
    headers: { ...s3AuthHeaders(req, payloadHash), "content-type": "application/xml" },
    body: xmlBody,
  });

  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to complete upload: ${xml}`, 502));

  const id = uuid();
  const createdAt = nowIso();
  await env.DB.prepare(`INSERT INTO media_items
    (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, poster_r2_key, created_at)
    VALUES (?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, collection, r2Base, key, title, description, width, height, aspect_ratio, poster_r2_key, createdAt)
    .run();

  await env.DB.prepare("UPDATE multipart_uploads SET status = 'completed', updated_at = ? WHERE key = ?")
    .bind(nowIso(), key)
    .run();

  return withCors(json({
    id,
    collection,
    media_type: "video",
    r2_base: r2Base,
    r2_key: key,
    title,
    description,
    width,
    height,
    aspect_ratio,
    poster_r2_key,
    created_at: createdAt,
    url: mediaUrl(r2Base, key),
  }));
}
