import heic2any from '/assets/vendor/heic2any.js';

const rootInput = document.getElementById('root');
const sectionInput = document.getElementById('section');
const sectionWrap = document.getElementById('section-wrap');
const filesInput = document.getElementById('files');
const queue = document.getElementById('queue');
const limitBanner = document.getElementById('limit-banner');

const state = {
  uploadMaxMb: 100,
  items: [],
};

const SPINCLINE_SECTIONS = new Set(['design-and-build', 'finished-products', 'in-action']);

function api(path, options = {}) {
  return fetch(path, { ...options, credentials: 'same-origin' });
}

function isHeic(file) {
  const name = (file.name || '').toLowerCase();
  return file.type === 'image/heic' || file.type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
}

function titleFromFilename(name = '') {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extFromFile(file) {
  const fromName = file.name?.split('.').pop()?.toLowerCase();
  if (fromName) return fromName;
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/heic') return 'heic';
  return 'bin';
}

function syncDestinationVisibility() {
  sectionWrap.hidden = rootInput.value !== 'spincline';
  for (const card of queue.querySelectorAll('.upload-file')) {
    const secondaryLabel = card.querySelector('.secondary-label');
    const secondaryInput = card.querySelector('.secondary-input');
    if (!secondaryLabel || !secondaryInput) continue;
    secondaryLabel.textContent = rootInput.value === 'photography' ? 'Location' : 'Description';
    if (rootInput.value === 'photography' && secondaryInput.tagName === 'TEXTAREA') {
      const next = document.createElement('input');
      next.type = 'text';
      next.className = 'secondary-input';
      next.value = secondaryInput.value;
      secondaryInput.replaceWith(next);
    }
    if (rootInput.value === 'spincline' && secondaryInput.tagName === 'INPUT') {
      const next = document.createElement('textarea');
      next.rows = 3;
      next.className = 'secondary-input';
      next.value = secondaryInput.value;
      secondaryInput.replaceWith(next);
    }
  }
}

async function loadHealth() {
  try {
    const res = await api('/api/admin/health');
    const data = await res.json();
    state.uploadMaxMb = Number(data.uploadMaxMb || 100);
  } catch {
    state.uploadMaxMb = 100;
  }
  limitBanner.textContent = `Max upload per request: ${state.uploadMaxMb} MB (HTTP 413 if exceeded).`;
}

async function decodeToBitmap(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    if (!isHeic(file)) throw new Error('Image decode failed.');
    try {
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      if (!(blob instanceof Blob)) throw new Error('HEIC conversion failed.');
      return await createImageBitmap(blob);
    } catch {
      throw new Error('HEIC decode unavailable in this browser. Original can still be uploaded without display/thumb.');
    }
  }
}

