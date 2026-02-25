import { buildPublicUrl, nowIso } from "../../../_lib/media-config.js";
import { error, handleOptions, json, corsHeaders } from "../../../_lib/http.js";
import { requireAdminToken } from "../../../_lib/auth.js";
import { signedS3Fetch } from "../../../_lib/s3.js";

export async function onRequest({ request, env }) {
  const opt = handleOptions(request);
  if (opt) return opt;
  if (request.method !== "POST") return error(405, "Method not allowed");
  const auth = requireAdminToken(request, env);
  if (auth) return auth;

  const { key, uploadId, parts, title, description, width, height, aspect_ratio, posterKey } = await request.json();
  if (!key || !uploadId || !Array.isArray(parts) || !parts.length) return error(400, "Missing multipart completion fields");

  const upload = await env.DB.prepare(
    "SELECT collection, r2_base FROM multipart_uploads WHERE key = ?1 AND upload_id = ?2 AND status = 'initiated'"
  ).bind(key, uploadId).first();
  if (!upload) return error(404, "Upload session not found");

  const bucket = upload.r2_base === "SPINCLINE" ? env.SPINCLINE_BUCKET_NAME : env.PHOTO_BUCKET_NAME;
  const payload = `<CompleteMultipartUpload>${parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>\"${p.etag.replace(/\"/g, "")}\"</ETag></Part>`)
    .join("")}</CompleteMultipartUpload>`;

  const completeResp = await signedS3Fetch({
    env,
    method: "POST",
    bucket,
    key,
    queryParams: { uploadId },
    body: payload,
    contentType: "application/xml",
  });
  const completeText = await completeResp.text();
  if (!completeResp.ok) return error(502, completeText.slice(0, 240));

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO media_items
        (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, poster_r2_key, created_at)
       VALUES (?1, ?2, 'video', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(id, upload.collection, upload.r2_base, key, title || "", description || "", width || null, height || null, aspect_ratio || null, posterKey || null, createdAt),
    env.DB.prepare("UPDATE multipart_uploads SET status = 'completed', updated_at = ?1 WHERE key = ?2").bind(createdAt, key),
  ]);

  return json({
    id,
    collection: upload.collection,
    media_type: "video",
    title: title || "",
    description: description || "",
    aspect_ratio: aspect_ratio || null,
    url: buildPublicUrl(upload.r2_base, key),
    posterUrl: posterKey ? buildPublicUrl(upload.r2_base, posterKey) : null,
  }, { headers: corsHeaders() });
}
