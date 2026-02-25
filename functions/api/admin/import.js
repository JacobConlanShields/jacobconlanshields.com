import {
  badRequest,
  extFromName,
  getBucketName,
  getCollectionConfig,
  handleOptions,
  json,
  nowIso,
  requireAdmin,
  s3AuthHeaders,
  signR2Request,
  uuid,
  withCors,
} from "../../_lib/media.js";

function stripExt(name) {
  const ext = extFromName(name, "");
  if (!ext) return name;
  return name.slice(0, -(ext.length + 1));
}

function parseKeys(xml) {
  return [...xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<\/Contents>/g)].map((m) => m[1]);
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection } = await request.json();
  const cfg = getCollectionConfig(collection);
  if (!cfg) return withCors(badRequest("Invalid collection"));

  const bucketName = getBucketName(cfg.r2Base, env);
  const q = new URLSearchParams({ "list-type": "2", prefix: cfg.prefix, "max-keys": "1000" });
  const req = await signR2Request({ method: "GET", bucket: bucketName, query: q.toString(), env, payloadHash: "UNSIGNED-PAYLOAD" });
  const resp = await fetch(req.url, { headers: s3AuthHeaders(req) });
  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to list objects: ${xml}`, 502));

  const keys = parseKeys(xml).filter((k) => !k.endsWith("/"));
  let inserted = 0;
  for (const key of keys) {
    const existing = await env.DB.prepare("SELECT 1 FROM media_items WHERE r2_key = ?").bind(key).first();
    if (existing) continue;
    const filename = key.split("/").pop() || key;
    const createdAt = nowIso();
    await env.DB.prepare(`INSERT INTO media_items
      (id, collection, media_type, r2_base, r2_key, title, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '', ?)`)
      .bind(uuid(), collection, collection === "spincline_in_action" ? "video" : "image", cfg.r2Base, key, stripExt(filename), createdAt)
      .run();
    inserted += 1;
  }

  return withCors(json({ ok: true, scanned: keys.length, inserted }));
}