async function createJpegVariant(bitmap, maxLongSide, quality = 0.88) {
  const scale = Math.min(1, maxLongSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return null;
  return new File([blob], 'variant.jpg', { type: 'image/jpeg' });
}

function makeId() {
  return crypto.randomUUID();
}

function cardTemplate(item) {
  const secondaryField = rootInput.value === 'photography'
    ? '<input type="text" class="secondary-input" placeholder="Optional" />'
    : '<textarea class="secondary-input" rows="3" placeholder="Optional"></textarea>';

  return `
    <div class="upload-row">
      ${item.previewUrl ? `<img class="upload-thumb" src="${item.previewUrl}" alt="Preview for ${item.original.name}">` : '<div class="upload-thumb upload-thumb--generic" aria-hidden="true">📄</div>'}
      <div class="upload-file-meta">
        <h3>${item.original.name}</h3>
        <div class="small-note">${item.original.type || 'unknown type'} · ${(item.original.size / (1024 * 1024)).toFixed(2)} MB</div>
      </div>
    </div>
    <div class="upload-meta upload-fields">
      <label>Title <input type="text" class="title" value="${titleFromFilename(item.original.name)}" placeholder="Optional" /></label>
      <label><span class="secondary-label">${rootInput.value === 'photography' ? 'Location' : 'Description'}</span> ${secondaryField}</label>
      <div class="small-note conversion-note" ${item.variantError ? '' : 'hidden'}>${item.variantError || ''}</div>
      <progress max="100" value="0"></progress>
      <div class="small-note status">Ready.</div>
      <button type="button" class="start">Upload this file</button>
    </div>`;
}

function setCardBusy(card, busy) {
  card.querySelectorAll('input, textarea, select, button').forEach((el) => {
    el.disabled = busy;
  });
}

function getSelectedSection() {
  return rootInput.value === 'spincline' ? sectionInput.value : null;
}

async function uploadImageItem(item, card) {
  const title = card.querySelector('.title').value.trim();
  const secondary = card.querySelector('.secondary-input').value.trim();
  const root = rootInput.value;
  const section = getSelectedSection();

  if (root === 'spincline' && !SPINCLINE_SECTIONS.has(section)) {
    throw new Error('Invalid spincline section.');
  }

  const display = item.display || null;
  const thumb = item.thumb || null;
  const estimatedBytes = item.original.size + (display?.size || 0) + (thumb?.size || 0);
  if (estimatedBytes > state.uploadMaxMb * 1024 * 1024) {
    throw new Error('This upload would exceed the per-request limit. Try smaller originals or upload one at a time.');
  }

  const fd = new FormData();
  fd.set('meta', JSON.stringify({ clientId: item.clientId, root, section, title, secondary }));
  fd.set('original', item.original, item.original.name);
  if (display) fd.set('display', display, `${item.clientId}-display.jpg`);
  if (thumb) fd.set('thumb', thumb, `${item.clientId}-thumb.jpg`);

  const res = await api('/api/admin/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed.');
  return data.item;
}

async function uploadVideoMultipart(item, card) {
  const statusEl = card.querySelector('.status');
  const title = card.querySelector('.title').value.trim();
  const description = card.querySelector('.secondary-input').value.trim();
  const root = rootInput.value;
  const section = getSelectedSection();
  const initRes = await api('/api/admin/video/mpu-create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, section, filename: item.original.name, contentType: item.original.type }),
  });
  const init = await initRes.json();
  if (!initRes.ok) throw new Error(init.error || 'Failed to start multipart upload.');

  const partSize = init.partSizeBytes;
  const totalParts = Math.ceil(item.original.size / partSize);
  const partSizeMb = (partSize / (1024 * 1024)).toFixed(1);
  statusEl.textContent = `Video will be uploaded using multipart chunks of ~${partSizeMb} MB each.`;

  const parts = [];
  for (let part = 1; part <= totalParts; part += 1) {
    const start = (part - 1) * partSize;
    const end = Math.min(start + partSize, item.original.size);
    const chunk = item.original.slice(start, end);
    const partRes = await api(`/api/admin/video/mpu-part?key=${encodeURIComponent(init.key)}&uploadId=${encodeURIComponent(init.uploadId)}&partNumber=${part}`, {
      method: 'PUT',
      body: chunk,
      headers: { 'content-type': 'application/octet-stream' },
    });
    const partData = await partRes.json();
    if (!partRes.ok) throw new Error(partData.error || `Failed on part ${part}.`);
    parts.push({ partNumber: partData.partNumber, etag: partData.etag });
    card.querySelector('progress').value = Math.round((part / totalParts) * 100);
    statusEl.textContent = `Multipart upload progress: ${part}/${totalParts} parts.`;
  }

  const completeRes = await api('/api/admin/video/mpu-complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: init.key,
      uploadId: init.uploadId,
      parts,
      title,
      description,
      root,
      section,
      clientId: item.clientId,
    }),
  });
  const complete = await completeRes.json();
  if (!completeRes.ok || !complete.ok) throw new Error(complete.error || 'Failed to complete multipart upload.');
  return complete.item;
}

async function uploadSingle(item, card) {
  const statusEl = card.querySelector('.status');
  setCardBusy(card, true);
  card.dataset.status = 'uploading';
  statusEl.textContent = 'Uploading...';

  try {
    let result;
    if (item.original.type.startsWith('video/')) {
      result = await uploadVideoMultipart(item, card);
    } else {
      result = await uploadImageItem(item, card);
      card.querySelector('progress').value = 100;
    }
    card.dataset.status = 'done';
    statusEl.textContent = `Uploaded: ${result.id}`;
  } catch (error) {
    card.dataset.status = 'error';
    statusEl.textContent = error.message || 'Upload failed.';
  } finally {
    setCardBusy(card, false);
  }
}

async function createItem(file) {
  const clientId = makeId();
  const item = { clientId, original: file, previewUrl: '', display: null, thumb: null, variantError: '' };
  if (file.type.startsWith('image/')) {
    item.previewUrl = URL.createObjectURL(file);
    try {
      const bitmap = await decodeToBitmap(file);
      item.display = await createJpegVariant(bitmap, 2000, 0.9);
      item.thumb = await createJpegVariant(bitmap, 600, 0.82);
      bitmap.close?.();
    } catch (error) {
      item.variantError = `${error.message} Display/thumb will be null.`;
    }
  }
  return item;
}

async function addFiles(fileList) {
  for (const file of fileList) {
    const item = await createItem(file);
    state.items.push(item);
    const card = document.createElement('section');
    card.className = 'upload-file visible';
    card.dataset.clientId = item.clientId;
    card.innerHTML = cardTemplate(item);
    card.querySelector('.start').addEventListener('click', () => uploadSingle(item, card));
    queue.appendChild(card);
  }
  filesInput.value = '';
}

rootInput.addEventListener('change', syncDestinationVisibility);
filesInput.addEventListener('change', async (event) => {
  if (!event.target.files?.length) return;
  await addFiles(event.target.files);
});

syncDestinationVisibility();
loadHealth();
