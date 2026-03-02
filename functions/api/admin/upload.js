import { handleOptions, json, withCors } from "../../_lib/media.js";

const SPINCLINE_SECTIONS = new Set(["design-and-build", "finished-products", "in-action"]);

function extFromName(name = "") {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "bin";
}

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
    customMetadata: { updatedBy: "api/admin/upload" },
  });
}

function validateMeta(meta) {
  if (!meta || typeof meta !== "object") return "Missing meta.";
  if (meta.root !== "photography" && meta.root !== "spincline") return "Invalid root.";
  if (meta.root === "spincline" && !SPINCLINE_SECTIONS.has(meta.section)) return "Invalid spincline section.";
  return null;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(json({ error: "Method not allowed" }, { status: 405 }));

  try {
    const form = await request.formData();
    const metaRaw = form.get("meta");
    const original = form.get("original");
    const display = form.get("display");
    const thumb = form.get("thumb");

    const meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : null;
    const validation = validateMeta(meta);
    if (validation) return withCors(json({ error: validation }, { status: 400 }));
    if (!(original instanceof File)) return withCors(json({ error: "original file required" }, { status: 400 }));

    const bucket = meta.root === "photography" ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
    const originalExt = extFromName(original.name);

    const basePrefix = meta.root === "photography" ? "photography" : `spincline/${meta.section}`;
    const originalKey = `${basePrefix}/original/${meta.clientId}.${originalExt}`;
    const displayKey = display instanceof File ? `${basePrefix}/display/${meta.clientId}.jpg` : null;
    const thumbKey = thumb instanceof File ? `${basePrefix}/thumb/${meta.clientId}.jpg` : null;

    await bucket.put(originalKey, original.stream(), { httpMetadata: { contentType: original.type || "application/octet-stream" } });
    if (display instanceof File && displayKey) {
      await bucket.put(displayKey, display.stream(), { httpMetadata: { contentType: "image/jpeg" } });
    }
    if (thumb instanceof File && thumbKey) {
      await bucket.put(thumbKey, thumb.stream(), { httpMetadata: { contentType: "image/jpeg" } });
    }

    const record = {
      id: meta.clientId,
      createdAt: new Date().toISOString(),
      root: meta.root,
      section: meta.root === "spincline" ? meta.section : null,
      title: (meta.title || "").trim(),
      location: meta.root === "photography" ? (meta.secondary || "").trim() || null : null,
      description: meta.root === "spincline" ? (meta.secondary || "").trim() || null : null,
      originalKey,
      displayKey,
      thumbKey,
      originalContentType: original.type || "application/octet-stream",
      displayContentType: displayKey ? "image/jpeg" : null,
      thumbContentType: thumbKey ? "image/jpeg" : null,
    };

    const manifestKey = meta.root === "photography" ? "manifests/photography.json" : "manifests/spincline.json";
    await appendManifest(bucket, manifestKey, record);

    return withCors(json({ ok: true, item: record }));
  } catch (error) {
    return withCors(json({ error: error.message || "Upload failed" }, { status: 500 }));
  }
}
