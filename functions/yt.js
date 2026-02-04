export async function onRequest({ request }) {
  const u = new URL(request.url);
  const target = u.searchParams.get("url");
  if (!target) return new Response("Missing ?url=", { status: 400 });

  let t;
  try {
    t = new URL(target);
  } catch {
    return new Response("Bad url", { status: 400 });
  }

  // Safety: only allow YouTube feeds
  const allowedHosts = new Set(["www.youtube.com", "youtube.com"]);
  if (!allowedHosts.has(t.hostname) || !t.pathname.startsWith("/feeds/")) {
    return new Response("Blocked", { status: 403 });
  }

  const resp = await fetch(target, {
    headers: {
      // Helps avoid occasional upstream weirdness
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/xml,text/xml,*/*",
    },
  });

  const body = await resp.text();

  return new Response(body, {
    status: resp.status,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Cache for 5 minutes at the edge (fast + auto-updates)
      "cache-control": "public, max-age=300",
    },
  });
}
