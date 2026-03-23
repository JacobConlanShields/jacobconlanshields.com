import { badRequest, getCollectionConfig, json, mediaUrl, publicBaseFor, withCors, handleOptions } from "../_lib/media.js";

function bucketFor(r2Base, env) {
  if (r2Base === "SPINCLINE") return env.SPINCLINE_BUCKET;
  return env.PHOTO_BUCKET || env.MEDIA_BUCKET;
}

async function readManifest(bucket, collection) {
  if (!bucket) return [];
  const obj = await bucket.get(`manifests/${collection}.json`);
  if (!obj) return [];
  try {
    const data = JSON.parse(await obj.text());
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET") return withCors(badRequest("Method not allowed", 405));

  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  const config = getCollectionConfig(collection);
  if (!collection || !config) {
    return withCors(badRequest("Invalid collection"));
  }

  const bucket = bucketFor(config.r2Base, env);
  const items = await readManifest(bucket, collection);

  const payload = items.map((item) => ({
    ...item,
    url: mediaUrl(item.r2_base || config.r2Base, item.r2_key || item.displayKey || item.originalKey || ""),
    posterUrl: item.poster_r2_key
      ? `${publicBaseFor(item.r2_base || config.r2Base)}/${item.poster_r2_key}`
      : null,
  }));

  const etagRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const etag = `W/\"${[...new Uint8Array(etagRaw)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("")}\"`;

  if (request.headers.get("if-none-match") === etag) {
    return withCors(new Response(null, { status: 304, headers: { etag, "cache-control": "public, max-age=120, stale-while-revalidate=300" } }));
  }

  return withCors(json(payload, {
    headers: {
      etag,
      "cache-control": "public, max-age=120, stale-while-revalidate=300",
    },
  }));
}
