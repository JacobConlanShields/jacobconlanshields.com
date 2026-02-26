import { badRequest, json, requireAdmin } from '../../_lib/media.js';
import { readPhotosManifest, writePhotosManifest } from '../../_lib/photos-manifest.js';

function safeName(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

function extFromName(fileName = '') {
  const idx = fileName.lastIndexOf('.');
  return idx > -1 ? fileName.slice(idx + 1).toLowerCase() : 'jpg';
}

function parseMeta(form, files) {
  const metaRaw = form.get('meta');
  if (typeof metaRaw === 'string' && metaRaw.trim()) {
    try {
      const parsed = JSON.parse(metaRaw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      throw new Error('Invalid meta JSON payload');
    }
  }

  const titles = form.getAll('titles');
  const locations = form.getAll('locations');
  const widths = form.getAll('widths');
  const heights = form.getAll('heights');

  return files.map((file, idx) => ({
    clientId: crypto.randomUUID(),
    filename: file.name,
    title: String(titles[idx] || file.name.replace(/\.[^.]+$/, '')),
    location: String(locations[idx] || ''),
    description: '',
    destination: 'photography',
    width: Number(widths[idx]) || null,
    height: Number(heights[idx]) || null,
  }));
}

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

  const form = await request.formData();
  const files = form.getAll('files').filter((f) => f instanceof File);
  if (!files.length) return badRequest('No files provided');

  let metadata = [];
  try {
    metadata = parseMeta(form, files);
  } catch (error) {
    return badRequest(error.message || 'Invalid metadata');
  }

  const displayBlobs = form.getAll('displayFiles').filter((f) => f instanceof File);

  const manifest = await readPhotosManifest(env);
  const byId = new Map(manifest.map((item) => [item.id, item]));
  const created = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const meta = metadata[i] || {};
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

    const width = Number(meta.width) || null;
    const height = Number(meta.height) || null;
    const entry = {
      id,
      clientId: String(meta.clientId || ''),
      title: String(meta.title || file.name.replace(/\.[^.]+$/, '')),
      location: String(meta.location || meta.description || ''),
      destination: 'photography',
      width,
      height,
      createdAt: new Date().toISOString(),
      originalKey,
      originalUrl: `/photos/${originalKey.split('/').map(encodeURIComponent).join('/')}`,
      displayKey,
      displayUrl: displayKey ? `/photos/${displayKey.split('/').map(encodeURIComponent).join('/')}` : null,
      thumbKey: null,
      filename: safeName(meta.filename || file.name),
    };

    byId.set(id, entry);
    created.push(entry);
  }

  await writePhotosManifest(env, [...byId.values()]);

  return json({ success: true, uploaded: created.length, items: created });
}
