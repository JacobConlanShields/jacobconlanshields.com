import { badRequest, getCollectionConfig, handleOptions, json, mediaUrl, nowIso, requireAdmin, uuid, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection, r2Base, key, title = "", description = "", width = null, height = null, aspect_ratio = null } = await request.json();
  const cfg = getCollectionConfig(collection);
  if (!cfg) return withCors(badRequest("Invalid collection"));
  if (!key || r2Base !== cfg.r2Base) return withCors(badRequest("Invalid key/r2Base"));

  const id = uuid();
  const createdAt = nowIso();
  await env.DB.prepare(`INSERT INTO media_items
    (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, created_at)
    VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, collection, r2Base, key, title, description, width, height, aspect_ratio, createdAt)
    .run();

  return withCors(json({
    id,
    collection,
    media_type: "image",
    r2_base: r2Base,
    r2_key: key,
    title,
    description,
    width,
    height,
    aspect_ratio,
    url: mediaUrl(r2Base, key),
    created_at: createdAt,
  }));
}
