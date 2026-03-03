const queue = [];
const rootSelect = document.getElementById('destination-root');
const sectionLabel = document.getElementById('section-label');
const sectionSelect = document.getElementById('spincline-section');
const filesInput = document.getElementById('files');
const uploadAllBtn = document.getElementById('upload-all');
const queueStatus = document.getElementById('queue-status');
const queueContainer = document.getElementById('queue');
const overlay = document.getElementById('drop-overlay');
const banner = document.getElementById('upload-limit-banner');

let uploadMaxMb = 100;
let dragDepth = 0;

function titleFromFilename(name = '') {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function friendlySize(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getSecondaryMeta() {
  return rootSelect.value === 'photography'
    ? { label: 'Location', input: 'input' }
    : { label: 'Description', input: 'textarea' };
}

function setStatus(card, status, error = '') {
  card.status = status;
  card.error = error;
  render();
}

function updateTopStatus() {
  queueStatus.textContent = queue.length ? `${queue.length} file(s) queued.` : 'No files queued.';
  uploadAllBtn.disabled = !queue.some((item) => item.status === 'ready' || item.status === 'failed');
}

function sanitize(text = '') {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cardMarkup(item) {
  const secondary = getSecondaryMeta();
  const warning = item.previewWarning
    ? `<p class="small-note" style="color:#ffcc80;">${sanitize(item.previewWarning)}</p>`
    : '';
  const error = item.error
    ? `<p class="small-note" style="color:#ff9f9f;">${sanitize(item.error)}</p>`
    : '';
  const statusText = item.status.charAt(0).toUpperCase() + item.status.slice(1);
  const preview = item.previewUrl
    ? `<img class="upload-thumb" src="${item.previewUrl}" alt="Preview for ${sanitize(item.file.name)}"/>`
    : '<div class="upload-thumb upload-thumb--generic">🖼️</div>';

  const secondaryField = secondary.input === 'textarea'
    ? `<textarea class="secondary-input" rows="3" data-id="${item.id}" placeholder="Optional">${sanitize(item.secondary)}</textarea>`
    : `<input class="secondary-input" type="text" data-id="${item.id}" value="${sanitize(item.secondary)}" placeholder="Optional"/>`;

  return `
    <section class="upload-file visible" data-id="${item.id}">
      <div class="upload-row">
        ${preview}
        <div class="upload-file-meta">
          <h3>${sanitize(item.file.name)}</h3>
          <div class="small-note">${friendlySize(item.file.size)}</div>
        </div>
      </div>
      ${warning}
      ${error}
      <div class="upload-meta upload-fields">
        <label>Title
          <input class="title-input" type="text" data-id="${item.id}" value="${sanitize(item.title)}" placeholder="Title" />
        </label>
        <label>${secondary.label}
          ${secondaryField}
        </label>
        <button type="button" class="upload-one" data-id="${item.id}" ${item.status === 'uploading' ? 'disabled' : ''}>Upload</button>
        <p class="small-note">Status: ${statusText}</p>
      </div>
    </section>`;
}

function render() {
  queueContainer.innerHTML = queue.map(cardMarkup).join('');
  updateTopStatus();
}

function updateSectionVisibility() {
  const spincline = rootSelect.value === 'spincline';
  sectionLabel.hidden = !spincline;
  render();
}

async function toJpegFile(bitmap, longSide, name, quality) {
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return null;
  return new File([blob], `${name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
}

async function buildQueueItem(file) {
  const item = {
    id: crypto.randomUUID(),
    file,
    previewUrl: null,
    title: titleFromFilename(file.name),
    secondary: '',
    status: 'ready',
    error: '',
    displayFile: null,
    thumbFile: null,
    previewWarning: '',
  };

  try {
    const bitmap = await createImageBitmap(file);
    item.displayFile = await toJpegFile(bitmap, 2000, file.name, 0.88);
    item.thumbFile = await toJpegFile(bitmap, 600, file.name, 0.82);
    bitmap.close?.();

    if (item.displayFile) {
      item.previewUrl = URL.createObjectURL(item.displayFile);
    } else {
      item.previewUrl = URL.createObjectURL(file);
    }
  } catch {
    item.previewWarning = 'Preview/resize unavailable for this format on this browser.';
  }

  return item;
}

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  for (const file of files) {
    queue.push(await buildQueueItem(file));
  }
  filesInput.value = '';
  render();
}

function payloadSize(item) {
  return item.file.size + (item.displayFile?.size || 0) + (item.thumbFile?.size || 0);
}

async function uploadItem(item) {
  if (item.status === 'uploading' || item.status === 'success') return;
  const limitBytes = uploadMaxMb * 1024 * 1024;
  if (payloadSize(item) > limitBytes) {
    setStatus(item, 'failed', `Request too large. Limit is ${uploadMaxMb} MB.`);
    return;
  }

  setStatus(item, 'uploading');

  const meta = {
    id: item.id,
    root: rootSelect.value,
    section: rootSelect.value === 'spincline' ? sectionSelect.value : null,
    title: item.title,
    secondary: item.secondary,
    originalName: item.file.name,
    originalType: item.file.type || 'application/octet-stream',
  };

  const fd = new FormData();
  fd.set('meta', JSON.stringify(meta));
  fd.set('original', item.file);
  if (item.displayFile) fd.set('display', item.displayFile);
  if (item.thumbFile) fd.set('thumb', item.thumbFile);

  try {
    const resp = await fetch('/api/admin/upload', {
      method: 'POST',
      credentials: 'same-origin',
      body: fd,
    });

    if (!resp.ok) {
      const detail = await resp.text();
      setStatus(item, 'failed', detail || `HTTP ${resp.status}`);
      return;
    }

    setStatus(item, 'success');
  } catch (err) {
    setStatus(item, 'failed', err?.message || 'Network error');
  }
}

async function uploadAllSequential() {
  uploadAllBtn.disabled = true;
  for (const item of queue) {
    if (item.status === 'ready' || item.status === 'failed') {
      // eslint-disable-next-line no-await-in-loop
      await uploadItem(item);
    }
  }
  updateTopStatus();
}

async function loadHealth() {
  try {
    const resp = await fetch('/api/admin/health', { credentials: 'same-origin' });
    if (!resp.ok) return;
    const data = await resp.json();
    if (Number.isFinite(Number(data.uploadMaxMb)) && Number(data.uploadMaxMb) > 0) {
      uploadMaxMb = Number(data.uploadMaxMb);
    }
  } catch {
    uploadMaxMb = 100;
  }
  banner.textContent = `Max upload per request: ${uploadMaxMb} MB (HTTP 413 if exceeded).`;
}

queueContainer.addEventListener('input', (event) => {
  const target = event.target;
  const id = target.dataset.id;
  if (!id) return;
  const item = queue.find((entry) => entry.id === id);
  if (!item) return;
  if (target.classList.contains('title-input')) item.title = target.value;
  if (target.classList.contains('secondary-input')) item.secondary = target.value;
});

queueContainer.addEventListener('click', (event) => {
  const button = event.target.closest('.upload-one');
  if (!button) return;
  const item = queue.find((entry) => entry.id === button.dataset.id);
  if (item) uploadItem(item);
});

filesInput.addEventListener('change', (event) => addFiles(event.target.files));
uploadAllBtn.addEventListener('click', uploadAllSequential);
rootSelect.addEventListener('change', updateSectionVisibility);

window.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  overlay.hidden = false;
});
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) overlay.hidden = true;
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
});

loadHealth();
updateSectionVisibility();
render();
