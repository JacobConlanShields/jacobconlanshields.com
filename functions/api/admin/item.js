import { error, handleOptions, json, corsHeaders } from "../../_lib/http.js";
import { requireAdminToken } from "../../_lib/auth.js";

export async function onRequest({ request, env }) {
  const opt = handleOptions(request);
  if (opt) return opt;
  const auth = requireAdminToken(request, env);
  if (auth) return auth;

  if (request.method === "PATCH") {
    const { id, title, description, is_public, sort_index } = await request.json();
    if (!id) return error(400, "Missing id");

    const existing = await env.DB.prepare("SELECT id FROM media_items WHERE id = ?1").bind(id).first();
    if (!existing) return error(404, "Not found");

    await env.DB.prepare(
      `UPDATE media_items
          SET title = COALESCE(?2, title),
              description = COALESCE(?3, description),
              is_public = COALESCE(?4, is_public),
              sort_index = COALESCE(?5, sort_index)
        WHERE id = ?1`
    ).bind(id, title ?? null, description ?? null, is_public ?? null, sort_index ?? null).run();

    return json({ ok: true }, { headers: corsHeaders() });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return error(400, "Missing id");

    const item = await env.DB.prepare("SELECT r2_base, r2_key, poster_r2_key FROM media_items WHERE id = ?1").bind(id).first();
    if (!item) return error(404, "Not found");

    const bucket = item.r2_base === "SPINCLINE" ? env.SPINCLINE_BUCKET : env.PHOTO_BUCKET;
    await bucket.delete(item.r2_key);
    if (item.poster_r2_key) await bucket.delete(item.poster_r2_key);
    await env.DB.prepare("DELETE FROM media_items WHERE id = ?1").bind(id).run();

    return json({ ok: true }, { headers: corsHeaders() });
  }

  return error(405, "Method not allowed");
}
