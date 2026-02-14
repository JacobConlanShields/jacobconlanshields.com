export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const playlistId = url.searchParams.get("playlistId");
  const pageToken = url.searchParams.get("pageToken");
  const maxResultsRaw = Number(url.searchParams.get("maxResults") || "50");
  const maxResults = Number.isFinite(maxResultsRaw)
    ? Math.min(50, Math.max(1, Math.floor(maxResultsRaw)))
    : 50;

  if (!playlistId) {
    return new Response(JSON.stringify({ error: "Missing required query param: playlistId" }), {
      status: 400,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=600",
      },
    });
  }

  if (!env.YT_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing environment variable: YT_API_KEY" }), {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=600",
      },
    });
  }

  const youtubeUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  youtubeUrl.searchParams.set("part", "snippet,contentDetails");
  youtubeUrl.searchParams.set("playlistId", playlistId);
  youtubeUrl.searchParams.set("maxResults", String(maxResults));
  youtubeUrl.searchParams.set("key", env.YT_API_KEY);
  if (pageToken) youtubeUrl.searchParams.set("pageToken", pageToken);

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
