import { packMosaic } from '/assets/mosaic/mosaic-packer.js';

const CONFIG = {
  gapPx: 16,
  minUnitPx: 160,
  maxUnitPx: 420,
  unitVW: 0.25,
  debounceMs: 140,
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  animationMs: 260,
  doubleTapMs: 250,
  layoutWriteDebounceMs: 420,
};

const state = {
  photos: [],
  cards: new Map(),
  globalUnitPx: 240,
  lastTap: null,
  layoutOrder: [],
  layoutTimer: null,
  canWriteLayout: Boolean(window.__ENABLE_PHOTO_LAYOUT_WRITE__),
};

const els = {
  status: document.getElementById('photo-status'),
  container: document.getElementById('mosaic-container'),
  overlay: document.getElementById('photo-overlay'),
};

init().catch((err) => {
  console.error(err);
  els.status.textContent = 'Could not load photos.';
});

async function init() {
  const data = await loadPhotoData();
  state.photos = orderByLayout(data.items || [], data.layout?.order || []);
  state.layoutOrder = state.photos.map((p) => p.id);

  if (!state.photos.length) {
    els.status.innerHTML = 'No photos yet. Upload from <a href="/admin/upload">/admin/upload</a> to populate the mosaic.';
    return;
  }

  els.status.textContent = '';
  renderCards();

  if (document.fonts?.ready) await document.fonts.ready;
  sizeCards();
  layoutCards({ animate: false });

  bindResize();
  bindOverlay();
}

async function loadPhotoData() {
  try {
    const [indexResp, layoutResp] = await Promise.all([
      fetch('/photos/photography/meta/index.json', { credentials: 'same-origin' }),
      fetch('/photos/photography/meta/layout.json', { credentials: 'same-origin' }),
    ]);
    if (indexResp.ok) {
      const items = await indexResp.json();
      const layout = layoutResp.ok ? await layoutResp.json() : { order: [] };
      return { items, layout };
    }
  } catch {}

  const fallback = await fetch('/api/public/photography', { credentials: 'same-origin' });
  if (!fallback.ok) throw new Error('Bad response');
  return fallback.json();
}

function orderByLayout(items, order) {
  const byId = new Map(items.map((item) => [item.id, normalizePhoto(item)]));
  const ordered = [];
  for (const id of order) {
    const found = byId.get(id);
    if (found) {
      ordered.push(found);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());
  return ordered;
}

function normalizePhoto(photo) {
  const aspect = photo.aspect || (photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1);
  return {
    ...photo,
    aspect,
    thumbUrl: photo.thumbUrl || toUrl(photo.thumbKey),
    displayUrl: photo.displayUrl || toUrl(photo.displayKey),
    originalUrl: photo.originalUrl || toUrl(photo.originalKey),
  };
}

function toUrl(key) {
  return key ? `/photos/${key.split('/').map(encodeURIComponent).join('/')}` : null;
}

function renderCards() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.dataset.id;
      const card = state.cards.get(id);
      if (card?.displayLoaded || !card.photo.displayUrl) continue;
      card.displayLoaded = true;
      const next = new Image();
      next.onload = () => { card.image.src = card.photo.displayUrl; };
      next.src = card.photo.displayUrl;
    }
  }, { rootMargin: '300px' });

  for (const photo of state.photos) {
    const card = document.createElement('article');
    card.className = 'mosaic-card';
    card.dataset.id = photo.id;

    const imageWrap = document.createElement('div');
    imageWrap.className = 'mosaic-image-wrap';
    const img = document.createElement('img');
    img.className = 'mosaic-image';
    img.src = photo.thumbUrl || photo.displayUrl || photo.originalUrl || '';
    img.alt = photo.title || 'Photography image';
    img.loading = 'lazy';
    img.decoding = 'async';
    imageWrap.appendChild(img);

    const text = document.createElement('div');
    text.className = 'mosaic-text';
    text.innerHTML = `<h2 class="mosaic-title">${escapeHtml(photo.title || 'Untitled')}</h2><p class="mosaic-location">${escapeHtml(photo.location || photo.description || '')}</p>`;

    card.append(imageWrap, text);
    card.style.transition = reduceMotion ? 'none' : `transform ${CONFIG.animationMs}ms ${CONFIG.ease}`;
    els.container.appendChild(card);

    const record = { id: photo.id, photo, node: card, image: img, imageWrap, ratio: photo.aspect || 1, width: 0, height: 0, x: 0, y: 0, displayLoaded: false };
    state.cards.set(photo.id, record);
    bindCardInteractions(record);
    io.observe(card);
  }
}

function sizeCards() {
  const viewportTarget = clamp(els.container.clientWidth * CONFIG.unitVW, CONFIG.minUnitPx, CONFIG.maxUnitPx);
  state.globalUnitPx = viewportTarget;
  for (const card of state.cards.values()) {
    if (card.ratio >= 1) {
      card.imageWrap.style.height = `${state.globalUnitPx}px`;
      card.imageWrap.style.width = `${state.globalUnitPx * card.ratio}px`;
    } else {
      card.imageWrap.style.width = `${state.globalUnitPx}px`;
      card.imageWrap.style.height = `${state.globalUnitPx / card.ratio}px`;
    }
  }
  measureCardRects();
}

