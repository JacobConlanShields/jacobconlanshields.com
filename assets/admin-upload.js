const rootSelect = document.getElementById('root');
const sectionWrap = document.getElementById('section-wrap');
const sectionSelect = document.getElementById('section');
const filesInput = document.getElementById('files');
const queue = document.getElementById('queue');
const batchStatus = document.getElementById('batch-status');
const uploadLimitBanner = document.getElementById('upload-limit');

const SPINCLINE_SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);
let uploadMaxMb = 100;
const items = [];

function titleFromFilename(name = '') {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function bytesLabel(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function cardById(clientId) {
  return queue.querySelector(`[data-client-id="${clientId}"]`);
}

function updateDestinationVisibility() {
  sectionWrap.hidden = rootSelect.value !== 'spincline';
}

function setCardStatus(card, text, isError = false) {
  const status = card.querySelector('.status');
  status.textContent = text;
  status.style.color = isError ? '#ff9f9f' : '';
}

function setCardBusy(card, busy) {
  card.dataset.status = busy ? 'uploading' : 'ready';
  card.querySelectorAll('input, textarea, button, select').forEach((el) => {
    if (el.classList.contains('remove') && !busy) return;
    el.disabled = busy;
  });
}

function safeHeic(file) {
  const lower = (file.name || '').toLowerCase();
  return file.type === 'image/heic' || file.type === 'image/heif' || lower.endsWith('.heic') || lower.endsWith('.heif');
}

async function decodeBitmap(file) {
  if (safeHeic(file)) {
    try {
      const { default: heic2any } = await import('/assets/vendor/heic2any.js');
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      if (!(blob instanceof Blob)) throw new Error('HEIC conversion failed');
      return await createImageBitmap(blob);
    } catch {
      return null;
    }
  }

  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

async function jpegVariant(bitmap, maxLongSide, nameBase) {
  const scale = Math.min(1, maxLongSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) return null;
  return new File([blob], `${nameBase}.jpg`, { type: 'image/jpeg' });
}

async function prepareImageVariants(item) {
  const bitmap = await decodeBitmap(item.file);
  if (!bitmap) {
    item.displayFile = null;
    item.thumbFile = null;
    item.variantError = 'Could not decode image in-browser. Original can still upload, but display/thumb were skipped.';
    return;
  }

  const base = item.clientId;
  item.displayFile = await jpegVariant(bitmap, 1600, `${base}-display`);
  item.thumbFile = await jpegVariant(bitmap, 480, `${base}-thumb`);
  bitmap.close?.();
}

function createCard(item) {
  const card = document.createElement('section');
  card.className = 'upload-file';
  card.dataset.clientId = item.clientId;
  const previewUrl = URL.createObjectURL(item.file);
  item.previewUrl = previewUrl;

  card.innerHTML = `
    <div class="upload-row">
      ${item.file.type.startsWith('image/') ? `<img class="upload-thumb" src="${previewUrl}" alt="Preview for ${item.file.name}">` : '<div class="upload-thumb upload-thumb--generic">🎬</div>'}
      <div class="upload-file-meta">
        <h3>${item.file.name}</h3>
        <div class="small-note">${item.file.type || 'unknown'} · ${bytesLabel(item.file.size)}</div>
      </div>
      <button type="button" class="remove">Remove</button>
    </div>
    <div class="upload-meta upload-fields">
      <label>Title <input class="title" type="text" value="${titleFromFilename(item.file.name)}"></label>
      <label class="secondary-label-wrap"></label>
      <progress max="100" value="0"></progress>
      <div class="small-note status">Ready.</div>
      <button type="button" class="start">Upload</button>
    </div>`;

  const secondaryWrap = card.querySelector('.secondary-label-wrap');
  if (item.root === 'photography') {
    secondaryWrap.innerHTML = 'Location <input class="secondary" type="text" placeholder="Optional">';
  } else {
    secondaryWrap.innerHTML = 'Description <textarea class="secondary" rows="3" placeholder="Optional"></textarea>';
  }

  card.querySelector('.remove').addEventListener('click', () => {
    URL.revokeObjectURL(item.previewUrl);
    const idx = items.findIndex((entry) => entry.clientId === item.clientId);
    if (idx >= 0) items.splice(idx, 1);
    card.remove();
    batchStatus.textContent = items.length ? `${items.length} file(s) queued.` : 'No files selected yet.';
  });

  card.querySelector('.start').addEventListener('click', () => uploadOne(item.clientId));
  queue.append(card);
}

async function uploadImage(item, card) {
  if (!item.prepared) {
    setCardStatus(card, 'Preparing display/thumb variants...');
    await prepareImageVariants(item);
    item.prepared = true;
  }

  const totalBytes = item.file.size + (item.displayFile?.size || 0) + (item.thumbFile?.size || 0);
  if (totalBytes > uploadMaxMb * 1024 * 1024) {
    throw new Error('This upload would exceed the per-request limit. Try smaller originals or upload one at a time.');
  }

  const meta = {
    clientId: item.clientId,
    root: item.root,
    section: item.root === 'spincline' ? item.section : null,
    title: card.querySelector('.title').value.trim(),
    secondary: card.querySelector('.secondary').value.trim(),
  };

  const form = new FormData();
  form.set('meta', JSON.stringify(meta));
  form.set('original', item.file, item.file.name);
  if (item.displayFile) form.set('display', item.displayFile, item.displayFile.name);
  if (item.thumbFile) form.set('thumb', item.thumbFile, item.thumbFile.name);

  setCardStatus(card, item.variantError ? `${item.variantError} Uploading original...` : 'Uploading...');
  card.querySelector('progress').value = 40;

  const resp = await fetch('/api/admin/upload', { method: 'POST', body: form, credentials: 'same-origin' });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(payload.error || `Upload failed (${resp.status})`);
  card.querySelector('progress').value = 100;
  setCardStatus(card, 'Uploaded successfully.');
}

async function createMultipartUpload(item) {
  const resp = await fetch('/api/admin/video/mpu-create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      root: item.root,
      section: item.root === 'spincline' ? item.section : null,
      filename: item.file.name,
      contentType: item.file.type || 'video/mp4',
    }),
  });
  const payload = await resp.json();
  if (!resp.ok) throw new Error(payload.error || 'Unable to create multipart upload');
  return payload;
}

