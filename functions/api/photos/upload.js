import { badRequest, json, requireAdmin } from '../../_lib/media.js';
import {
  ensurePhotoLayout,
  photoPublicUrl,
  readPhotoIndex,
  readPhotosManifest,
  writePhotoIndex,
  writePhotosManifest,
} from '../../_lib/photos-manifest.js';

function safeName(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

function extFromName(fileName = '') {
  const idx = fileName.lastIndexOf('.');
  return idx > -1 ? fileName.slice(idx + 1).toLowerCase() : 'jpg';
}

function normalizeMeta(metaRaw) {
  if (!metaRaw) return [];
  if (metaRaw instanceof File) {
    return metaRaw.text().then((text) => {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    });
  }
  if (typeof metaRaw === 'string' && metaRaw.trim()) {
    const parsed = JSON.parse(metaRaw);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function findFile(form, ...names) {
  for (const name of names) {
    const f = form.get(name);
    if (f instanceof File && f.size > 0) return f;
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

  const form = await request.formData();
  let meta = [];
  try {
    meta = await normalizeMeta(form.get('meta'));
  } catch {
    return badRequest('Invalid JSON in `meta`');
  }

  const legacyFiles = form.getAll('files').filter((f) => f instanceof File);
  const thumbFiles = form.getAll('thumbFiles').filter((f) => f instanceof File && f.size > 0);
  const displayFiles = form.getAll('displayFiles').filter((f) => f instanceof File && f.size > 0);
  const originalFiles = form.getAll('originalFiles').filter((f) => f instanceof File && f.size > 0);

  const hasBatchVariants = thumbFiles.length || displayFiles.length || originalFiles.length;
  const hasSingleVariant = findFile(form, 'thumbFile', 'thumb') || findFile(form, 'displayFile', 'display') || findFile(form, 'originalFile', 'original');

  if (!legacyFiles.length && !hasBatchVariants && !hasSingleVariant) return badRequest('No files provided');

  const titles = form.getAll('titles');
  const locations = form.getAll('locations');
  const widths = form.getAll('widths');
  const heights = form.getAll('heights');

  const legacyManifest = await readPhotosManifest(env);
  const legacyById = new Map(legacyManifest.map((item) => [item.id, item]));
  const currentIndex = await readPhotoIndex(env);

  const created = [];
  const processingCount = Math.max(
    legacyFiles.length,
    thumbFiles.length,
    displayFiles.length,
    originalFiles.length,
    meta.length,
    hasSingleVariant ? 1 : 0,
  );

  for (let i = 0; i < processingCount; i += 1) {
    const legacyFile = legacyFiles[i] || null;
    const thumbFile = thumbFiles[i] || (i === 0 ? findFile(form, 'thumbFile', 'thumb') : null);
    const displayFile = displayFiles[i] || (i === 0 ? findFile(form, 'displayFile', 'display') : null);
    const originalVariant = originalFiles[i] || (i === 0 ? findFile(form, 'originalFile', 'original') : null);
    const metaEntry = meta[i] || {};

    const originalFile = originalVariant || legacyFile;
    if (!(originalFile instanceof File) || originalFile.size === 0) continue;

    const id = String(metaEntry.id || form.get('id') || crypto.randomUUID());
    const destination = String(form.get('destination') || metaEntry.destination || 'photography');
    const originalExt = extFromName(metaEntry.originalName || originalFile.name);
    const originalKey = `${destination}/original/${id}.${originalExt}`;
    await env.PHOTO_BUCKET.put(originalKey, originalFile.stream(), {
      httpMetadata: { contentType: originalFile.type || 'application/octet-stream' },
    });

    let thumbKey = null;
    if (thumbFile) {
      thumbKey = `${destination}/thumb/${id}.webp`;
      await env.PHOTO_BUCKET.put(thumbKey, thumbFile.stream(), {
        httpMetadata: { contentType: thumbFile.type || 'image/webp' },
      });
    }

    let displayKey = null;
    if (displayFile) {
      displayKey = `${destination}/display/${id}.webp`;
      await env.PHOTO_BUCKET.put(displayKey, displayFile.stream(), {
        httpMetadata: { contentType: displayFile.type || 'image/webp' },
      });
    }

    const width = Number(metaEntry.width || widths[i]) || null;
    const height = Number(metaEntry.height || heights[i]) || null;
    const createdAt = String(metaEntry.createdAt || new Date().toISOString());
    const entry = {
      id,
      clientId: metaEntry.clientId ? String(metaEntry.clientId) : null,
      destination,
      title: String(metaEntry.title || titles[i] || originalFile.name.replace(/\.[^.]+$/, '')),
      location: String(metaEntry.location || metaEntry.description || locations[i] || ''),
      description: String(metaEntry.description || metaEntry.location || locations[i] || ''),
      width,
      height,
      aspect: width && height ? width / height : null,
      capturedAt: metaEntry.capturedAt || null,
      orientation: metaEntry.orientation || null,
      createdAt,
      originalKey,
      displayKey,
      thumbKey,
      filename: safeName(metaEntry.originalName || originalFile.name),
    };

    const metaKey = `${destination}/meta/${id}.json`;
    await env.PHOTO_BUCKET.put(metaKey, JSON.stringify(entry, null, 2), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });

    created.push(entry);
    legacyById.set(id, entry);
  }

  if (!created.length) return badRequest('No valid files were provided');

  const nextIndex = [...created, ...currentIndex.filter((existing) => !created.some((item) => item.id === existing.id))];
  await writePhotoIndex(env, nextIndex);
  await ensurePhotoLayout(env, nextIndex);
  await writePhotosManifest(env, [...legacyById.values()]);

  const responseItems = created.map((item) => ({
    ...item,
    metaKey: `${item.destination}/meta/${item.id}.json`,
    originalUrl: item.originalKey ? photoPublicUrl(item.originalKey) : null,
    displayUrl: item.displayKey ? photoPublicUrl(item.displayKey) : null,
    thumbUrl: item.thumbKey ? photoPublicUrl(item.thumbKey) : null,
  }));

  return json({ success: true, uploaded: responseItems.length, items: responseItems });
}
