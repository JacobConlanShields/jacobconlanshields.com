import {
  badRequest,
  extFromName,
  getBucketName,
  getCollectionConfig,
  handleOptions,
  json,
  requireAdmin,
  signR2Request,
  uuid,
  withCors,
} from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection, filename = "upload.bin", contentType = "application/octet-stream", keyPrefix = "" } = await request.json();
  const cfg = getCollectionConfig(collection);
  if (!cfg) return withCors(badRequest("Invalid collection"));

  const normalizedKeyPrefix = keyPrefix ? `${String(keyPrefix).replace(/^\/+|\/+$|\.\./g, "")}/`.replace(/^\/$/, "") : "";
  const key = `${cfg.prefix}${normalizedKeyPrefix}${uuid()}.${extFromName(filename)}`;
  const bucket = getBucketName(cfg.r2Base, env);
  const signed = await signR2Request({
    method: "PUT",
    bucket,
    key,
    headers: { "content-type": contentType },
    env,
    expires: 900,
  });

  return withCors(json({
    r2Base: cfg.r2Base,
    key,
    putUrl: signed.url,
    expiresIn: 900,
  }));
}
