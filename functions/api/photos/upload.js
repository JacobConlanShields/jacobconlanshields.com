import { badRequest, json, requireAdmin } from '../../_lib/media.js';
import { readPhotosManifest, writePhotosManifest, photoPublicUrl } from '../../_lib/photos-manifest.js';

function safeName(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

function extFromName(fileName = '') {
  const idx = fileName.lastIndexOf('.');
  return idx > -1 ? fileName.slice(idx + 1).toLowerCase() : 'jpg';
}

function parseMeta(form, files) {
  const raw = form.get('meta');
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }

  const titles = form.getAll('titles');
  const locations = form.getAll('locations');
  const widths = form.getAll('widths');
  const heights = form.getAll('heights');
  return files.map((file, index) => ({
    clientId: crypto.randomUUID(),
    filename: file.name,
    title: String(titles[index] || file.name.replace(/\.[^.]+$/, '')),
    location: String(locations[index] || ''),
    description: String(locations[index] || ''),
    destination: 'photography',
    width: Number(widths[index]) || null,
    height: Number(heights[index]) || null,
    originalWidth: Number(widths[index]) || null,
    originalHeight: Number(heights[index]) || null,
  }));
}

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

  const form = await request.formData();
  const files = form.getAll('files[]').concat(form.getAll('files')).filter((f) => f instanceof File);
  if (!files.length) return badRequest('No files provided');

  const meta = parseMeta(form, files);
  const displayBlobs = form.getAll('displayFiles[]').concat(form.getAll('displayFiles')).filter((f) => f instanceof File);

  const manifest = await readPhotosManifest(env);
  const byId = new Map(manifest.map((item) => [item.id, item]));
  const created = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const itemMeta = meta[i] || {};
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

    const width = Number(itemMeta.originalWidth ?? itemMeta.width) || null;
    const height = Number(itemMeta.originalHeight ?? itemMeta.height) || null;
    const location = String(itemMeta.location || itemMeta.description || '');

    const entry = {
      id,
      clientId: String(itemMeta.clientId || crypto.randomUUID()),
      destination: String(itemMeta.destination || 'photography'),
      title: String(itemMeta.title || file.name.replace(/\.[^.]+$/, '')),
      location,
      description: location,
      width,
      height,
      createdAt: new Date().toISOString(),
      originalKey,
      originalUrl: photoPublicUrl(originalKey),
      displayKey,
      displayUrl: displayKey ? photoPublicUrl(displayKey) : null,
      thumbKey: null,
      filename: safeName(itemMeta.filename || file.name),
    };

    byId.set(id, entry);
    created.push(entry);
  }

  await writePhotosManifest(env, [...byId.values()]);

  return json({ success: true, uploaded: created.length, items: created });
}
