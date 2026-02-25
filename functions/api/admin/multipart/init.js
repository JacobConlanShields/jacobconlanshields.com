import { getCollectionConfig, nowIso, objectKeyFor, PART_SIZE } from "../../../_lib/media-config.js";
import { error, handleOptions, json, corsHeaders } from "../../../_lib/http.js";
import { requireAdminToken } from "../../../_lib/auth.js";
import { signedS3Fetch } from "../../../_lib/s3.js";

function textBetween(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return m ? m[1] : null;
}

export async function onRequest({ request, env }) {
  const opt = handleOptions(request);
  if (opt) return opt;
  if (request.method !== "POST") return error(405, "Method not allowed");
  const auth = requireAdminToken(request, env);
  if (auth) return auth;

  const body = await request.json();
  const { collection, filename, contentType } = body;
  const cfg = getCollectionConfig(collection);
  if (!cfg || cfg.mediaType !== "video") return error(400, "Video collection required");

  const key = objectKeyFor(collection, filename || "video.mp4");
  const bucket = cfg.r2Base === "SPINCLINE" ? env.SPINCLINE_BUCKET_NAME : env.PHOTO_BUCKET_NAME;
  if (!bucket) return error(500, "Missing bucket name env vars");

  const resp = await signedS3Fetch({
    env,
    method: "POST",
    bucket,
    key,
    queryParams: { uploads: "" },
    contentType: contentType || "video/mp4",
  });
  const xml = await resp.text();
  if (!resp.ok) return error(502, `Failed to init multipart upload: ${xml.slice(0, 200)}`);

  const uploadId = textBetween(xml, "UploadId");
  if (!uploadId) return error(502, "Missing uploadId from R2");

  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO multipart_uploads
      (key, upload_id, collection, r2_base, media_type, original_filename, content_type, part_size, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'video', ?5, ?6, ?7, 'initiated', ?8, ?9)`
  ).bind(key, uploadId, collection, cfg.r2Base, filename || "", contentType || "", PART_SIZE, ts, ts).run();

  return json({ r2Base: cfg.r2Base, key, uploadId, partSize: PART_SIZE }, { headers: corsHeaders() });
}
