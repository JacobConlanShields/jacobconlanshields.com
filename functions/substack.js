export async function onRequest(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return new Response("Missing ?url=", { status: 400 });
    }

    const t = new URL(target);

    // Allow your Substack and the main substack domain
    const allowedHosts = new Set([
      "jacobconlanshields.substack.com",
      "substack.com",
      "www.substack.com",
    ]);

    if (t.protocol !== "https:" || !allowedHosts.has(t.hostname)) {
      return new Response("Blocked host", { status: 403 });
    }

    // Allow common Substack RSS paths
    const okPath =
      t.pathname === "/feed" ||
      t.pathname.endsWith("/rss") ||
      t.pathname.startsWith("/@");

    if (!okPath) {
      return new Response("Blocked path", { status: 403 });
    }

    const upstream = await fetch(t.toString(), {
      headers: {
        "User-Agent": "Cloudflare Pages Substack Proxy",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
    }

    const body = await upstream.text();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // cache for 5 minutes at the edge
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        // If you ever need to fetch this from other domains later:
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response("Proxy error", { status: 500 });
  }
}
