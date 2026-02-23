export async function onRequest({ request }) {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
    "x-content-type-options": "nosniff",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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
  const allowedHosts = new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);
  if (t.protocol !== "https:" || !allowedHosts.has(t.hostname) || !t.pathname.startsWith("/feeds/")) {
    return new Response("Blocked", { status: 403 });
  }

  // Forward the request to YouTube and keep a lightweight caching policy.
  let resp;
  try {
    resp = await fetch(t.toString(), {
      headers: {
        "Accept": "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
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
        ...corsHeaders,
      },
    });
  }

  const body = await resp.text();

  return new Response(body, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") || "application/xml; charset=utf-8",
      // Cache for 5 minutes at the edge (fast + auto-updates)
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      ...corsHeaders,
    },
  });
}
