import { buildPublicUrl } from "../_lib/media-config.js";
import { error, handleOptions, json, corsHeaders } from "../_lib/http.js";

export async function onRequest({ request, env }) {
  const opt = handleOptions(request);
  if (opt) return opt;

  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  if (!collection) return error(400, "Missing collection");

  const { results } = await env.DB.prepare(
    `SELECT id, collection, media_type, r2_base, r2_key, title, description, width, height,
            aspect_ratio, poster_r2_key, sort_index, created_at
       FROM media_items
      WHERE collection = ?1 AND is_public = 1
      ORDER BY sort_index DESC, created_at DESC`
  ).bind(collection).all();

  const etagSource = JSON.stringify(results.map((r) => [r.id, r.sort_index, r.created_at]));
  const etagBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(etagSource));
  const etag = `W/\"${[...new Uint8Array(etagBytes)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("")}\"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ...corsHeaders(), etag } });
  }

  const items = results.map((item) => ({
    ...item,
    url: buildPublicUrl(item.r2_base, item.r2_key),
    posterUrl: item.poster_r2_key ? buildPublicUrl(item.r2_base, item.poster_r2_key) : null,
  }));

  return json({ items }, {
    headers: {
      ...corsHeaders(),
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      etag,
    },
  });
}
