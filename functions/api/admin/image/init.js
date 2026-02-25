import { badRequest, getCollectionConfig, handleOptions, json, signR2Request, uuid, withCors } from "../../../_lib/media.js";

function extension(filename = "") {
  const idx = filename.lastIndexOf(".");
  return idx > -1 ? filename.slice(idx + 1).toLowerCase() : "bin";
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));

  const { collection, filename, contentType } = await request.json();
  const config = getCollectionConfig(collection);
  if (!config) return withCors(badRequest("Invalid collection"));
  if (config.mediaType !== "image") return withCors(badRequest("Selected collection does not accept images"));

  const key = `${config.prefix}${uuid()}.${extension(filename || "image.bin")}`;
  const bucketName = config.r2Base === "SPINCLINE" ? env.SPINCLINE_BUCKET.name : env.PHOTO_BUCKET.name;
  const expectedType = contentType || "application/octet-stream";

  const signed = await signR2Request({
    method: "PUT",
    bucket: bucketName,
    key,
    headers: { "content-type": expectedType },
    env,
    expires: 900,
  });

  return withCors(json({
    key,
    putUrl: signed.url,
    contentTypeExpected: expectedType,
    r2Base: config.r2Base,
  }));
}
