import { error, handleOptions, json, corsHeaders } from "../../../_lib/http.js";
import { requireAdminToken } from "../../../_lib/auth.js";
import { presignUploadPart } from "../../../_lib/s3.js";

export async function onRequest({ request, env }) {
  const opt = handleOptions(request);
  if (opt) return opt;
  if (request.method !== "POST") return error(405, "Method not allowed");
  const auth = requireAdminToken(request, env);
  if (auth) return auth;

  const { key, uploadId, partNumber } = await request.json();
  if (!key || !uploadId || !partNumber) return error(400, "Missing key/uploadId/partNumber");

  const row = await env.DB.prepare("SELECT r2_base FROM multipart_uploads WHERE key = ?1 AND upload_id = ?2 AND status = 'initiated'")
    .bind(key, uploadId).first();
  if (!row) return error(404, "Upload session not found");

  const bucket = row.r2_base === "SPINCLINE" ? env.SPINCLINE_BUCKET_NAME : env.PHOTO_BUCKET_NAME;
  const url = await presignUploadPart({ env, bucket, key, uploadId, partNumber: Number(partNumber) });
  return json({ url }, { headers: corsHeaders() });
}
