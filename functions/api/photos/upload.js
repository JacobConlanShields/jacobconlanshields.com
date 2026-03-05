import { badRequest, json, requireAdmin } from '../../_lib/media.js';

const ROOT = 'photography';
const META_PREFIX = `${ROOT}/meta`;
const INDEX_KEY = `${META_PREFIX}/index.json`;
const LAYOUT_KEY = `${META_PREFIX}/layout.json`;

function extFromName(fileName = '') {
  const idx = fileName.lastIndexOf('.');
  return idx > -1 ? fileName.slice(idx + 1).toLowerCase() : 'jpg';
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function readJson(bucket, key, fallback) {
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return fallback;
  }
}

async function writeJson(bucket, key, payload) {
  await bucket.put(key, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

function normalizeItem(raw = {}) {
  const width = parseNumber(raw.width);
  const height = parseNumber(raw.height);
  return {
    id: String(raw.id || crypto.randomUUID()),
    destination: String(raw.destination || ROOT),
    title: String(raw.title || 'Untitled'),
    location: String(raw.location || raw.description || ''),
    description: String(raw.description || raw.location || ''),
    width,
    height,
    aspect: width && height ? width / height : null,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    capturedAt: raw.capturedAt ? String(raw.capturedAt) : null,
    orientation: raw.orientation ? String(raw.orientation) : null,
    originalKey: raw.originalKey || null,
    displayKey: raw.displayKey || null,
    thumbKey: raw.thumbKey || null,
    clientId: raw.clientId ? String(raw.clientId) : null,
  };
}

function buildKeys(id, originalFileName) {
  return {
    originalKey: `${ROOT}/original/${id}.${extFromName(originalFileName)}`,
    displayKey: `${ROOT}/display/${id}.webp`,
    thumbKey: `${ROOT}/thumb/${id}.webp`,
    metaKey: `${META_PREFIX}/${id}.json`,
  };
}

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

  const form = await request.formData();
  const destination = String(form.get('destination') || ROOT);
  if (destination !== ROOT) return badRequest('Unsupported destination');

  const metaRaw = form.get('meta');
  let metaList = [];
  if (typeof metaRaw === 'string' && metaRaw.trim()) {
    try {
      const parsed = JSON.parse(metaRaw);
      if (Array.isArray(parsed)) metaList = parsed;
    } catch {
      return badRequest('Invalid JSON in `meta`');
    }
  }

  const legacyFiles = form.getAll('files').filter((f) => f instanceof File);
  const thumbFiles = form.getAll('thumbFile').concat(form.getAll('thumbFiles')).filter((f) => f instanceof File);
  const displayFiles = form.getAll('displayFile').concat(form.getAll('displayFiles')).filter((f) => f instanceof File);
  const originalFiles = form.getAll('originalFile').concat(form.getAll('originalFiles')).filter((f) => f instanceof File);

  const isVariantMode = originalFiles.length || thumbFiles.length || displayFiles.length;
  const sourceFiles = isVariantMode ? originalFiles : legacyFiles;
  if (!sourceFiles.length) return badRequest('No files provided');

  const titles = form.getAll('titles');
  const locations = form.getAll('locations');
  const widths = form.getAll('widths');
  const heights = form.getAll('heights');

  const bucket = env.PHOTO_BUCKET;
  const index = await readJson(bucket, INDEX_KEY, []);
  const byId = new Map(Array.isArray(index) ? index.map((item) => [item.id, item]) : []);
  const created = [];

  for (let i = 0; i < sourceFiles.length; i += 1) {
    const originalFile = sourceFiles[i];
    const m = metaList[i] || {};
    const id = String(m.id || form.get('id') || crypto.randomUUID());
    const keys = buildKeys(id, originalFile.name || `upload-${i}.jpg`);

    await bucket.put(keys.originalKey, originalFile.stream(), {
      httpMetadata: { contentType: originalFile.type || 'application/octet-stream' },
    });

    let displayKey = null;
    const displayFile = displayFiles[i];
    if (displayFile && displayFile.size > 0) {
      displayKey = keys.displayKey;
      await bucket.put(displayKey, displayFile.stream(), {
        httpMetadata: { contentType: displayFile.type || 'image/webp' },
      });
    }

    let thumbKey = null;
    const thumbFile = thumbFiles[i];
    if (thumbFile && thumbFile.size > 0) {
      thumbKey = keys.thumbKey;
      await bucket.put(thumbKey, thumbFile.stream(), {
        httpMetadata: { contentType: thumbFile.type || 'image/webp' },
      });
    }

    const width = parseNumber(m.width || widths[i]);
    const height = parseNumber(m.height || heights[i]);
    const entry = normalizeItem({
      id,
      destination,
      title: m.title || titles[i] || originalFile.name.replace(/\.[^.]+$/, ''),
      location: m.location || m.description || locations[i] || '',
      description: m.description || m.location || locations[i] || '',
      width,
      height,
      createdAt: m.createdAt || new Date().toISOString(),
      capturedAt: m.capturedAt || null,
      orientation: m.orientation || null,
      originalKey: keys.originalKey,
      displayKey,
      thumbKey,
      clientId: m.clientId || null,
    });

    await writeJson(bucket, keys.metaKey, entry);
    byId.delete(id);
    created.push(entry);
  }

  const sorted = [...created, ...byId.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  await writeJson(bucket, INDEX_KEY, sorted);

  const layout = await readJson(bucket, LAYOUT_KEY, null);
  if (!layout || !Array.isArray(layout.order)) {
    await writeJson(bucket, LAYOUT_KEY, { order: sorted.map((item) => item.id) });
  }

  return json({ success: true, uploaded: created.length, items: created });
}
