import { handleOptions, json, withCors } from "../../../_lib/media.js";

const SPINCLINE_SECTIONS = new Set(["design-and-build", "finished-products", "in-action"]);

async function readManifest(bucket, key) {
  try {
    const obj = await bucket.get(key);
    if (!obj) return [];
    const data = await obj.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function appendManifest(bucket, manifestKey, record) {
  const existing = await readManifest(bucket, manifestKey);
  existing.push(record);
  await bucket.put(manifestKey, JSON.stringify(existing, null, 2), {
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
    customMetadata: { updatedBy: "api/admin/video/mpu-complete" },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(json({ error: "Method not allowed" }, { status: 405 }));

  const body = await request.json();
  if (!body.key || !body.uploadId || !Array.isArray(body.parts) || !body.parts.length) {
    return withCors(json({ error: "Missing key/uploadId/parts" }, { status: 400 }));
  }
  if (!["photography", "spincline"].includes(body.root)) return withCors(json({ error: "Invalid root" }, { status: 400 }));
  if (body.root === "spincline" && !SPINCLINE_SECTIONS.has(body.section)) {
    return withCors(json({ error: "Invalid section" }, { status: 400 }));
  }

  const bucket = body.root === "photography" ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
  const mpu = bucket.resumeMultipartUpload(body.key, body.uploadId);
  await mpu.complete(body.parts);

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    root: body.root,
    section: body.root === "spincline" ? body.section : null,
    title: (body.title || "").trim(),
    location: body.root === "photography" ? (body.location || "").trim() || null : null,
    description: body.root === "spincline" ? (body.description || "").trim() || null : null,
    originalKey: null,
    displayKey: null,
    thumbKey: null,
    originalContentType: null,
    displayContentType: null,
    thumbContentType: null,
    videoKey: body.key,
    posterKey: body.posterKey || null,
  };

  const manifestKey = body.root === "photography" ? "manifests/photography.json" : "manifests/spincline.json";
  await appendManifest(bucket, manifestKey, record);

  return withCors(json({ ok: true, item: record }));
}
