const queue = [];

const rootSelect = document.getElementById('destination-root');
const sectionWrap = document.getElementById('spincline-section-wrap');
const sectionSelect = document.getElementById('spincline-section');
const filesInput = document.getElementById('files');
const uploadAllBtn = document.getElementById('upload-all');
const queueEl = document.getElementById('queue');
const batchStatus = document.getElementById('batch-status');
const limitBanner = document.getElementById('limit-banner');
const dropTarget = document.getElementById('drop-target');
const dropOverlay = document.getElementById('drop-overlay');

let uploadMaxMb = 100;
let dragDepth = 0;

function secondaryConfig() {
  return rootSelect.value === 'photography'
    ? { label: 'Location', kind: 'location' }
    : { label: 'Description', kind: 'description' };
}

function titleFromFilename(name = '') {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function estimateRequestBytes(item) {
  return item.file.size + (item.displayFile?.size || 0) + (item.thumbFile?.size || 0);
}

function escapeHtml(value = '') {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function updateDestinationUi() {
  sectionWrap.hidden = rootSelect.value !== 'spincline';
  const config = secondaryConfig();
  for (const item of queue) {
    const card = queueEl.querySelector(`[data-id="${item.id}"]`);
    if (!card) continue;
    const labelEl = card.querySelector('.secondary-label');
    const fieldWrap = card.querySelector('.secondary-field-wrap');
    if (!labelEl || !fieldWrap) continue;

    labelEl.textContent = config.label;
    const value = item.secondary || '';
    if (config.kind === 'description') {
      fieldWrap.innerHTML = `<textarea class="secondary-input" rows="3" placeholder="Optional">${escapeHtml(value)}</textarea>`;
    } else {
      fieldWrap.innerHTML = `<input class="secondary-input" type="text" value="${escapeHtml(value)}" placeholder="Optional" />`;
    }
    fieldWrap.querySelector('.secondary-input')?.addEventListener('input', (event) => {
      item.secondary = event.target.value;
    });
  }
}

async function canvasToJpegFile(canvas, baseName, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return null;
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

async function makeResized(bitmap, longSide, quality, baseName) {
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvasToJpegFile(canvas, baseName, quality);
}

async function prepareCardItem(file) {
  const item = {
    id: crypto.randomUUID(),
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

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'upload';

  try {
    const bitmap = await createImageBitmap(file);
    item.displayFile = await makeResized(bitmap, 2000, 0.88, `${baseName}-display`);
    item.thumbFile = await makeResized(bitmap, 600, 0.82, `${baseName}-thumb`);
    bitmap.close?.();

    const previewSource = item.displayFile || file;
    item.previewUrl = URL.createObjectURL(previewSource);
  } catch {
    item.warning = 'Preview/resize unavailable for this format on this browser.';
  }

  return item;
}

function cardTemplate(item) {
  const config = secondaryConfig();
  const secondaryField = config.kind === 'description'
    ? '<textarea class="secondary-input" rows="3" placeholder="Optional"></textarea>'
    : '<input class="secondary-input" type="text" placeholder="Optional" />';

  const preview = item.previewUrl
    ? `<img class="upload-thumb" src="${item.previewUrl}" alt="Preview for ${escapeHtml(item.file.name)}" />`
    : '<div class="upload-thumb upload-thumb--generic" aria-hidden="true">🖼️</div>';

  return `
    <div class="upload-row">
      ${preview}
      <div class="upload-file-meta">
        <h3>${escapeHtml(item.file.name)}</h3>
        <div class="small-note">${formatSize(item.file.size)}</div>
      </div>
    </div>
    <div class="small-note upload-warning" ${item.warning ? '' : 'hidden'}>${escapeHtml(item.warning)}</div>
    <div class="small-note upload-error" ${item.error ? '' : 'hidden'}>${escapeHtml(item.error)}</div>
    <div class="upload-meta upload-fields">
      <label>Title
        <input type="text" class="title-input" value="${escapeHtml(item.title)}" placeholder="Optional" />
      </label>
      <label>
        <span class="secondary-label">${config.label}</span>
        <span class="secondary-field-wrap">${secondaryField}</span>
      </label>
      <button class="upload-single" type="button">Upload</button>
      <div class="small-note status-line">${item.status}</div>
    </div>`;
}

function renderCard(item) {
  const card = document.createElement('section');
  card.className = 'upload-file';
  card.dataset.id = item.id;
  card.innerHTML = cardTemplate(item);
  queueEl.appendChild(card);
  requestAnimationFrame(() => card.classList.add('visible'));

  const titleInput = card.querySelector('.title-input');
  const secondaryInput = card.querySelector('.secondary-input');
  titleInput.addEventListener('input', (event) => {
    item.title = event.target.value;
  });
  secondaryInput?.addEventListener('input', (event) => {
    item.secondary = event.target.value;
  });

  card.querySelector('.upload-single')?.addEventListener('click', () => uploadItem(item.id));
}

function updateBatchStatus() {
  const readyCount = queue.filter((item) => item.status === 'Ready').length;
  batchStatus.textContent = queue.length ? `${queue.length} item(s) queued. ${readyCount} ready.` : 'No files queued.';
}

function setCardStatus(item, status, error = '') {
  item.status = status;
  item.error = error;
  const card = queueEl.querySelector(`[data-id="${item.id}"]`);
  if (!card) return;
  card.querySelector('.status-line').textContent = status;
  const err = card.querySelector('.upload-error');
  err.textContent = error;
  err.hidden = !error;
}

async function uploadItem(id) {
  const item = queue.find((entry) => entry.id === id);
  if (!item || item.status === 'Uploading' || item.status === 'Success') return;

  const limitBytes = uploadMaxMb * 1024 * 1024;
  const estimated = estimateRequestBytes(item);
  if (estimated > limitBytes) {
    setCardStatus(item, 'Failed', `Estimated request size ${formatSize(estimated)} exceeds ${uploadMaxMb} MB limit.`);
    updateBatchStatus();
    return;
  }

  const meta = {
    id: item.id,
    root: rootSelect.value,
    section: rootSelect.value === 'spincline' ? sectionSelect.value : null,
    title: (item.title || '').trim(),
    secondary: (item.secondary || '').trim(),
    originalName: item.file.name,
    originalType: item.file.type || 'application/octet-stream',
  };

  const form = new FormData();
  form.append('meta', JSON.stringify(meta));
  form.append('original', item.file, item.file.name);
  if (item.displayFile) form.append('display', item.displayFile, item.displayFile.name);
  if (item.thumbFile) form.append('thumb', item.thumbFile, item.thumbFile.name);

  try {
    setCardStatus(item, 'Uploading');
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`);
    }

    setCardStatus(item, 'Success');
  } catch (error) {
    setCardStatus(item, 'Failed', error.message || 'Upload failed');
  }

  updateBatchStatus();
}

async function uploadAllSequential() {
  for (const item of queue) {
    if (item.status === 'Ready') {
      // eslint-disable-next-line no-await-in-loop
      await uploadItem(item.id);
    }
  }
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;

  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    const item = await prepareCardItem(file);
    queue.push(item);
    renderCard(item);
  }

  updateDestinationUi();
  updateBatchStatus();
}

function showOverlay(show) {
  if (dropTarget) {
    dropTarget.classList.toggle('is-active', show);
  }
  if (dropOverlay) {
    dropOverlay.hidden = !show;
  }
}

function setupDragAndDrop() {
  window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    showOverlay(true);
  });

  window.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  window.addEventListener('dragleave', (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) showOverlay(false);
  });

  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    showOverlay(false);
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  });
}

async function loadHealth() {
  try {
    const res = await fetch('/api/admin/health', { credentials: 'same-origin' });
    if (!res.ok) return;
    const payload = await res.json();
    const maybeMax = Number(payload.uploadMaxMb);
    if (Number.isFinite(maybeMax) && maybeMax > 0) uploadMaxMb = maybeMax;
  } catch {
    uploadMaxMb = 100;
  }

  limitBanner.textContent = `Max upload per request: ${uploadMaxMb} MB (HTTP 413 if exceeded).`;
}

rootSelect.addEventListener('change', updateDestinationUi);
filesInput.addEventListener('change', () => addFiles(filesInput.files));
uploadAllBtn.addEventListener('click', uploadAllSequential);

setupDragAndDrop();
updateDestinationUi();
updateBatchStatus();
loadHealth();

window.addEventListener('beforeunload', () => {
  for (const item of queue) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
});
