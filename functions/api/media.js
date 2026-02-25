import { badRequest, getCollectionConfig, json, mediaUrl, publicBaseFor, withCors, handleOptions } from "../_lib/media.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET") return withCors(badRequest("Method not allowed", 405));

  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  if (!collection || !getCollectionConfig(collection)) {
    return withCors(badRequest("Invalid collection"));
  }

  const rows = await env.DB.prepare(
    `SELECT id, collection, media_type, r2_base, r2_key, title, description, width, height, aspect_ratio, poster_r2_key, sort_index, created_at
     FROM media_items WHERE collection = ? AND is_public = 1
     ORDER BY sort_index DESC, created_at DESC`,
  ).bind(collection).all();

  const payload = (rows.results || []).map((item) => ({
    ...item,
    url: mediaUrl(item.r2_base, item.r2_key),
    posterUrl: item.poster_r2_key ? `${publicBaseFor(item.r2_base)}/${item.poster_r2_key}` : null,
  }));

  const etagRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const etag = `W/\"${[...new Uint8Array(etagRaw)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("")}\"`;

  if (request.headers.get("if-none-match") === etag) {
    return withCors(new Response(null, { status: 304, headers: { etag, "cache-control": "public, max-age=120, stale-while-revalidate=300" } }));
  }

  return withCors(json(payload, {
    headers: {
      etag,
      "cache-control": "public, max-age=120, stale-while-revalidate=300",
    },
  }));
}
