import { packMosaic } from '/assets/mosaic/mosaic-packer.js';

const CONFIG = {
  gapPx: 16,
  minUnitPx: 160,
  maxUnitPx: 420,
  unitScale: 0.25,
  debounceMs: 140,
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  animationMs: 260,
  doubleTapMs: 250,
  layoutDebounceMs: 420,
};

const state = {
  photos: [],
  cards: new Map(),
  globalUnitPx: 240,
  lastPinnedId: null,
  lastTap: null,
  layoutOrder: [],
  layoutTimer: null,
  canPersistLayout: location.pathname.startsWith('/admin/'),
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
  const [indexRes, layoutRes] = await Promise.all([
    fetch('/photos/photography/meta/index.json', { credentials: 'same-origin' }),
    fetch('/photos/photography/meta/layout.json', { credentials: 'same-origin' }),
  ]);
  const index = indexRes.ok ? await indexRes.json() : [];
  const layout = layoutRes.ok ? await layoutRes.json() : { order: [] };

  const layoutOrder = Array.isArray(layout?.order) ? layout.order.map((v) => String(v)) : [];
  state.layoutOrder = layoutOrder;
  state.photos = orderPhotos(Array.isArray(index) ? index : [], layoutOrder);

  if (!state.photos.length) {
    els.status.innerHTML = 'No photos yet. Upload from <a href="/admin/upload">/admin/upload</a> to populate the mosaic.';
    return;
  }

  els.status.textContent = '';
  renderCards();

  if (document.fonts?.ready) await document.fonts.ready;

  await Promise.all([...state.cards.values()].map((c) => c.image?.decode?.().catch(() => null)));
  sizeCards();
  layoutCards({ animate: false });

  bindResize();
  bindOverlay();
}

function orderPhotos(photos, order) {
  const rank = new Map(order.map((id, idx) => [String(id), idx]));
  return photos.slice().sort((a, b) => {
    const aRank = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function renderCards() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const photo of state.photos) {
    const card = document.createElement('article');
    card.className = 'mosaic-card';
    card.dataset.id = photo.id;

    const imageWrap = document.createElement('div');
    imageWrap.className = 'mosaic-image-wrap';
    const img = document.createElement('img');
    img.className = 'mosaic-image';
    const thumbSrc = photo.thumbUrl || (photo.thumbKey ? `/photos/${photo.thumbKey}` : null);
    const displaySrc = photo.displayUrl || (photo.displayKey ? `/photos/${photo.displayKey}` : null);
    const originalSrc = photo.originalUrl || (photo.originalKey ? `/photos/${photo.originalKey}` : null);
    img.src = thumbSrc || displaySrc || originalSrc || '';
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
      ratio: Number(photo.aspect) || (photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1),
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      thumbSrc,
      displaySrc,
      originalSrc,
      displayLoaded: false,
    };
    state.cards.set(photo.id, record);

    bindCardInteractions(record);
    bindDisplaySwap(record);
  }
}

function bindDisplaySwap(card) {
  if (!card.displaySrc || card.displaySrc === card.thumbSrc) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || card.displayLoaded) continue;
      card.displayLoaded = true;
      const hi = new Image();
      hi.onload = () => { card.image.src = card.displaySrc; };
      hi.src = card.displaySrc;
      observer.disconnect();
    }
  }, { rootMargin: '300px 0px' });
  observer.observe(card.node);
}

function sizeCards() {
  const containerWidth = els.container.clientWidth || window.innerWidth;
  state.globalUnitPx = clamp(containerWidth * CONFIG.unitScale, CONFIG.minUnitPx, CONFIG.maxUnitPx);
  applyImageSizing();
  measureCardRects();
}

function applyImageSizing() {
  for (const card of state.cards.values()) {
    const ratio = card.ratio > 0 ? card.ratio : 1;
    if (ratio >= 1) {
      card.imageWrap.style.height = `${state.globalUnitPx}px`;
      card.imageWrap.style.width = `${state.globalUnitPx * ratio}px`;
    } else {
      card.imageWrap.style.width = `${state.globalUnitPx}px`;
      card.imageWrap.style.height = `${state.globalUnitPx / ratio}px`;
    }
  }
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
  const nextOrder = Object.entries(packed.positions)
    .sort(([, a], [, b]) => a.y - b.y || a.x - b.x)
    .map(([id]) => id);
  for (const [id, pos] of Object.entries(packed.positions)) {
    const card = state.cards.get(id);
    if (!card) continue;
    card.x = pos.x;
    card.y = pos.y;
    if (!animate || reduceMotion) card.node.style.transition = 'none';
    else card.node.style.transition = `transform ${CONFIG.animationMs}ms ${CONFIG.ease}`;
    card.node.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  }
  els.container.style.height = `${Math.ceil(packed.height)}px`;
  state.layoutOrder = nextOrder;
}

function bindCardInteractions(card) {
  let drag = null;

  card.node.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const baseX = card.x;
    const baseY = card.y;
    drag = {
      id: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      baseX,
      baseY,
      moved: false,
    };
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
      state.lastPinnedId = card.id;
      layoutCards({
        pinned: { id: card.id, x: dropX, y: dropY, w: card.width, h: card.height },
        animate: true,
      });
      queueLayoutSave();
    } else {
      card.node.style.transform = `translate3d(${card.x}px, ${card.y}px, 0)`;
    }

    drag = null;
  });

  card.image.addEventListener('dblclick', () => openOverlay(card.originalSrc || card.displaySrc || card.thumbSrc, card.image.alt));
  card.image.addEventListener('pointerup', () => {
    const now = Date.now();
    const prev = state.lastTap;
    if (prev && prev.id === card.id && (now - prev.at) <= CONFIG.doubleTapMs) {
      openOverlay(card.originalSrc || card.displaySrc || card.thumbSrc, card.image.alt);
      state.lastTap = null;
    } else {
      state.lastTap = { id: card.id, at: now };
    }
  });
}

function queueLayoutSave() {
  if (!state.canPersistLayout) return;
  clearTimeout(state.layoutTimer);
  state.layoutTimer = setTimeout(async () => {
    try {
      await fetch('/api/photos/layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ order: state.layoutOrder }),
      });
    } catch (error) {
      console.warn('Could not persist layout order', error);
    }
  }, CONFIG.layoutDebounceMs);
}

function bindResize() {
  let timeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      state.lastPinnedId = null;
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
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) close();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !backdrop.hidden) close();
  });

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
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
