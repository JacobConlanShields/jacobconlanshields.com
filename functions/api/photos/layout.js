import { badRequest, json, requireAdmin } from '../../_lib/media.js';

const LAYOUT_KEY = 'photography/meta/layout.json';

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.order)) return badRequest('Expected JSON body with order array');

  const order = body.order.map((id) => String(id)).filter(Boolean);
  await env.PHOTO_BUCKET.put(LAYOUT_KEY, JSON.stringify({ order }, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });

  return json({ success: true, orderCount: order.length });
}
