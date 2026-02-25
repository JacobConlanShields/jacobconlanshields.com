const SPINCLINE_MEDIA_BASE = "https://pub-a0784713bd834a079424dc14cf218eea.r2.dev";
const PHOTO_MEDIA_BASE = "https://pub-980fbe5c774b4339805365b9656ec9fe.r2.dev";

export const COLLECTION_CONFIG = {
  spincline_design_build: { r2Base: "SPINCLINE", prefix: "design-and-build/", mediaType: "image" },
  spincline_finished_products: { r2Base: "SPINCLINE", prefix: "finished-products/", mediaType: "image" },
  spincline_in_action: { r2Base: "SPINCLINE", prefix: "in-action/", mediaType: "video" },
  photography: { r2Base: "PHOTO", prefix: "", mediaType: "image" },
};

const encoder = new TextEncoder();

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function badRequest(message, status = 400) {
  return json({ error: message }, { status });
}

export function getCollectionConfig(collection) {
  return COLLECTION_CONFIG[collection] || null;
}

export function publicBaseFor(r2Base) {
  return r2Base === "SPINCLINE" ? SPINCLINE_MEDIA_BASE : PHOTO_MEDIA_BASE;
}

export function mediaUrl(r2Base, key) {
  return `${publicBaseFor(r2Base)}/${key}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function uuid() {
  return crypto.randomUUID();
}

export async function requireAdmin(request, env) {
  const token = request.headers.get("x-admin-token");
  if (!token || !env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    throw new Error("Unauthorized");
  }
}

export function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,x-admin-token");
  return new Response(resp.body, { status: resp.status, headers });
}

export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,x-admin-token",
    },
  });
}

export async function sha256Hex(input) {
  const data = typeof input === "string" ? encoder.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key, msg) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(msg));
  return new Uint8Array(sig);
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function encodeKeyPath(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export async function signR2Request({
  method,
  bucket,
  key = "",
  query = "",
  headers = {},
  payloadHash = "UNSIGNED-PAYLOAD",
  env,
  expires,
}) {
  const service = "s3";
  const region = "auto";
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const canonicalUri = `/${bucket}${key ? `/${encodeKeyPath(key)}` : ""}`;

  const baseHeaders = typeof expires === "number" ? { host, ...headers } : { host, "x-amz-date": amzDate, ...headers };
  const normalizedHeaders = Object.fromEntries(
    Object.entries(baseHeaders).map(([k, v]) => [k.toLowerCase(), String(v).trim()]),
  );

  const signedHeaderKeys = Object.keys(normalizedHeaders).sort();
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${normalizedHeaders[k]}\n`).join("");
  const signedHeaders = signedHeaderKeys.join(";");

  const credentialScope = `${shortDate}/${region}/${service}/aws4_request`;

  if (typeof expires === "number") {
    const q = new URLSearchParams(query);
    q.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    q.set("X-Amz-Credential", `${env.R2_ACCESS_KEY_ID}/${credentialScope}`);
    q.set("X-Amz-Date", amzDate);
    q.set("X-Amz-Expires", String(expires));
    q.set("X-Amz-SignedHeaders", signedHeaders);

    const canonicalQuery = [...q.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");

    const kDate = await hmac(encoder.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), shortDate);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, "aws4_request");
    const signature = toHex(await hmac(kSigning, stringToSign));

    return {
      url: `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
      amzDate,
    };
  }

  const canonicalQuery = query
    ? [...new URLSearchParams(query).entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")
    : "";

  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");

  const kDate = await hmac(encoder.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), shortDate);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  return {
    url: `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
    amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    signedHeaders: normalizedHeaders,
  };
}

export function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : null;
}
