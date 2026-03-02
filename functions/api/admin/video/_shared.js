export const ROOTS = new Set(['photography', 'spincline']);
export const SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

export function uploadMaxMb(env) {
  return Number(env.UPLOAD_MAX_MB || 100);
}

export function validateDestination(root, section) {
  if (!ROOTS.has(root)) return 'Invalid root';
  if (root === 'spincline' && !SECTIONS.has(section)) return 'Invalid spincline section';
  return null;
}

export function keyFor(root, section, filename) {
  const safe = String(filename || 'video.bin').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const id = crypto.randomUUID();
  if (root === 'photography') return `photography/video/${id}-${safe}`;
  return `spincline/${section}/video/${id}-${safe}`;
}

export function manifestKeyFor(root) {
  return root === 'photography' ? 'manifests/photography.json' : 'manifests/spincline.json';
}

