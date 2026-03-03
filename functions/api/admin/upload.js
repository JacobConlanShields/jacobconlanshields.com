import { badRequest, json, nowIso, requireAdmin } from '../../_lib/media.js';

const ROOTS = new Set(['photography', 'spincline']);
const SPINCLINE_SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

function parseJson(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extFromName(name = '') {
  const index = name.lastIndexOf('.');
  return index > -1 ? name.slice(index + 1).toLowerCase() : 'bin';
}

async function readManifest(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return [];
  try {
    const parsed = JSON.parse(await object.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeManifest(bucket, key, items) {
  await bucket.put(key, JSON.stringify(items, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

function validateMeta(meta) {
  const root = String(meta?.root || '');
  const section = meta?.section == null ? null : String(meta.section);
  if (!ROOTS.has(root)) return 'Invalid root';
  if (root === 'spincline' && !SPINCLINE_SECTIONS.has(section || '')) return 'Invalid spincline section';
  return null;
}

function keyFor(root, section, kind, id, ext = 'jpg') {
  if (root === 'photography') return `photography/${kind}/${id}.${ext}`;
  return `spincline/${section}/${kind}/${id}.${ext}`;
}

export async function onRequestPost({ request, env }) {
  await requireAdmin(request);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

  const form = await request.formData();
  const meta = parseJson(form.get('meta'));
  if (!meta) return badRequest('Invalid or missing meta JSON');

  const validationError = validateMeta(meta);
  if (validationError) return badRequest(validationError);

  const original = form.get('original');
  const display = form.get('display');
  const thumb = form.get('thumb');
  if (!(original instanceof File)) return badRequest('Missing original file');

  const id = String(meta.id || crypto.randomUUID());
  const root = String(meta.root);
  const section = root === 'spincline' ? String(meta.section) : null;
  const createdAt = nowIso();

  const bucket = root === 'photography' ? env.PHOTO_BUCKET : env.SPINCLINE_BUCKET;
  const originalExt = extFromName(meta.originalName || original.name || 'file.bin');
  const originalKey = keyFor(root, section, 'original', id, originalExt);

  await bucket.put(originalKey, original.stream(), {
    httpMetadata: { contentType: meta.originalType || original.type || 'application/octet-stream' },
  });

  let displayKey = null;
  if (display instanceof File && display.size > 0) {
    displayKey = keyFor(root, section, 'display', id, 'jpg');
    await bucket.put(displayKey, display.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
  }

  let thumbKey = null;
  if (thumb instanceof File && thumb.size > 0) {
    thumbKey = keyFor(root, section, 'thumb', id, 'jpg');
    await bucket.put(thumbKey, thumb.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
  }

  const secondary = String(meta.secondary || '').trim();
  const item = {
    id,
    createdAt,
    root,
    section,
    title: String(meta.title || ''),
    location: root === 'photography' ? secondary || null : null,
    description: root === 'spincline' ? secondary || null : null,
    originalKey,
    displayKey,
    thumbKey,
    originalContentType: String(meta.originalType || original.type || 'application/octet-stream'),
    displayContentType: displayKey ? 'image/jpeg' : null,
    thumbContentType: thumbKey ? 'image/jpeg' : null,
  };

  const manifestKey = root === 'photography' ? 'manifests/photography.json' : 'manifests/spincline.json';
  const manifest = await readManifest(bucket, manifestKey);
  manifest.push(item);
  await writeManifest(bucket, manifestKey, manifest);

  return json({ ok: true, item });
}
