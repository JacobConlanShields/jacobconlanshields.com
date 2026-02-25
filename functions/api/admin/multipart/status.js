import { badRequest, getBucketName, handleOptions, json, requireAdmin, s3AuthHeaders, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const r2Base = url.searchParams.get("r2Base");
  if (!key || !uploadId || !r2Base) return withCors(badRequest("Missing key/uploadId/r2Base"));

  const bucketName = getBucketName(r2Base, env);
  if (!bucketName) return withCors(badRequest("Invalid r2Base"));

  const query = `uploadId=${encodeURIComponent(uploadId)}`;
  const req = await signR2Request({ method: "GET", bucket: bucketName, key, query, env, payloadHash: "UNSIGNED-PAYLOAD" });

  const resp = await fetch(req.url, { method: "GET", headers: s3AuthHeaders(req) });
  const xml = await resp.text();
  if (!resp.ok) return withCors(badRequest(`Failed to query parts: ${xml}`, 502));

  const partMatches = [...xml.matchAll(/<Part>\s*<PartNumber>(\d+)<\/PartNumber>[\s\S]*?<ETag>"?([^<"]+)"?<\/ETag>[\s\S]*?<\/Part>/g)];
  const uploadedParts = partMatches.map((m) => ({ partNumber: Number(m[1]), etag: m[2] }));

  return withCors(json({ uploadedParts }));
}
