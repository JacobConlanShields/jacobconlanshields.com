import { handleOptions, json, withCors } from "../../../_lib/media.js";

const SPINCLINE_SECTIONS = new Set(["design-and-build", "finished-products", "in-action"]);
const MB = 1024 * 1024;

function safeFilename(name = "upload.bin") {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function extFromFilename(name = "") {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "mp4";
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(json({ error: "Method not allowed" }, { status: 405 }));

  const body = await request.json();
  const root = body.root;
  const section = body.section;
  if (!["photography", "spincline"].includes(root)) return withCors(json({ error: "Invalid root" }, { status: 400 }));
  if (root === "spincline" && !SPINCLINE_SECTIONS.has(section)) return withCors(json({ error: "Invalid section" }, { status: 400 }));

  const clientId = crypto.randomUUID();
  const ext = extFromFilename(body.filename || "video.mp4");
  const base = root === "photography" ? "photography/video" : `spincline/${section}/video`;
  const key = `${base}/${clientId}-${safeFilename(body.filename || `upload.${ext}`)}`;
  const bucket = root === "photography" ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;

  const uploadMaxMb = Number(env.UPLOAD_MAX_MB || 100);
  const partSizeBytes = Math.max(5 * MB, Math.min(25 * MB, Math.floor(uploadMaxMb * 0.8 * MB)));
  const mpu = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: body.contentType || "video/mp4" } });

  return withCors(json({ key, uploadId: mpu.uploadId, partSizeBytes }));
}
