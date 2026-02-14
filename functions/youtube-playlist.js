const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=600",
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const playlistId = url.searchParams.get("playlistId")?.trim();
  const pageToken = url.searchParams.get("pageToken")?.trim();
  const requestedMax = Number.parseInt(url.searchParams.get("maxResults") || "50", 10);
  const maxResults = Number.isFinite(requestedMax)
    ? Math.min(50, Math.max(1, requestedMax))
    : 50;

  if (!playlistId) {
    return new Response(
      JSON.stringify({ error: "Missing required query param: playlistId" }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const apiKey = env?.YT_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing YT_API_KEY environment variable" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  const youtubeUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  youtubeUrl.searchParams.set("part", "snippet,contentDetails");
  youtubeUrl.searchParams.set("playlistId", playlistId);
  youtubeUrl.searchParams.set("maxResults", String(maxResults));
  youtubeUrl.searchParams.set("key", apiKey);
  if (pageToken) youtubeUrl.searchParams.set("pageToken", pageToken);

  const upstream = await fetch(youtubeUrl.toString());
  const body = await upstream.text();

  if (!upstream.ok) {
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      },
    });
  }

  return new Response(body, {
    status: 200,
    headers: JSON_HEADERS,
  });
}
