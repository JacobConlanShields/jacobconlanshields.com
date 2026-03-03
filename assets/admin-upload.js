const state = {
  root: 'photography',
  section: 'design-and-build',
  uploadMaxMb: 100,
  queue: [],
  uploadingAll: false,
  dragDepth: 0,
};

const els = {
  root: document.getElementById('destination-root'),
  sectionWrap: document.getElementById('spincline-section-wrap'),
  section: document.getElementById('spincline-section'),
  fileInput: document.getElementById('files'),
  uploadAll: document.getElementById('upload-all'),
  queue: document.getElementById('queue'),
  batchStatus: document.getElementById('batch-status'),
  limitBanner: document.getElementById('limit-banner'),
  dropOverlay: document.getElementById('drop-overlay'),
};

function titleFromFilename(name = '') {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function friendlySize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function secondaryLabel() {
  return state.root === 'photography' ? 'Location' : 'Description';
}

function isImage(file) {
  return file instanceof File && (file.type || '').startsWith('image/');
}

async function fileFromCanvas(canvas, name, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return null;
  return new File([blob], name, { type: 'image/jpeg' });
}

async function createJpegVariant(bitmap, longSide, quality, nameBase) {
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return fileFromCanvas(canvas, `${nameBase}.jpg`, quality);
}

async function prepareCardData(file) {
  const id = crypto.randomUUID();
  const item = {
    id,
    file,
    previewUrl: null,
    title: titleFromFilename(file.name),
    secondary: '',
    status: 'Ready',
    error: '',
    warning: '',
    displayFile: null,
    thumbFile: null,
  };

  try {
    const bitmap = await createImageBitmap(file);
    const base = file.name.replace(/\.[^.]+$/, '') || id;
    item.displayFile = await createJpegVariant(bitmap, 2000, 0.88, `${base}-display`);
    item.thumbFile = await createJpegVariant(bitmap, 600, 0.82, `${base}-thumb`);
    bitmap.close?.();
    if (item.displayFile) item.previewUrl = URL.createObjectURL(item.displayFile);
  } catch {
    item.warning = 'Preview/resize unavailable for this format on this browser.';
  }

  if (!item.previewUrl && isImage(file)) {
    try {
      item.previewUrl = URL.createObjectURL(file);
    } catch {
      // ignored
    }
  }

  return item;
}

function render() {
  els.sectionWrap.hidden = state.root !== 'spincline';
  els.queue.innerHTML = '';

  state.queue.forEach((item) => {
    const card = document.createElement('section');
    card.className = 'upload-file visible';
    card.dataset.id = item.id;

    const preview = item.previewUrl
      ? `<img class="upload-thumb" src="${item.previewUrl}" alt="Preview for ${item.file.name}">`
      : '<div class="upload-thumb upload-thumb--generic" aria-hidden="true">🖼️</div>';

    const secondaryControl = state.root === 'photography'
      ? `<input class="secondary-input" type="text" value="${escapeHtml(item.secondary)}" placeholder="Optional">`
      : `<textarea class="secondary-input" rows="3" placeholder="Optional">${escapeHtml(item.secondary)}</textarea>`;

    card.innerHTML = `
      <div class="upload-row">
        ${preview}
        <div class="upload-file-meta">
          <h3>${escapeHtml(item.file.name)}</h3>
          <div class="small-note">${friendlySize(item.file.size)}</div>
        </div>
      </div>
      <div class="upload-meta upload-fields">
        <label>Title <input class="title-input" type="text" value="${escapeHtml(item.title)}" placeholder="Optional"></label>
        <label><span class="secondary-label">${secondaryLabel()}</span> ${secondaryControl}</label>
        <div class="small-note warning" ${item.warning ? '' : 'hidden'}>${escapeHtml(item.warning)}</div>
        <div class="small-note error" ${item.error ? '' : 'hidden'}>${escapeHtml(item.error)}</div>
        <div class="small-note status">${escapeHtml(item.status)}</div>
        <button type="button" class="start" ${state.uploadingAll || item.status === 'Uploading' ? 'disabled' : ''}>Upload</button>
      </div>`;

    card.querySelector('.title-input').addEventListener('input', (e) => {
      item.title = e.target.value;
    });
    card.querySelector('.secondary-input').addEventListener('input', (e) => {
      item.secondary = e.target.value;
    });
    card.querySelector('.start').addEventListener('click', () => uploadOne(item));

    els.queue.appendChild(card);
  });

  const readyCount = state.queue.filter((item) => item.status === 'Ready' || item.status === 'Failed').length;
  els.uploadAll.disabled = state.uploadingAll || readyCount === 0;
  els.batchStatus.textContent = state.queue.length
    ? `${state.queue.length} file(s) queued.`
    : 'No files queued yet.';
}

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function updateLimitBanner() {
  els.limitBanner.textContent = `Max upload per request: ${state.uploadMaxMb} MB (HTTP 413 if exceeded).`;
}

async function loadHealth() {
  try {
    const resp = await fetch('/api/admin/health', { credentials: 'same-origin' });
    if (!resp.ok) throw new Error('health request failed');
    const data = await resp.json();
    const value = Number(data.uploadMaxMb);
    if (Number.isFinite(value) && value > 0) state.uploadMaxMb = value;
  } catch {
    state.uploadMaxMb = 100;
  }
  updateLimitBanner();
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => isImage(file));
  for (const file of files) {
    const item = await prepareCardData(file);
    state.queue.push(item);
  }
  render();
}

