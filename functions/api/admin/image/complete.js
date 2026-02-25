import { badRequest, getCollectionConfig, handleOptions, json, mediaUrl, nowIso, uuid, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));

  const { key, collection, title = "", description = "", width, height, aspect_ratio } = await request.json();
  if (!key || !collection) return withCors(badRequest("Missing key/collection"));

  const config = getCollectionConfig(collection);
  if (!config) return withCors(badRequest("Invalid collection"));
  if (config.mediaType !== "image") return withCors(badRequest("Selected collection does not accept images"));

  const id = uuid();
  const createdAt = nowIso();
  const widthNum = Number(width || 0) || null;
  const heightNum = Number(height || 0) || null;
  const aspectRatioNum = Number(aspect_ratio || 0) || null;

  await env.DB.prepare(`INSERT INTO media_items
    (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, created_at)
    VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, collection, config.r2Base, key, String(title), String(description), widthNum, heightNum, aspectRatioNum, createdAt)
    .run();

  return withCors(json({
    id,
    collection,
    media_type: "image",
    r2_base: config.r2Base,
    r2_key: key,
    title: String(title),
    description: String(description),
    width: widthNum,
    height: heightNum,
    aspect_ratio: aspectRatioNum,
    url: mediaUrl(config.r2Base, key),
    created_at: createdAt,
  }));
}
