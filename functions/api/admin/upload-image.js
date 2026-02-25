import { badRequest, handleOptions, requireAdmin, withCors } from "../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }
  return withCors(badRequest("Deprecated endpoint. Use /api/admin/image/init and /api/admin/image/complete for direct-to-R2 uploads.", 410));
}
