export async function onRequest({ request }) {
  // Cloudflare Pages Function entry point.
  // This proxy exists so the browser can fetch YouTube's XML feeds without CORS errors.
  const u = new URL(request.url);
  const target = u.searchParams.get("url");
  if (!target) return new Response("Missing ?url=", { status: 400 });

  let t;
  try {
    t = new URL(target);
  } catch {
    return new Response("Bad url", { status: 400 });
  }

  // Safety: only allow HTTPS YouTube feeds.
  const allowedHosts = new Set(["www.youtube.com", "youtube.com"]);
  if (t.protocol !== "https:" || !allowedHosts.has(t.hostname) || !t.pathname.startsWith("/feeds/")) {
    return new Response("Blocked", { status: 403 });
  }

  // Forward the request to YouTube and keep a lightweight caching policy.
  let resp;
  try {
    resp = await fetch(t.toString(), {
      headers: {
        // Helps avoid occasional upstream weirdness
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/xml,text/xml,*/*",
      },
      cf: {
        cacheTtl: 300,
        cacheEverything: true,
      },
    });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${String(err?.message || err)}`, {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
        "access-control-allow-origin": "*",
      },
    });
  }

  const body = await resp.text();

  return new Response(body, {
    status: resp.status,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Cache for 5 minutes at the edge (fast + auto-updates)
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
    },
  });
}
