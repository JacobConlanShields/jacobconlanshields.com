import { badRequest, json, requireAdmin } from '../../_lib/media.js';
import { writePhotoLayout } from '../../_lib/photos-manifest.js';

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return badRequest('Expected JSON body');
  }

  if (!payload || !Array.isArray(payload.order)) return badRequest('`order` array is required');

  const layout = await writePhotoLayout(env, payload.order);
  return json({ success: true, layout });
}
