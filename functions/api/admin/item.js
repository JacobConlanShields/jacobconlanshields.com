import { badRequest, handleOptions, json, nowIso, requireAdmin, withCors } from "../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  if (request.method === "PATCH") {
    const { id, title, description, is_public, sort_index } = await request.json();
    if (!id) return withCors(badRequest("Missing id"));
    await env.DB.prepare(`UPDATE media_items
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          is_public = COALESCE(?, is_public),
          sort_index = COALESCE(?, sort_index)
      WHERE id = ?`).bind(title ?? null, description ?? null, is_public ?? null, sort_index ?? null, id).run();
    return withCors(json({ ok: true, updated_at: nowIso() }));
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return withCors(badRequest("Missing id"));

    const item = await env.DB.prepare("SELECT r2_base, r2_key, poster_r2_key FROM media_items WHERE id = ?").bind(id).first();
    if (!item) return withCors(badRequest("Not found", 404));

    const bucket = item.r2_base === "SPINCLINE" ? env.SPINCLINE_BUCKET : env.PHOTO_BUCKET;
    await bucket.delete(item.r2_key);
    if (item.poster_r2_key) await bucket.delete(item.poster_r2_key);

    await env.DB.prepare("DELETE FROM media_items WHERE id = ?").bind(id).run();
    return withCors(json({ ok: true }));
  }

  return withCors(badRequest("Method not allowed", 405));
}
