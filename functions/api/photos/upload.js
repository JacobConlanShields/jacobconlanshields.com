import { badRequest, json, requireAdmin } from '../../_lib/media.js';
import { readPhotosManifest, writePhotosManifest } from '../../_lib/photos-manifest.js';

function safeName(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

function extFromName(fileName = '') {
  const idx = fileName.lastIndexOf('.');
  return idx > -1 ? fileName.slice(idx + 1).toLowerCase() : 'jpg';
}

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

  const form = await request.formData();
  const files = form.getAll('files').filter((f) => f instanceof File);
  if (!files.length) return badRequest('No files provided');

  const titles = form.getAll('titles');
  const locations = form.getAll('locations');
  const widths = form.getAll('widths');
  const heights = form.getAll('heights');
  let meta = [];
  const metaRaw = form.get('meta');
  if (typeof metaRaw === 'string' && metaRaw.trim()) {
    try {
      const parsed = JSON.parse(metaRaw);
      if (Array.isArray(parsed)) meta = parsed;
    } catch {
      return badRequest('Invalid JSON in `meta`');
    }
  }
  const displayBlobs = form.getAll('displayFiles').filter((f) => f instanceof File);

  const manifest = await readPhotosManifest(env);
  const byId = new Map(manifest.map((item) => [item.id, item]));
  const created = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const id = crypto.randomUUID();
    const originalKey = `photos/original/${id}.${extFromName(file.name)}`;
    await env.PHOTO_BUCKET.put(originalKey, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    let displayKey = null;
    const displayFile = displayBlobs[i];
    if (displayFile && displayFile.size > 0) {
      displayKey = `photos/display/${id}.jpg`;
      await env.PHOTO_BUCKET.put(displayKey, displayFile.stream(), {
        httpMetadata: { contentType: 'image/jpeg' },
      });
    }

    const entryMeta = meta[i] || {};
    const width = Number(entryMeta.width || widths[i]) || null;
    const height = Number(entryMeta.height || heights[i]) || null;
    const entry = {
      id,
      clientId: entryMeta.clientId ? String(entryMeta.clientId) : null,
      destination: String(entryMeta.destination || 'photography'),
      title: String(entryMeta.title || titles[i] || file.name.replace(/\.[^.]+$/, '')).trim() || file.name.replace(/\.[^.]+$/, ''),
      location: String(entryMeta.location || entryMeta.description || locations[i] || ''),
      description: String(entryMeta.description || entryMeta.location || locations[i] || ''),
      width,
      height,
      createdAt: new Date().toISOString(),
      originalKey,
      displayKey,
      thumbKey: null,
      filename: safeName(file.name),
    };

    byId.set(id, entry);
    created.push(entry);
  }

  await writePhotosManifest(env, [...byId.values()]);

  return json({ success: true, uploaded: created.length, items: created });
}
