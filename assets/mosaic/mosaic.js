import { packMosaic } from '/assets/mosaic/mosaic-packer.js';

const CONFIG = {
  gapPx: 16,
  minUnitPx: 160,
  maxUnitPx: 420,
  debounceMs: 140,
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  animationMs: 260,
  doubleTapMs: 250,
  layoutSaveDebounceMs: 420,
};

const state = {
  photos: [],
  cards: new Map(),
  globalUnitPx: 240,
  lastTap: null,
  orderedIds: [],
  saveTimer: null,
  isAdminLayout: document.documentElement.dataset.adminLayout === 'true',
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
  state.photos = await loadPhotos();
  if (!state.photos.length) {
    els.status.innerHTML = 'No photos yet. Upload from <a href="/admin/upload">/admin/upload</a> to populate the mosaic.';
    return;
  }

  els.status.textContent = state.isAdminLayout ? 'Admin layout mode enabled.' : '';
  renderCards();
  sizeCards();
  layoutCards({ animate: false });
  bindResize();
  bindOverlay();
  bindProgressiveLoading();
}

async function loadPhotos() {
  const [indexRes, layoutRes] = await Promise.all([
    fetch('/photos/photography/meta/index.json', { credentials: 'same-origin' }),
    fetch('/photos/photography/meta/layout.json', { credentials: 'same-origin' }),
  ]);

  if (!indexRes.ok) throw new Error(`index fetch failed (${indexRes.status})`);
  const index = await indexRes.json();
  const layout = layoutRes.ok ? await layoutRes.json() : null;
  const items = Array.isArray(index) ? index : [];
  const order = Array.isArray(layout?.order) ? layout.order.map(String) : [];
  const rank = new Map(order.map((id, idx) => [id, idx]));

  return items
    .slice()
    .sort((a, b) => {
      const ra = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    })
    .map((item) => ({
      ...item,
      id: String(item.id),
      aspect: Number(item.aspect) || ((Number(item.width) > 0 && Number(item.height) > 0) ? Number(item.width) / Number(item.height) : 1),
      thumbUrl: item.thumbKey ? `/photos/${encodePath(item.thumbKey)}` : null,
      displayUrl: item.displayKey ? `/photos/${encodePath(item.displayKey)}` : (item.originalKey ? `/photos/${encodePath(item.originalKey)}` : null),
      originalUrl: item.originalKey ? `/photos/${encodePath(item.originalKey)}` : null,
    }));
}

function renderCards() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.orderedIds = state.photos.map((p) => p.id);

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

    const record = {
      id: photo.id,
      node: card,
      image: img,
      imageWrap,
      ratio: photo.aspect > 0 ? photo.aspect : 1,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      displaySrc: photo.displayUrl,
      overlaySrc: photo.originalUrl,
      displayLoaded: !photo.displayUrl || photo.displayUrl === img.src,
    };
    state.cards.set(photo.id, record);
    bindCardInteractions(record);
  }
}

function sizeCards() {
  const containerWidth = els.container.clientWidth || window.innerWidth;
  state.globalUnitPx = clamp(containerWidth * 0.25, CONFIG.minUnitPx, CONFIG.maxUnitPx);

  for (const card of state.cards.values()) {
    if (card.ratio >= 1) {
      card.imageWrap.style.height = `${state.globalUnitPx}px`;
      card.imageWrap.style.width = `${state.globalUnitPx * card.ratio}px`;
    } else {
      card.imageWrap.style.width = `${state.globalUnitPx}px`;
      card.imageWrap.style.height = `${state.globalUnitPx / Math.max(card.ratio, 0.01)}px`;
    }
  }

  for (const card of state.cards.values()) {
    const rect = card.node.getBoundingClientRect();
    card.width = rect.width;
    card.height = rect.height;
  }
}

function layoutCards({ pinned = null, animate = true } = {}) {
  sizeCards();
  const width = els.container.clientWidth;
  const cards = state.orderedIds.map((id) => state.cards.get(id)).filter(Boolean).map((c) => ({ id: c.id, w: c.width, h: c.height }));
  const packed = packMosaic(cards, width, CONFIG.gapPx, pinned);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const [id, pos] of Object.entries(packed.positions)) {
    const card = state.cards.get(id);
    if (!card) continue;
    card.x = pos.x;
    card.y = pos.y;
    card.node.style.transition = (!animate || reduceMotion) ? 'none' : `transform ${CONFIG.animationMs}ms ${CONFIG.ease}`;
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
      const cards = state.orderedIds.map((id) => state.cards.get(id)).filter(Boolean);
      const ranked = cards
        .map((c) => ({ id: c.id, score: c.id === card.id ? dropY * 1_000_000 + dropX : c.y * 1_000_000 + c.x }))
        .sort((a, b) => a.score - b.score);
      state.orderedIds = ranked.map((x) => x.id);

      layoutCards({ pinned: { id: card.id, x: dropX, y: dropY, w: card.width, h: card.height }, animate: true });
      scheduleLayoutSave();
    } else {
      card.node.style.transform = `translate3d(${card.x}px, ${card.y}px, 0)`;
    }

    drag = null;
  });

  card.image.addEventListener('dblclick', () => openOverlay(card.overlaySrc, card.image.alt));
  card.image.addEventListener('pointerup', () => {
    const now = Date.now();
    const prev = state.lastTap;
    if (prev && prev.id === card.id && (now - prev.at) <= CONFIG.doubleTapMs) {
      openOverlay(card.overlaySrc, card.image.alt);
      state.lastTap = null;
    } else {
      state.lastTap = { id: card.id, at: now };
    }
  });
}

function scheduleLayoutSave() {
  if (!state.isAdminLayout) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/photos/layout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: state.orderedIds }),
      });
    } catch (err) {
      console.warn('Failed to persist layout', err);
    }
  }, CONFIG.layoutSaveDebounceMs);
}

function bindProgressiveLoading() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = state.cards.get(entry.target.dataset.id);
      if (!card || card.displayLoaded || !card.displaySrc) continue;
      card.image.src = card.displaySrc;
      card.displayLoaded = true;
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '300px 0px' });

  for (const card of state.cards.values()) observer.observe(card.node);
}

function bindResize() {
  let timeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => layoutCards({ animate: false }), CONFIG.debounceMs);
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

function encodePath(key = '') {
  return String(key).split('/').map(encodeURIComponent).join('/');
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function escapeHtml(v) { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
