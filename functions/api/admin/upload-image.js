import { badRequest, getCollectionConfig, handleOptions, json, mediaUrl, nowIso, uuid, withCors } from "../../_lib/media.js";

function extFromName(name = "") {
  const i = name.lastIndexOf(".");
  return i > -1 ? name.slice(i + 1).toLowerCase() : "bin";
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));

  const form = await request.formData();
  const file = form.get("file");
  const collection = form.get("collection");
  const title = String(form.get("title") || "");
  const description = String(form.get("description") || "");
  const location = String(form.get("location") || "");
  const width = Number(form.get("width") || 0) || null;
  const height = Number(form.get("height") || 0) || null;
  const aspectRatio = Number(form.get("aspect_ratio") || 0) || null;

  if (!(file instanceof File)) return withCors(badRequest("Missing file"));
  const config = getCollectionConfig(collection);
  if (!config) return withCors(badRequest("Invalid collection"));

  const mediaType = file.type.startsWith("video/") ? "video" : "image";
  if (mediaType !== "image") return withCors(badRequest("upload-image endpoint accepts images only"));

  const key = `${config.prefix}${uuid()}.${extFromName(file.name)}`;
  const bucket = config.r2Base === "SPINCLINE" ? env.SPINCLINE_BUCKET : env.PHOTO_BUCKET;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });

  const id = uuid();
  const createdAt = nowIso();
  const resolvedDescription = String(description || location || '');

  await env.DB.prepare(`INSERT INTO media_items
    (id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, created_at)
    VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, collection, config.r2Base, key, title, resolvedDescription, width, height, aspectRatio, createdAt)
    .run();

  return withCors(json({
    id,
    collection,
    media_type: "image",
    r2_base: config.r2Base,
    r2_key: key,
    title,
    description: resolvedDescription,
    width,
    height,
    aspect_ratio: aspectRatio,
    url: mediaUrl(config.r2Base, key),
    created_at: createdAt,
  }));
}
