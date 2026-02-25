import { badRequest, extension, getBucketName, getCollectionConfig, handleOptions, json, requireAdmin, signR2Request, uuid, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));

  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection, filename, contentType } = await request.json();
  const cfg = getCollectionConfig(collection);
  if (!cfg) return withCors(badRequest("Invalid collection"));

  const key = `${cfg.prefix}${uuid()}.${extension(filename || "upload.bin")}`;
  const bucket = getBucketName(env, cfg.r2Base);
  const signed = await signR2Request({
    method: "PUT",
    bucket,
    key,
    headers: { "content-type": contentType || "application/octet-stream" },
    payloadHash: "UNSIGNED-PAYLOAD",
    env,
    expires: 900,
  });

  return withCors(json({ r2Base: cfg.r2Base, key, putUrl: signed.url, expiresIn: 900 }));
}
