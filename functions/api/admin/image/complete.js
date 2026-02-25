import { badRequest, getCollectionConfig, handleOptions, json, mediaUrl, nowIso, uuid, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));

  const { key, collection, title = "", description = "", width = null, height = null, aspect_ratio = null } = await request.json();
  if (!key || !collection) return withCors(badRequest("Missing key/collection"));

  const config = getCollectionConfig(collection);
  if (!config) return withCors(badRequest("Invalid collection"));
  if (config.mediaType !== "image") return withCors(badRequest("Collection only accepts video uploads"));
  if (!String(key).startsWith(config.prefix)) return withCors(badRequest("Key prefix does not match collection"));

  const id = uuid();
  const createdAt = nowIso();
  await env.DB.prepare(`INSERT INTO media_items
    (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, created_at)
    VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, collection, config.r2Base, key, title, description, width || null, height || null, aspect_ratio || null, createdAt)
    .run();

  return withCors(json({
    id,
    collection,
    media_type: "image",
    r2_base: config.r2Base,
    r2_key: key,
    title,
    description,
    width,
    height,
    aspect_ratio,
    url: mediaUrl(config.r2Base, key),
    created_at: createdAt,
  }));
}
