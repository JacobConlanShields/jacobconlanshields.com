import heic2any from '/assets/vendor/heic2any.js';

const rootInput = document.getElementById('root');
const sectionWrap = document.getElementById('section-wrap');
const sectionInput = document.getElementById('section');
const filesInput = document.getElementById('files');
const queue = document.getElementById('queue');
const batchStatus = document.getElementById('batch-status');
const limitBanner = document.getElementById('limit-banner');

const items = [];
let uploadMaxMb = 100;

function currentDestination() {
  const root = rootInput.value;
  return {
    root,
    section: root === 'spincline' ? sectionInput.value : null,
    secondaryLabel: root === 'photography' ? 'Location' : 'Description',
    isSpincline: root === 'spincline',
  };
}

function uid() {
  return crypto.randomUUID();
}

function bytesToMb(bytes) {
  return bytes / (1024 * 1024);
}

function titleFromFilename(name = '') {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function isHeic(file) {
  const lower = (file.name || '').toLowerCase();
  return file.type === 'image/heic' || file.type === 'image/heif' || lower.endsWith('.heic') || lower.endsWith('.heif');
}

function extFromName(name = '') {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : 'bin';
}

async function fetchHealth() {
  try {
    const resp = await fetch('/api/admin/health');
    if (!resp.ok) return;
    const data = await resp.json();
    uploadMaxMb = Number(data.uploadMaxMb || 100);
    limitBanner.textContent = `Max upload per request: ${uploadMaxMb} MB (HTTP 413 if exceeded).`;
  } catch {}
}

async function fileToBitmap(file) {
  if (isHeic(file)) {
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    if (!(blob instanceof Blob)) throw new Error('HEIC conversion failed.');
    return createImageBitmap(blob);
  }
  return createImageBitmap(file);
}

async function bitmapToJpegFile(bitmap, name, maxLongSide, quality) {
  const scale = Math.min(1, maxLongSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return null;
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
}

async function buildImageVariants(file) {
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const result = { display: null, thumb: null, previewUrl: null, error: null };
  try {
    const bitmap = await fileToBitmap(file);
    result.display = await bitmapToJpegFile(bitmap, `${baseName}-display`, 1800, 0.88);
    result.thumb = await bitmapToJpegFile(bitmap, `${baseName}-thumb`, 480, 0.82);

    const previewBlob = result.display || result.thumb;
    if (previewBlob) result.previewUrl = URL.createObjectURL(previewBlob);
    bitmap.close?.();
  } catch (error) {
    result.error = `Could not generate display/thumb in browser (${error.message || 'decode error'}). Original can still be uploaded.`;
  }
  return result;
}

function rerenderSecondaryField() {
  const { secondaryLabel, isSpincline } = currentDestination();
  queue.querySelectorAll('.secondary-label').forEach((el) => {
    el.textContent = secondaryLabel;
  });
  queue.querySelectorAll('.secondary-input').forEach((el) => {
    if (isSpincline && el.tagName === 'INPUT') {
      const next = document.createElement('textarea');
      next.className = 'secondary-input';
      next.rows = 3;
      next.placeholder = 'Optional';
      next.value = el.value;
      el.replaceWith(next);
    } else if (!isSpincline && el.tagName === 'TEXTAREA') {
      const next = document.createElement('input');
      next.className = 'secondary-input';
      next.type = 'text';
      next.placeholder = 'Optional';
      next.value = el.value;
      el.replaceWith(next);
    }
  });
}

function removeItem(clientId) {
  const idx = items.findIndex((i) => i.clientId === clientId);
  if (idx < 0) return;
  const [item] = items.splice(idx, 1);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  queue.querySelector(`[data-client-id="${clientId}"]`)?.remove();
  batchStatus.textContent = items.length ? `${items.length} file(s) queued.` : 'No files selected yet.';
}

function setCardBusy(card, isBusy) {
  card.querySelectorAll('input, textarea, button, select').forEach((el) => {
    el.disabled = isBusy;
  });
}

function cardHtml(item) {
  const { secondaryLabel, isSpincline } = currentDestination();
  const preview = item.previewUrl
    ? `<img class="upload-thumb" src="${item.previewUrl}" alt="Preview for ${item.original.name}">`
    : '<div class="upload-thumb upload-thumb--generic">📄</div>';

  return `
    <div class="upload-row">
      ${preview}
      <div class="upload-file-meta">
        <h3>${item.original.name}</h3>
        <div class="small-note">${(item.original.type || 'unknown')} · ${(bytesToMb(item.original.size)).toFixed(2)} MB</div>
      </div>
      <button type="button" class="remove">Remove</button>
    </div>
    <div class="small-note" style="color:#ff9f9f;" ${item.variantError ? '' : 'hidden'}>${item.variantError || ''}</div>
    <div class="upload-meta upload-fields">
      <label>Title <input type="text" class="title" value="${titleFromFilename(item.original.name)}"></label>
      <label><span class="secondary-label">${secondaryLabel}</span> ${isSpincline ? '<textarea class="secondary-input" rows="3" placeholder="Optional"></textarea>' : '<input class="secondary-input" type="text" placeholder="Optional">'} </label>
      <progress max="100" value="0"></progress>
      <div class="small-note status">Ready.</div>
      <button type="button" class="start">Upload</button>
    </div>
  `;
}

async function uploadImage(item, card, title, secondary) {
  const fd = new FormData();
  const { root, section } = currentDestination();
  const meta = { clientId: item.clientId, root, section, title, secondary };
  fd.set('meta', JSON.stringify(meta));
  fd.set('original', item.original, item.original.name);
  if (item.display) fd.set('display', item.display, item.display.name);
  if (item.thumb) fd.set('thumb', item.thumb, item.thumb.name);

  const total = item.original.size + (item.display?.size || 0) + (item.thumb?.size || 0);
  if (total > uploadMaxMb * 1024 * 1024) {
    throw new Error('This upload would exceed the per-request limit. Try smaller originals or upload one at a time.');
  }

  const resp = await fetch('/api/admin/upload', { method: 'POST', body: fd });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Upload failed (${resp.status})`);
  }
  const data = await resp.json();
  card.querySelector('.status').textContent = `Uploaded: ${data.item.id}`;
}

async function uploadVideoMultipart(item, card, title, secondary) {
  const { root, section } = currentDestination();
  const createResp = await fetch('/api/admin/video/mpu-create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, section, filename: item.original.name, contentType: item.original.type || 'video/mp4' }),
  });
  if (!createResp.ok) throw new Error(await createResp.text());

  const init = await createResp.json();
  const chunkSize = init.partSizeBytes;
  const totalParts = Math.ceil(item.original.size / chunkSize);
  card.querySelector('.status').textContent = `Multipart upload: 0/${totalParts} parts`;

  if (item.original.size > uploadMaxMb * 1024 * 1024) {
    const approx = (chunkSize / (1024 * 1024)).toFixed(1);
    card.querySelector('.status').textContent = `Video will be uploaded using multipart chunks of ~${approx} MB each.`;
  }

  const parts = [];
  for (let i = 0; i < totalParts; i += 1) {
    const partNumber = i + 1;
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, item.original.size);
    const chunk = item.original.slice(start, end);

    const partUrl = `/api/admin/video/mpu-part?key=${encodeURIComponent(init.key)}&uploadId=${encodeURIComponent(init.uploadId)}&partNumber=${partNumber}`;
    const partResp = await fetch(partUrl, { method: 'PUT', body: chunk });
    if (!partResp.ok) throw new Error(await partResp.text());
    const partData = await partResp.json();
    parts.push({ partNumber: partData.partNumber, etag: partData.etag });

    const progress = Math.round((partNumber / totalParts) * 100);
    card.querySelector('progress').value = progress;
    card.querySelector('.status').textContent = `Multipart upload: ${partNumber}/${totalParts} parts`;
  }

  const completeResp = await fetch('/api/admin/video/mpu-complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: init.key,
      uploadId: init.uploadId,
      parts,
      root,
      section,
      title,
      description: root === 'spincline' ? secondary : null,
      location: root === 'photography' ? secondary : null,
    }),
  });
  if (!completeResp.ok) throw new Error(await completeResp.text());
  const out = await completeResp.json();
  card.querySelector('.status').textContent = `Uploaded video: ${out.item.id}`;
}

async function uploadOne(clientId) {
  const item = items.find((i) => i.clientId === clientId);
  const card = queue.querySelector(`[data-client-id="${clientId}"]`);
  if (!item || !card) return;

  const title = card.querySelector('.title').value.trim();
  const secondary = card.querySelector('.secondary-input').value.trim();
  card.querySelector('.status').textContent = 'Uploading...';
  setCardBusy(card, true);

  try {
    if (item.original.type.startsWith('video/')) {
      await uploadVideoMultipart(item, card, title, secondary);
    } else {
      await uploadImage(item, card, title, secondary);
    }
    card.querySelector('progress').value = 100;
  } catch (error) {
    card.querySelector('.status').textContent = String(error.message || error);
  } finally {
    setCardBusy(card, false);
  }
}

async function addFile(file) {
  const item = { clientId: uid(), original: file, display: null, thumb: null, previewUrl: null, variantError: null };

  if (file.type.startsWith('image/')) {
    const variants = await buildImageVariants(file);
    item.display = variants.display;
    item.thumb = variants.thumb;
    item.previewUrl = variants.previewUrl;
    item.variantError = variants.error;
  }

  items.push(item);
  const card = document.createElement('section');
  card.className = 'upload-file visible';
  card.dataset.clientId = item.clientId;
  card.innerHTML = cardHtml(item);
  card.querySelector('.remove').addEventListener('click', () => removeItem(item.clientId));
  card.querySelector('.start').addEventListener('click', () => uploadOne(item.clientId));
  queue.appendChild(card);
  batchStatus.textContent = `${items.length} file(s) queued.`;
}

rootInput.addEventListener('change', () => {
  sectionWrap.hidden = rootInput.value !== 'spincline';
  rerenderSecondaryField();
});

filesInput.addEventListener('change', async (event) => {
  const selected = [...(event.target.files || [])];
  for (const file of selected) {
    await addFile(file);
  }
  filesInput.value = '';
});

sectionWrap.hidden = rootInput.value !== 'spincline';
fetchHealth();
