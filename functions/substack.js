 export async function onRequest(context) {
  const { request } = context;

  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response("Missing ?url=", { status: 400 });
  }

  let feedUrl;
  try {
    feedUrl = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  // Safety: only allow Substack feeds
  const allowedHosts = new Set([
    "jacobconlanshields.substack.com",
    "substack.com",
    "www.substack.com",
  ]);

  if (!allowedHosts.has(feedUrl.hostname)) {
    return new Response("Blocked host", { status: 403 });
  }

  // Optional: keep it simple — only allow common RSS paths
  const okPath =
    feedUrl.pathname === "/feed" ||
    feedUrl.pathname.endsWith("/rss") ||
    feedUrl.pathname.includes("/@");

  if (!okPath) {
    return new Response("Blocked path", { status: 403 });
  }

  const resp = await fetch(feedUrl.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });

  const text = await resp.text();

  return new Response(text, {
    status: resp.status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300", // cache 5 min
      "Access-Control-Allow-Origin": "*",     // allow browser access
    },
  });
}
