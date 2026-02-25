import { error, handleOptions, json, corsHeaders } from "../../../_lib/http.js";
import { requireAdminToken } from "../../../_lib/auth.js";
import { signedS3Fetch } from "../../../_lib/s3.js";
import { nowIso } from "../../../_lib/media-config.js";

export async function onRequest({ request, env }) {
  const opt = handleOptions(request);
  if (opt) return opt;
  if (request.method !== "POST") return error(405, "Method not allowed");
  const auth = requireAdminToken(request, env);
  if (auth) return auth;

  const { key, uploadId } = await request.json();
  const row = await env.DB.prepare("SELECT r2_base FROM multipart_uploads WHERE key = ?1 AND upload_id = ?2 AND status = 'initiated'")
    .bind(key, uploadId).first();
  if (!row) return error(404, "Upload session not found");

  const bucket = row.r2_base === "SPINCLINE" ? env.SPINCLINE_BUCKET_NAME : env.PHOTO_BUCKET_NAME;
  await signedS3Fetch({ env, method: "DELETE", bucket, key, queryParams: { uploadId } });
  await env.DB.prepare("UPDATE multipart_uploads SET status='aborted', updated_at=?1 WHERE key=?2").bind(nowIso(), key).run();

  return json({ ok: true }, { headers: corsHeaders() });
}
