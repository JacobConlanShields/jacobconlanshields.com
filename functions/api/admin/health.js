import { handleOptions, json, requiredUploadConfig, withCors } from "../../../_lib/media.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET") {
    return withCors(json({ error: "Method not allowed" }, { status: 405 }));
  }

  const missing = requiredUploadConfig(env);
  return withCors(json(missing.length ? { ok: false, missing } : { ok: true }));
}
