import { badRequest, handleOptions, json, mediaUrl, nowIso, requireAdmin, resolveBucketName, sha256Hex, signedAdminFetch, uuid, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection, r2Base, key, uploadId, parts, title = "", description = "", width = null, height = null, aspect_ratio = null, poster_r2_key = null } = await request.json();
  if (!collection || !r2Base || !key || !uploadId || !Array.isArray(parts) || !parts.length) {
    return withCors(badRequest("Missing collection/r2Base/key/uploadId/parts"));
  }

  const sortedParts = [...parts].sort((a, b) => Number(a.partNumber) - Number(b.partNumber));
  const xmlBody = `<CompleteMultipartUpload>${sortedParts
    .map((p) => `<Part><PartNumber>${Number(p.partNumber)}</PartNumber><ETag>"${String(p.etag).replaceAll('"', "")}"</ETag></Part>`)
    .join("")}</CompleteMultipartUpload>`;
  const payloadHash = await sha256Hex(xmlBody);

  const bucket = resolveBucketName(env, r2Base);
  const resp = await signedAdminFetch({
    method: "POST",
    env,
    bucket,
    key,
    query: `uploadId=${encodeURIComponent(uploadId)}`,
    payloadHash,
    body: xmlBody,
  });

  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to complete upload: ${xml}`, 502));

  const id = uuid();
  const createdAt = nowIso();
  await env.DB.prepare(`INSERT INTO media_items (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, poster_r2_key, created_at)
    VALUES (?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, collection, r2Base, key, title, description, width, height, aspect_ratio, poster_r2_key, createdAt)
    .run();
  await env.DB.prepare("UPDATE multipart_uploads SET status = 'completed', updated_at = ? WHERE key = ?").bind(nowIso(), key).run();

  return withCors(json({ id, collection, media_type: "video", r2_base: r2Base, r2_key: key, poster_r2_key, title, description, width, height, aspect_ratio, url: mediaUrl(r2Base, key), created_at: createdAt }));
}
