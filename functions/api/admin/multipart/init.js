import { badRequest, handleOptions, json, keyForUpload, nowIso, requireAdmin, resolveBucketName, sha256Hex, signedAdminFetch, withCors, xmlValue } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection, filename, contentType } = await request.json();
  const upload = keyForUpload({ collection, filename });
  if (!upload) return withCors(badRequest("Invalid collection"));

  const partSize = 33554432;
  const createdAt = nowIso();
  const bucket = resolveBucketName(env, upload.r2Base);
  const emptyHash = await sha256Hex("");

  const resp = await signedAdminFetch({
    method: "POST",
    env,
    bucket,
    key: upload.key,
    query: "uploads=1",
    payloadHash: emptyHash,
    contentType: contentType || "application/octet-stream",
  });

  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to init multipart upload: ${xml}`, 502));

  const uploadId = xmlValue(xml, "UploadId");
  if (!uploadId) return withCors(badRequest("UploadId missing from R2 response", 502));

  await env.DB.prepare(`INSERT INTO multipart_uploads (key, upload_id, collection, r2_base, media_type, original_filename, content_type, part_size, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'video', ?, ?, ?, 'initiated', ?, ?)`)
    .bind(upload.key, uploadId, collection, upload.r2Base, filename || null, contentType || null, partSize, createdAt, createdAt)
    .run();

  return withCors(json({ r2Base: upload.r2Base, key: upload.key, uploadId, partSize }));
}
