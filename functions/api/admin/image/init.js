import { badRequest, handleOptions, json, keyForUpload, requireAdmin, resolveBucketName, signR2Request, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return withCors(badRequest("Method not allowed", 405));
  try { await requireAdmin(request, env); } catch { return withCors(badRequest("Unauthorized", 401)); }

  const { collection, filename, contentType } = await request.json();
  const upload = keyForUpload({ collection, filename });
  if (!upload) return withCors(badRequest("Invalid collection"));

  const bucket = resolveBucketName(env, upload.r2Base);
  const signed = await signR2Request({
    method: "PUT",
    bucket,
    key: upload.key,
    headers: { "content-type": contentType || "application/octet-stream" },
    env,
    expires: 900,
  });

  return withCors(json({ r2Base: upload.r2Base, key: upload.key, putUrl: signed.url, expiresIn: 900 }));
}
