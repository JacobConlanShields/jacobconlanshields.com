import { badRequest, getCollectionConfig, handleOptions, json, requireAdmin, uuid, withCors } from "../../_lib/media.js";

function extFromName(name = "") { const i = name.lastIndexOf("."); return i > -1 ? name.slice(i + 1).toLowerCase() : "jpg"; }

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const form = await request.formData();
  const file = form.get("file");
  const collection = String(form.get("collection") || "");
  if (!(file instanceof File)) return withCors(badRequest("Missing file"));
  const cfg = getCollectionConfig(collection);
  if (!cfg) return withCors(badRequest("Invalid collection"));

  const key = `${cfg.prefix}${uuid()}-poster.${extFromName(file.name)}`;
  const bucket = cfg.r2Base === "SPINCLINE" ? env.SPINCLINE_BUCKET : env.PHOTO_BUCKET;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type || "image/jpeg" } });
  return withCors(json({ key }));
}
