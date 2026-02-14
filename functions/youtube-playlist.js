function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=600",
      ...extraHeaders,
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const playlistId = (url.searchParams.get("playlistId") || "").trim();
  const pageToken = (url.searchParams.get("pageToken") || "").trim();
  const rawMaxResults = Number.parseInt(url.searchParams.get("maxResults") || "50", 10);
  const maxResults = Number.isFinite(rawMaxResults)
    ? Math.min(50, Math.max(1, rawMaxResults))
    : 50;

  if (!playlistId) {
    return jsonResponse({ error: "Missing required query param: playlistId" }, 400);
  }

  if (!env?.YT_API_KEY) {
    return jsonResponse({ error: "Server is missing YT_API_KEY environment variable" }, 500);
  }

  const upstreamParams = new URLSearchParams({
    part: "snippet,contentDetails",
    playlistId,
    maxResults: String(maxResults),
    key: env.YT_API_KEY,
  });

  if (pageToken) upstreamParams.set("pageToken", pageToken);

  const upstreamUrl = `https://www.googleapis.com/youtube/v3/playlistItems?${upstreamParams.toString()}`;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl);
  } catch (err) {
    return jsonResponse(
      { error: "Failed to reach YouTube API", details: String(err?.message || err) },
      502,
      { "cache-control": "no-store" },
    );
  }

  const body = await upstream.text();

  if (!upstream.ok) {
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=600",
    },
  });
}
