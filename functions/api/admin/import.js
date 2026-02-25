import { badRequest, extension, getBucketName, getCollectionConfig, handleOptions, json, nowIso, requireAdmin, signR2Request, uuid, withCors } from "../../_lib/media.js";

function titleFromKey(key = "") {
  const file = key.split("/").pop() || key;
  const ext = extension(file);
  return file.replace(new RegExp(`\\.${ext}$`, "i"), "").replace(/[-_]+/g, " ").trim() || "Untitled";
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection } = await request.json();
  const cfg = getCollectionConfig(collection);
  if (!cfg) return withCors(badRequest("Invalid collection"));

  const bucket = getBucketName(env, cfg.r2Base);
  const req = await signR2Request({ method: "GET", bucket, query: `list-type=2&prefix=${encodeURIComponent(cfg.prefix)}`, env, payloadHash: "UNSIGNED-PAYLOAD" });
  const resp = await fetch(req.url, { headers: { authorization: req.authorization, "x-amz-date": req.amzDate, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" } });
  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to list objects: ${xml}`, 502));

  const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((m) => m[1]).filter((k) => !k.endsWith("/"));
  let imported = 0;
  const createdAt = nowIso();

  for (const key of keys) {
    const exists = await env.DB.prepare("SELECT id FROM media_items WHERE r2_key = ? LIMIT 1").bind(key).first();
    if (exists) continue;

    const mediaType = /\.(mp4|mov|webm|m4v)$/i.test(key) ? "video" : "image";
    await env.DB.prepare(`INSERT INTO media_items (id, collection, media_type, r2_base, r2_key, title, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '', ?)`)
      .bind(uuid(), collection, mediaType, cfg.r2Base, key, titleFromKey(key), createdAt)
      .run();
    imported += 1;
  }

  return withCors(json({ ok: true, collection, imported }));
}
