import { badRequest, handleOptions, requireAdmin, withCors } from "../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }
  return withCors(badRequest("Deprecated endpoint. Upload poster via /api/admin/image/init then attach poster_r2_key on multipart complete.", 410));
}
