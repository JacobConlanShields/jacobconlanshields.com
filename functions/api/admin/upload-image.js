import { getCollectionConfig, nowIso, objectKeyFor } from "../../_lib/media-config.js";
import { error, handleOptions, json, corsHeaders } from "../../_lib/http.js";
import { requireAdminToken } from "../../_lib/auth.js";

export async function onRequest({ request, env }) {
  const opt = handleOptions(request);
  if (opt) return opt;
  if (request.method !== "POST") return error(405, "Method not allowed");

  const auth = requireAdminToken(request, env);
  if (auth) return auth;

  const form = await request.formData();
  const file = form.get("file");
  const collection = form.get("collection");
  if (!(file instanceof File) || !collection) return error(400, "Missing file or collection");

  const cfg = getCollectionConfig(String(collection));
  if (!cfg) return error(400, "Unknown collection");
  if (!String(file.type || "").startsWith("image/")) return error(400, "Only image files allowed");

  const bucket = cfg.r2Base === "SPINCLINE" ? env.SPINCLINE_BUCKET : env.PHOTO_BUCKET;
  if (!bucket) return error(500, "Missing bucket binding");

  const key = objectKeyFor(String(collection), file.name || "image.jpg");
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const title = String(form.get("title") || "");
  const description = String(form.get("description") || "");
  const width = Number(form.get("width") || 0) || null;
  const height = Number(form.get("height") || 0) || null;
  const aspectRatio = Number(form.get("aspect_ratio") || 0) || null;

  await env.DB.prepare(
    `INSERT INTO media_items
      (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, created_at, is_public)
     VALUES (?1, ?2, 'image', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
  ).bind(id, collection, cfg.r2Base, key, title, description, width, height, aspectRatio, createdAt, cfg.mediaType === "video" ? 0 : 1).run();

  return json({ id, key }, { headers: corsHeaders() });
}
