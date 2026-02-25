import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name === 'index.html') {
      out.push(full);
    }
  }
  return out;
}

function toRoute(filePath) {
  const rel = path.relative(repoRoot, path.dirname(filePath)).replaceAll('\\', '/');
  if (!rel || rel === '.') return '/';
  return `/${rel}/`;
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  if (!match) return null;
  return match[1].replace(/\s+[—|-]\s+Jacob Shields/i, '').trim();
}

function extractDescription(html) {
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!p) return null;
  return p[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

function extractNavHrefs(html) {
  const hrefs = new Set();
  const navRegex = /<p\s+class=["']nav["'][^>]*>([\s\S]*?)<\/p>/gi;
  let navMatch;
  while ((navMatch = navRegex.exec(html)) !== null) {
    const links = navMatch[1].matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi);
    for (const link of links) {
      hrefs.add(link[1]);
    }
  }
  return hrefs;
}

function normalizeHref(href) {
  if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return null;
  let out = href;
  if (!out.startsWith('/')) return null;
  if (!out.endsWith('/')) {
    if (!path.basename(out).includes('.')) out = `${out}/`;
  }
  return out;
}

const allRoutes = [];
const publicHrefs = new Set(['/']);

for (const htmlPath of walk(repoRoot)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const route = toRoute(htmlPath);
  allRoutes.push({
    path: route,
    title: extractTitle(html) || route,
    description: extractDescription(html) || 'No description provided yet',
  });

  for (const href of extractNavHrefs(html)) {
    const normalized = normalizeHref(href);
    if (normalized) publicHrefs.add(normalized);
  }
}

const hiddenPages = allRoutes
  .filter((route) => !route.path.startsWith('/admin/'))
  .filter((route) => !route.path.startsWith('/pages/admin/'))
  .filter((route) => !publicHrefs.has(route.path))
  .sort((a, b) => a.path.localeCompare(b.path));

const generatedAt = new Date().toISOString();
const source = `export const hiddenPages = ${JSON.stringify(hiddenPages, null, 2)};\n\nexport const hiddenPagesMeta = {\n  generatedAt: ${JSON.stringify(generatedAt)},\n  source: 'scripts/generate-hidden-pages.mjs',\n  publicNavHrefs: ${JSON.stringify([...publicHrefs].sort(), null, 2)}\n};\n`;

fs.writeFileSync(path.join(repoRoot, 'src/admin/hidden-pages.js'), source);
console.log(`Generated src/admin/hidden-pages.js with ${hiddenPages.length} hidden page(s).`);
