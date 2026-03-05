import { badRequest, json, requireAdmin } from '../../_lib/media.js';
import { LAYOUT_KEY, readPhotoIndex, writeJsonObject } from '../../_lib/photography-meta.js';

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);

  const body = await request.json().catch(() => null);
  const order = Array.isArray(body?.order) ? body.order.map((id) => String(id)) : null;
  if (!order) return badRequest('Expected JSON body with `order` array.');

  const index = await readPhotoIndex(env);
  const validIds = new Set(index.map((item) => String(item.id)));
  const filtered = order.filter((id) => validIds.has(id));
  const missing = index.map((item) => String(item.id)).filter((id) => !filtered.includes(id));
  const next = { order: [...filtered, ...missing], updatedAt: new Date().toISOString() };

  await writeJsonObject(env.PHOTO_BUCKET, LAYOUT_KEY, next);
  return json({ success: true, ...next });
}
