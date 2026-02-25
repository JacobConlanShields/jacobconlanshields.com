import { badRequest, extensionFromFilename, getCollectionConfig, handleOptions, json, nowIso, requireAdmin, resolveBucketName, signedAdminFetch, uuid, withCors } from "../../_lib/media.js";

function inferMediaType(key) {
  const ext = extensionFromFilename(key, "");
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  return "image";
}

function titleFromKey(key) {
  const filename = key.split("/").pop() || "untitled";
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "untitled";
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection } = await request.json();
  const cfg = getCollectionConfig(collection);
  if (!cfg) return withCors(badRequest("Invalid collection"));

  const bucket = resolveBucketName(env, cfg.r2Base);
  const query = `list-type=2${cfg.prefix ? `&prefix=${encodeURIComponent(cfg.prefix)}` : ""}`;
  const resp = await signedAdminFetch({ method: "GET", env, bucket, query, contentType: null });
  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`List objects failed: ${xml}`, 502));

  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  let inserted = 0;

  for (const key of keys) {
    const exists = await env.DB.prepare("SELECT 1 FROM media_items WHERE r2_key = ? LIMIT 1").bind(key).first();
    if (exists) continue;
    const createdAt = nowIso();
    await env.DB.prepare(`INSERT INTO media_items (id, collection, media_type, r2_base, r2_key, title, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '', ?)`)
      .bind(uuid(), collection, inferMediaType(key), cfg.r2Base, key, titleFromKey(key), createdAt)
      .run();
    inserted += 1;
  }

  return withCors(json({ ok: true, scanned: keys.length, inserted }));
}
