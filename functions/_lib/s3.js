const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data) {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmacRaw(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

function amzDate(now = new Date()) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

async function signingKey(secret, dateStamp, region, service) {
  const kDate = await hmacRaw(encoder.encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmacRaw(new Uint8Array(kDate), region);
  const kService = await hmacRaw(new Uint8Array(kRegion), service);
  return hmacRaw(new Uint8Array(kService), "aws4_request");
}

export async function signedS3Fetch({ env, method, bucket, key = "", queryParams = {}, body = "", contentType }) {
  const region = "auto";
  const service = "s3";
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const xAmzDate = amzDate(now);
  const dateStamp = xAmzDate.slice(0, 8);
  const canonicalUri = `/${bucket}${key ? `/${encodeURIComponent(key).replace(/%2F/g, "/")}` : ""}`;
  const query = new URLSearchParams(queryParams);
  const canonicalQueryString = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const payloadHash = await sha256Hex(body || "");
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": xAmzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h]}\n`).join("");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", xAmzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const kSigning = await signingKey(env.R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = toHex(await hmacRaw(new Uint8Array(kSigning), stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`;

  const requestHeaders = new Headers();
  Object.entries(headers).forEach(([k, v]) => requestHeaders.set(k, v));
  requestHeaders.set("Authorization", authorization);

  const queryString = canonicalQueryString ? `?${canonicalQueryString}` : "";
  const url = `https://${host}${canonicalUri}${queryString}`;
  return fetch(url, { method, headers: requestHeaders, body: body || undefined });
}

export async function presignUploadPart({ env, bucket, key, uploadId, partNumber, expires = 900 }) {
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const xAmzDate = amzDate(now);
  const dateStamp = xAmzDate.slice(0, 8);
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${env.R2_ACCESS_KEY_ID}/${scope}`,
    "X-Amz-Date": xAmzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
    partNumber: String(partNumber),
    uploadId,
  });

  const canonicalQueryString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", xAmzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const kSigning = await signingKey(env.R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = toHex(await hmacRaw(new Uint8Array(kSigning), stringToSign));
  params.set("X-Amz-Signature", signature);

  return `https://${host}${canonicalUri}?${params.toString()}`;
}
