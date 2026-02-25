import { error, handleOptions, json, corsHeaders } from "../../../_lib/http.js";
import { requireAdminToken } from "../../../_lib/auth.js";
import { signedS3Fetch } from "../../../_lib/s3.js";

function parseParts(xml) {
  const parts = [];
  const partBlocks = xml.match(/<Part>[\s\S]*?<\/Part>/g) || [];
  for (const block of partBlocks) {
    const pn = block.match(/<PartNumber>(\d+)<\/PartNumber>/);
    const etag = block.match(/<ETag>\"?([^<\"]+)\"?<\/ETag>/);
    if (pn && etag) parts.push({ partNumber: Number(pn[1]), etag: etag[1] });
  }
  return parts;
}

export async function onRequest({ request, env }) {
  const opt = handleOptions(request);
  if (opt) return opt;
  const auth = requireAdminToken(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return error(400, "Missing key");

  const row = await env.DB.prepare("SELECT upload_id, r2_base FROM multipart_uploads WHERE key = ?1 AND status = 'initiated'").bind(key).first();
  if (!row) return error(404, "Upload not found");

  const bucket = row.r2_base === "SPINCLINE" ? env.SPINCLINE_BUCKET_NAME : env.PHOTO_BUCKET_NAME;
  const resp = await signedS3Fetch({ env, method: "GET", bucket, key, queryParams: { uploadId: row.upload_id } });
  const xml = await resp.text();
  if (!resp.ok) return error(502, xml.slice(0, 200));

  const uploadedParts = parseParts(xml);
  return json({ uploadedParts }, { headers: corsHeaders() });
}
