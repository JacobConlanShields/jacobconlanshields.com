import { packMosaic } from '/assets/mosaic/mosaic-packer.js';

const CONFIG = {
  trimPct: 0.10,
  targetVW: 0.25,
  gapPx: 16,
  minUnitPx: 120,
  maxUnitPx: 520,
  settleTolerance: 0.02,
  debounceMs: 140,
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  animationMs: 260,
  doubleTapMs: 250,
};

const state = {
  photos: [],
  cards: new Map(),
  globalUnitPx: 240,
  lastPinnedId: null,
  lastTap: null,
};

const els = {
  status: document.getElementById('photo-status'),
  container: document.getElementById('mosaic-container'),
  overlay: document.getElementById('photo-overlay'),
};

init().catch((err) => {
  console.error(err);
  els.status.textContent = 'Unable to load photos right now.';
});

async function init() {
  const photos = await fetch('/api/photos', { credentials: 'same-origin' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('Bad response')));
  state.photos = Array.isArray(photos) ? photos : [];

  if (!state.photos.length) {
    els.status.innerHTML = 'No photos yet. Upload from <a href="/admin/upload">/admin/upload</a> to populate the mosaic.';
    return;
  }

  els.status.textContent = '';
  renderCards();

  if (document.fonts?.ready) await document.fonts.ready;

  await Promise.all([...state.cards.values()].map((c) => c.image?.decode?.().catch(() => null)));
  sizeCardsTwoPass();
  layoutCards({ animate: false });

  bindResize();
  bindOverlay();
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
    img.src = keyUrl(photo.displayKey || photo.originalKey);
    img.alt = photo.title || 'Photography image';
    img.loading = 'lazy';
    img.decoding = 'async';
    imageWrap.appendChild(img);

    const text = document.createElement('div');
    text.className = 'mosaic-text';
    text.innerHTML = `<h2 class="mosaic-title">${escapeHtml(photo.title || 'Untitled')}</h2><p class="mosaic-location">${escapeHtml(photo.location || '')}</p>`;

    card.append(imageWrap, text);
    card.style.transition = reduceMotion ? 'none' : `transform ${CONFIG.animationMs}ms ${CONFIG.ease}`;
    els.container.appendChild(card);

    const record = {
      id: photo.id,
      node: card,
      image: img,
      imageWrap,
      title: text.querySelector('.mosaic-title'),
      location: text.querySelector('.mosaic-location'),
      ratio: photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      originalKey: photo.originalKey,
    };
    state.cards.set(photo.id, record);

    bindCardInteractions(record);
  }
}

function sizeCardsTwoPass() {
  const viewportTarget = window.innerWidth * CONFIG.targetVW;
  state.globalUnitPx = clamp(viewportTarget, CONFIG.minUnitPx, CONFIG.maxUnitPx);

  applyImageSizing();
  let measured = measureTrimmedMean();
  if (!measured) return;

  state.globalUnitPx = clamp(state.globalUnitPx * (viewportTarget / measured), CONFIG.minUnitPx, CONFIG.maxUnitPx);
  applyImageSizing();

  measured = measureTrimmedMean();
  if (!measured) return;

  if (Math.abs(measured - viewportTarget) / viewportTarget > CONFIG.settleTolerance) {
    state.globalUnitPx = clamp(state.globalUnitPx * (viewportTarget / measured), CONFIG.minUnitPx, CONFIG.maxUnitPx);
    applyImageSizing();
  }

  measureCardRects();
}

function applyImageSizing() {
  for (const card of state.cards.values()) {
    if (card.ratio >= 1) {
      card.imageWrap.style.height = `${state.globalUnitPx}px`;
      card.imageWrap.style.width = `${state.globalUnitPx * card.ratio}px`;
    } else {
      card.imageWrap.style.width = `${state.globalUnitPx}px`;
      card.imageWrap.style.height = `${state.globalUnitPx / card.ratio}px`;
    }
  }
}

function measureTrimmedMean() {
  const samples = [];
  for (const card of state.cards.values()) {
    const rect = card.node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) samples.push(Math.min(rect.width, rect.height));
  }
  if (!samples.length) return null;

  const sorted = samples.sort((a, b) => a - b);
  const n = sorted.length;
  const k = Math.floor(n * CONFIG.trimPct);
  if (n - 2 * k >= 5) {
    const trimmed = sorted.slice(k, n - k);
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  }
  if (n >= 3) return sorted[Math.floor(n / 2)];
  return sorted.reduce((a, b) => a + b, 0) / n;
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
  for (const [id, pos] of Object.entries(packed.positions)) {
    const card = state.cards.get(id);
    card.x = pos.x;
    card.y = pos.y;
    if (!animate || reduceMotion) card.node.style.transition = 'none';
    else card.node.style.transition = `transform ${CONFIG.animationMs}ms ${CONFIG.ease}`;
    card.node.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  }
  els.container.style.height = `${Math.ceil(packed.height)}px`;
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
    } else {
      card.node.style.transform = `translate3d(${card.x}px, ${card.y}px, 0)`;
    }

    drag = null;
  });

  card.image.addEventListener('dblclick', () => openOverlay(card.originalKey, card.image.alt));
  card.image.addEventListener('pointerup', () => {
    const now = Date.now();
    const prev = state.lastTap;
    if (prev && prev.id === card.id && (now - prev.at) <= CONFIG.doubleTapMs) {
      openOverlay(card.originalKey, card.image.alt);
      state.lastTap = null;
    } else {
      state.lastTap = { id: card.id, at: now };
    }
  });
}

function bindResize() {
  let timeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      state.lastPinnedId = null;
      sizeCardsTwoPass();
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

  window.openPhotoOverlay = (key, alt) => {
    backdrop.hidden = false;
    img.src = keyUrl(key);
    img.alt = alt || 'Photo';
    img.style.maxWidth = '100%';
    document.body.classList.add('overlay-open');
  };
}

function openOverlay(key, alt) {
  if (window.openPhotoOverlay) window.openPhotoOverlay(key, alt);
}

function keyUrl(key) {
  return `/photos/${key.split('/').map(encodeURIComponent).join('/')}`;
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