function buildMeta(item) {
  return {
    id: item.id,
    root: state.root,
    section: state.root === 'spincline' ? state.section : null,
    title: item.title,
    secondary: item.secondary,
    originalName: item.file.name,
    originalType: item.file.type || 'application/octet-stream',
  };
}

function setItemState(item, status, error = '') {
  item.status = status;
  item.error = error;
  render();
}

async function uploadOne(item) {
  if (item.status === 'Uploading' || item.status === 'Success') return;

  const estimated = item.file.size + (item.displayFile?.size || 0) + (item.thumbFile?.size || 0);
  const limitBytes = state.uploadMaxMb * 1024 * 1024;
  if (estimated > limitBytes) {
    setItemState(item, 'Failed', `Request too large (${friendlySize(estimated)} > ${state.uploadMaxMb} MB limit).`);
    return;
  }

  setItemState(item, 'Uploading');
  const form = new FormData();
  form.append('meta', JSON.stringify(buildMeta(item)));
  form.append('original', item.file, item.file.name);
  if (item.displayFile) form.append('display', item.displayFile, item.displayFile.name);
  if (item.thumbFile) form.append('thumb', item.thumbFile, item.thumbFile.name);

  try {
    const resp = await fetch('/api/admin/upload', {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || !payload.ok) {
      throw new Error(payload.error || `Upload failed (${resp.status})`);
    }
    setItemState(item, 'Success');
  } catch (error) {
    setItemState(item, 'Failed', error.message || String(error));
  }
}

async function uploadAll() {
  if (state.uploadingAll) return;
  state.uploadingAll = true;
  render();

  try {
    for (const item of state.queue) {
      if (item.status === 'Success') continue;
      await uploadOne(item);
    }
  } finally {
    state.uploadingAll = false;
    render();
  }
}

function showDropOverlay(show) {
  els.dropOverlay.hidden = !show;
}

function onDragEnter(event) {
  event.preventDefault();
  state.dragDepth += 1;
  showDropOverlay(true);
}

function onDragLeave(event) {
  event.preventDefault();
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) showDropOverlay(false);
}

function onDragOver(event) {
  event.preventDefault();
}

async function onDrop(event) {
  event.preventDefault();
  state.dragDepth = 0;
  showDropOverlay(false);
  const files = event.dataTransfer?.files;
  if (files?.length) await addFiles(files);
}

function bindEvents() {
  els.root.addEventListener('change', () => {
    state.root = els.root.value;
    render();
  });

  els.section.addEventListener('change', () => {
    state.section = els.section.value;
  });

  els.fileInput.addEventListener('change', async (event) => {
    if (event.target.files?.length) await addFiles(event.target.files);
    event.target.value = '';
  });

  els.uploadAll.addEventListener('click', uploadAll);

  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
}

async function init() {
  bindEvents();
  await loadHealth();
  render();
}

init();
