import { badRequest, getCollectionConfig, handleOptions, json, missingUploadConfig, signR2Request, uuid, withCors } from "../../../_lib/media.js";

function extension(filename = "") {
  const idx = filename.lastIndexOf(".");
  return idx > -1 ? filename.slice(idx + 1).toLowerCase() : "jpg";
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));

  const missing = missingUploadConfig(env);
  if (missing.length) {
    return withCors(json({
      error: "missing_config",
      missing,
      hint: "Set secrets/bindings for this environment in Cloudflare Pages.",
    }, { status: 503 }));
  }

  try {
    const { collection, filename, contentType } = await request.json();
    const config = getCollectionConfig(collection);
    if (!config) return withCors(badRequest("Invalid collection"));
    if (config.mediaType !== "image") return withCors(badRequest("Collection only accepts image uploads"));

    const normalizedType = String(contentType || "application/octet-stream");
    if (!normalizedType.startsWith("image/")) return withCors(badRequest("Image contentType is required"));

    const key = `${config.prefix}${uuid()}.${extension(filename || "upload.jpg")}`;
    const bucketName = config.r2Base === "SPINCLINE" ? env.SPINCLINE_BUCKET.name : env.PHOTO_BUCKET.name;
    const signed = await signR2Request({
      method: "PUT",
      bucket: bucketName,
      key,
      headers: { "content-type": normalizedType },
      env,
      expires: 900,
    });

    return withCors(json({
      key,
      r2Base: config.r2Base,
      putUrl: signed.url,
      r2Host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      contentTypeExpected: normalizedType,
    }));
  } catch (error) {
    console.error("[admin:image:init] Unexpected failure", error);
    return withCors(json({
      error: "init_failed",
      hint: "Check Pages Functions logs for [admin:image:init] and verify bindings/secrets.",
    }, { status: 500 }));
  }
}
