import { badRequest, handleOptions, json, requireAdmin, resolveBucketName, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { r2Base, key, uploadId, partNumber } = await request.json();
  if (!key || !uploadId || !partNumber || !r2Base) return withCors(badRequest("Missing r2Base/key/uploadId/partNumber"));

  const bucket = resolveBucketName(env, r2Base);
  const signed = await signR2Request({
    method: "PUT",
    bucket,
    key,
    query: `partNumber=${Number(partNumber)}&uploadId=${encodeURIComponent(uploadId)}`,
    env,
    expires: 900,
  });

  return withCors(json({ url: signed.url }));
}