async function uploadVideo(item, card) {
  const setup = await createMultipartUpload(item);
  const partSize = setup.partSizeBytes;
  const totalParts = Math.ceil(item.file.size / partSize);
  setCardStatus(card, `Video will be uploaded using multipart chunks of ~${(partSize / (1024 * 1024)).toFixed(1)} MB each.`);

  const parts = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(item.file.size, start + partSize);
    const chunk = item.file.slice(start, end);
    const resp = await fetch(`/api/admin/video/mpu-part?key=${encodeURIComponent(setup.key)}&uploadId=${encodeURIComponent(setup.uploadId)}&partNumber=${partNumber}`, {
      method: 'PUT',
      body: chunk,
      credentials: 'same-origin',
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || `Failed part ${partNumber}`);
    parts.push({ partNumber: payload.partNumber, etag: payload.etag });
    card.querySelector('progress').value = Math.round((partNumber / totalParts) * 100);
    setCardStatus(card, `Multipart upload progress: ${partNumber}/${totalParts} parts.`);
  }

  const completeResp = await fetch('/api/admin/video/mpu-complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      key: setup.key,
      uploadId: setup.uploadId,
      parts,
      root: item.root,
      section: item.root === 'spincline' ? item.section : null,
      title: card.querySelector('.title').value.trim(),
      description: card.querySelector('.secondary').value.trim(),
    }),
  });
  const completePayload = await completeResp.json();
  if (!completeResp.ok) throw new Error(completePayload.error || 'Failed to complete multipart upload');
  setCardStatus(card, 'Video uploaded successfully.');
}

async function uploadOne(clientId) {
  const item = items.find((entry) => entry.clientId === clientId);
  const card = cardById(clientId);
  if (!item || !card) return;

  setCardBusy(card, true);
  try {
    if (item.file.type.startsWith('video/')) {
      await uploadVideo(item, card);
    } else {
      await uploadImage(item, card);
    }
  } catch (error) {
    setCardStatus(card, error.message || 'Upload failed.', true);
  } finally {
    setCardBusy(card, false);
  }
}

filesInput.addEventListener('change', async () => {
  const selected = [...filesInput.files];
  for (const file of selected) {
    const root = rootSelect.value;
    const section = root === 'spincline' ? sectionSelect.value : null;
    const item = {
      clientId: crypto.randomUUID(),
      root,
      section,
      file,
      prepared: false,
      displayFile: null,
      thumbFile: null,
      variantError: '',
    };
    items.push(item);
    createCard(item);
  }
  filesInput.value = '';
  batchStatus.textContent = items.length ? `${items.length} file(s) queued.` : 'No files selected yet.';
});

rootSelect.addEventListener('change', updateDestinationVisibility);

(async function init() {
  updateDestinationVisibility();
  try {
    const health = await fetch('/api/admin/health', { credentials: 'same-origin' });
    const payload = await health.json();
    uploadMaxMb = Number(payload.uploadMaxMb || 100);
  } catch {
    uploadMaxMb = 100;
  }
  uploadLimitBanner.textContent = `Max upload per request: ${uploadMaxMb} MB (HTTP 413 if exceeded).`;
})();
