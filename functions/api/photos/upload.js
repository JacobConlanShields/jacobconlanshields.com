import { badRequest, json, requireAdmin } from '../../_lib/media.js';
import { writePhotosManifest } from '../../_lib/photos-manifest.js';
import { ensureLayout, readPhotoIndex, writeJsonObject, writePhotoIndex } from '../../_lib/photography-meta.js';

function safeName(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

function extFromName(fileName = '') {
  const idx = fileName.lastIndexOf('.');
  return idx > -1 ? fileName.slice(idx + 1).toLowerCase() : 'jpg';
}

function fileFrom(form, names) {
  for (const name of names) {
    const value = form.get(name);
    if (value instanceof File && value.size > 0) return value;
  }
  return null;
}

function toText(form, names, fallback = '') {
  for (const name of names) {
    const value = form.get(name);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

async function writeItemFiles(env, id, originalFile, displayFile, thumbFile) {
  const originalExt = extFromName(originalFile.name || 'original.jpg');
  const originalKey = `photography/original/${id}.${originalExt}`;
  await env.PHOTO_BUCKET.put(originalKey, originalFile.stream(), {
    httpMetadata: { contentType: originalFile.type || 'application/octet-stream' },
  });

  let displayKey = null;
  if (displayFile) {
    displayKey = `photography/display/${id}.webp`;
    await env.PHOTO_BUCKET.put(displayKey, displayFile.stream(), {
      httpMetadata: { contentType: displayFile.type || 'image/webp' },
    });
  }

  let thumbKey = null;
  if (thumbFile) {
    thumbKey = `photography/thumb/${id}.webp`;
    await env.PHOTO_BUCKET.put(thumbKey, thumbFile.stream(), {
      httpMetadata: { contentType: thumbFile.type || 'image/webp' },
    });
  }

  return { originalKey, displayKey, thumbKey };
}

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

  const form = await request.formData();
  const multiOriginals = form.getAll('originalFile').filter((f) => f instanceof File && f.size > 0);
  const legacyFiles = form.getAll('files').filter((f) => f instanceof File && f.size > 0);
  const originals = multiOriginals.length ? multiOriginals : legacyFiles;
  if (!originals.length) {
    const singleOriginal = fileFrom(form, ['originalFile', 'original', 'file']);
    if (!singleOriginal) return badRequest('No files provided');
    originals.push(singleOriginal);
  }

  const displayFiles = form.getAll('displayFile').concat(form.getAll('displayFiles')).filter((f) => f instanceof File && f.size > 0);
  const thumbFiles = form.getAll('thumbFile').concat(form.getAll('thumbFiles')).filter((f) => f instanceof File && f.size > 0);
  const ids = form.getAll('id');
  const titles = form.getAll('titles');
  const locations = form.getAll('locations');
  const descriptions = form.getAll('descriptions');
  const widths = form.getAll('widths');
  const heights = form.getAll('heights');

  let meta = [];
  const metaRaw = form.get('meta');
  const metaJsonRaw = form.get('metaJson');
  const firstMetaBlob = form.get('metaFile') || form.get('meta');
  const metaValue = metaRaw || metaJsonRaw;

  if (typeof metaValue === 'string' && metaValue.trim()) {
    try {
      const parsed = JSON.parse(metaValue);
      if (Array.isArray(parsed)) meta = parsed;
      else if (parsed && typeof parsed === 'object') meta = [parsed];
    } catch {
      return badRequest('Invalid JSON in `meta`');
    }
  } else if (firstMetaBlob instanceof File && firstMetaBlob.size > 0 && firstMetaBlob.type.includes('json')) {
    try {
      const parsed = JSON.parse(await firstMetaBlob.text());
      meta = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return badRequest('Invalid JSON in `meta` blob');
    }
  }

  const previousIndex = await readPhotoIndex(env);
  const byId = new Map(previousIndex.map((item) => [item.id, item]));
  const created = [];

  for (let i = 0; i < originals.length; i += 1) {
    const originalFile = originals[i];
    const entryMeta = meta[i] || {};
    const id = String(entryMeta.id || ids[i] || crypto.randomUUID());
    const displayFile = displayFiles[i] || null;
    const thumbFile = thumbFiles[i] || null;

    const { originalKey, displayKey, thumbKey } = await writeItemFiles(env, id, originalFile, displayFile, thumbFile);

    const width = Number(entryMeta.width || widths[i]) || null;
    const height = Number(entryMeta.height || heights[i]) || null;
    const createdAt = new Date().toISOString();
    const destination = String(entryMeta.destination || toText(form, ['destination'], 'photography') || 'photography');
    const item = {
      id,
      clientId: entryMeta.clientId ? String(entryMeta.clientId) : null,
      destination,
      title: String(entryMeta.title || titles[i] || toText(form, ['title']) || originalFile.name.replace(/\.[^.]+$/, '')),
      location: String(entryMeta.location || locations[i] || toText(form, ['location']) || ''),
      description: String(entryMeta.description || descriptions[i] || toText(form, ['description']) || ''),
      width,
      height,
      aspect: width && height ? width / height : null,
      captureDate: entryMeta.captureDate ? String(entryMeta.captureDate) : null,
      createdAt,
      originalKey,
      displayKey,
      thumbKey,
      filename: safeName(originalFile.name),
    };

    await writeJsonObject(env.PHOTO_BUCKET, `photography/meta/${id}.json`, item);

    byId.set(id, item);
    created.push(item);
  }

  const nextIndex = [...byId.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  await writePhotoIndex(env, nextIndex);
  await ensureLayout(env, nextIndex);

  // Legacy manifest compatibility for existing clients.
  await writePhotosManifest(env, nextIndex);

  return json({ success: true, uploaded: created.length, items: created });
}
