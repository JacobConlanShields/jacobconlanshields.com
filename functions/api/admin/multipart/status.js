import { badRequest, handleOptions, json, requireAdmin, resolveBucketName, signedAdminFetch, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const r2Base = url.searchParams.get("r2Base");
  if (!key || !uploadId || !r2Base) return withCors(badRequest("Missing key/uploadId/r2Base"));

  const bucket = resolveBucketName(env, r2Base);
  const resp = await signedAdminFetch({ method: "GET", env, bucket, key, query: `uploadId=${encodeURIComponent(uploadId)}`, contentType: null });
  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to query parts: ${xml}`, 502));

  const partMatches = [...xml.matchAll(/<Part>\s*<PartNumber>(\d+)<\/PartNumber>[\s\S]*?<ETag>"?([^<"]+)"?<\/ETag>[\s\S]*?<\/Part>/g)];
  const uploadedParts = partMatches.map((m) => ({ partNumber: Number(m[1]), etag: m[2] }));
  return withCors(json({ uploadedParts }));
}