function measureCardRects() {
  for (const card of state.cards.values()) {
    const rect = card.node.getBoundingClientRect();
    card.width = rect.width;
    card.height = rect.height;
  }
}

function layoutCards({ pinned = null, animate = true } = {}) {
  measureCardRects();
  const width = els.container.clientWidth;
  const cards = [...state.cards.values()].map((c) => ({ id: c.id, w: c.width, h: c.height }));
  const packed = packMosaic(cards, width, CONFIG.gapPx, pinned);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const orderedByPosition = Object.entries(packed.positions).sort((a, b) => (a[1].y - b[1].y) || (a[1].x - b[1].x)).map(([id]) => id);
  state.layoutOrder = orderedByPosition;

  for (const [id, pos] of Object.entries(packed.positions)) {
    const card = state.cards.get(id);
    card.x = pos.x;
    card.y = pos.y;
    card.node.style.transition = !animate || reduceMotion ? 'none' : `transform ${CONFIG.animationMs}ms ${CONFIG.ease}`;
    card.node.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  }
  els.container.style.height = `${Math.ceil(packed.height)}px`;
}

function bindCardInteractions(card) {
  let drag = null;

  card.node.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    drag = { id: ev.pointerId, startX: ev.clientX, startY: ev.clientY, baseX: card.x, baseY: card.y, moved: false };
    card.node.setPointerCapture(ev.pointerId);
    card.node.classList.add('dragging');
    card.node.style.transition = 'none';
    card.node.style.zIndex = '30';
  });

  card.node.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    card.node.style.transform = `translate3d(${drag.baseX + dx}px, ${Math.max(0, drag.baseY + dy)}px, 0)`;
  });

  card.node.addEventListener('pointerup', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    const dropX = clamp(drag.baseX + dx, 0, Math.max(0, els.container.clientWidth - card.width));
    const dropY = Math.max(0, drag.baseY + dy);

    card.node.classList.remove('dragging');
    card.node.style.zIndex = '';
    card.node.releasePointerCapture(ev.pointerId);

    if (drag.moved) {
      layoutCards({ pinned: { id: card.id, x: dropX, y: dropY, w: card.width, h: card.height }, animate: true });
      scheduleLayoutWrite();
    } else {
      card.node.style.transform = `translate3d(${card.x}px, ${card.y}px, 0)`;
    }
    drag = null;
  });

  card.image.addEventListener('dblclick', () => openOverlay(card.photo.originalUrl, card.image.alt));
  card.image.addEventListener('pointerup', () => {
    const now = Date.now();
    const prev = state.lastTap;
    if (prev && prev.id === card.id && (now - prev.at) <= CONFIG.doubleTapMs) {
      openOverlay(card.photo.originalUrl, card.image.alt);
      state.lastTap = null;
    } else {
      state.lastTap = { id: card.id, at: now };
    }
  });
}

function scheduleLayoutWrite() {
  if (!state.canWriteLayout) return;
  clearTimeout(state.layoutTimer);
  state.layoutTimer = setTimeout(async () => {
    try {
      await fetch('/api/photos/layout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: state.layoutOrder }),
      });
    } catch (err) {
      console.warn('Failed to persist layout', err);
    }
  }, CONFIG.layoutWriteDebounceMs);
}

function bindResize() {
  let timeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      sizeCards();
      layoutCards({ animate: false });
    }, CONFIG.debounceMs);
  });
}

function bindOverlay() {
  const backdrop = els.overlay;
  const img = backdrop.querySelector('.photo-overlay-image');
  const closeBtn = backdrop.querySelector('.photo-overlay-close');
  const toggleBtn = backdrop.querySelector('.photo-overlay-toggle');
  const scrollArea = backdrop.querySelector('.photo-overlay-scroll');
  let mode = 'fit';

  function close() {
    backdrop.hidden = true;
    img.src = '';
    img.style.width = '';
    img.style.maxWidth = '';
    mode = 'fit';
    toggleBtn.textContent = '100%';
    document.body.classList.remove('overlay-open');
  }

  function toggle() {
    mode = mode === 'fit' ? 'native' : 'fit';
    if (mode === 'native') {
      img.style.maxWidth = 'none';
      img.style.width = `${img.naturalWidth}px`;
      toggleBtn.textContent = 'Fit';
    } else {
      img.style.width = '';
      img.style.maxWidth = '100%';
      toggleBtn.textContent = '100%';
      scrollArea.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }

  closeBtn.addEventListener('click', close);
  toggleBtn.addEventListener('click', toggle);
  backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) close(); });
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !backdrop.hidden) close(); });

  window.openPhotoOverlay = (src, alt) => {
    backdrop.hidden = false;
    img.src = src || '';
    img.alt = alt || 'Photo';
    img.style.maxWidth = '100%';
    document.body.classList.add('overlay-open');
  };
}

function openOverlay(src, alt) {
  if (!src) return;
  if (window.openPhotoOverlay) window.openPhotoOverlay(src, alt);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function escapeHtml(v) {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
