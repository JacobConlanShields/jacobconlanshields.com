const MAX_RESULTS_CAP = 50;
const DEFAULT_MAX_RESULTS = 25;

export async function onRequest(context) {
  const { request, env } = context;
  const reqUrl = new URL(request.url);
  const playlistId = reqUrl.searchParams.get("playlistId")?.trim();

  if (!playlistId) {
    return jsonResponse({ error: "Missing required query param: playlistId" }, 400);
  }

  const apiKey = env?.YT_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "Server misconfiguration: missing YT_API_KEY" }, 500);
  }

  const requestedMax = Number.parseInt(reqUrl.searchParams.get("maxResults") || "", 10);
  const maxResults = Number.isFinite(requestedMax)
    ? Math.min(Math.max(requestedMax, 1), MAX_RESULTS_CAP)
    : DEFAULT_MAX_RESULTS;

  const youtubeUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  youtubeUrl.searchParams.set("part", "snippet,contentDetails");
  youtubeUrl.searchParams.set("playlistId", playlistId);
  youtubeUrl.searchParams.set("maxResults", String(maxResults));
  youtubeUrl.searchParams.set("key", apiKey);

  const pageToken = reqUrl.searchParams.get("pageToken")?.trim();
  if (pageToken) {
    youtubeUrl.searchParams.set("pageToken", pageToken);
  }

  const upstream = await fetch(youtubeUrl.toString());
  const body = await upstream.text();

  if (!upstream.ok) {
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=600",
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

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=600",
    },
  });
}
