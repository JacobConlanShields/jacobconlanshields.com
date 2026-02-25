import { badRequest, getCollectionConfig, handleOptions, json, nowIso, signR2Request, uuid, xmlValue, withCors } from "../../../_lib/media.js";

function extension(filename = "") {
  const idx = filename.lastIndexOf(".");
  return idx > -1 ? filename.slice(idx + 1) : "mp4";
}

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));


  const { collection, filename, contentType } = await request.json();
  const config = getCollectionConfig(collection);
  if (!config) return withCors(badRequest("Invalid collection"));

  const key = `${config.prefix}${uuid()}.${extension(filename || "video.mp4")}`;
  const bucketName = config.r2Base === "SPINCLINE" ? env.SPINCLINE_BUCKET.name : env.PHOTO_BUCKET.name;
  const createdAt = nowIso();

  const req = await signR2Request({
    method: "POST",
    bucket: bucketName,
    key,
    query: "uploads=",
    headers: { "content-type": contentType || "video/mp4" },
    payloadHash: EMPTY_SHA256,
    env,
  });

  const resp = await fetch(req.url, {
    method: "POST",
    headers: {
      authorization: req.authorization,
      "x-amz-date": req.amzDate,
      "x-amz-content-sha256": EMPTY_SHA256,
      "content-type": contentType || "video/mp4",
    },
  });

  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to init multipart upload: ${xml}`, 502));
  const uploadId = xmlValue(xml, "UploadId");
  if (!uploadId) return withCors(badRequest("UploadId missing from R2 response", 502));

  const partSize = 33554432;
  await env.DB.prepare(`INSERT INTO multipart_uploads (key, upload_id, collection, r2_base, media_type, original_filename, content_type, part_size, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'video', ?, ?, ?, 'initiated', ?, ?)`)
    .bind(key, uploadId, collection, config.r2Base, filename || null, contentType || null, partSize, createdAt, createdAt).run();

  return withCors(json({ r2Base: config.r2Base, key, uploadId, partSize }));
}
