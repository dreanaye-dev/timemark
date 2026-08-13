'use strict';

/* ================================================================
   TimeMark - PWA kamera dengan watermark waktu & lokasi
   ================================================================ */

/* ---------------- DOM ----------------
   refs are resolved after DOM ready (script at end of body)      */
const $ = (id) => document.getElementById(id);

const video = $('video');
const elClock = $('wm-clock');
const elDate = $('wm-date');
const elCoords = $('wm-coords');
const elAcc = $('wm-acc');
const elLocation = $('wm-location');
const recBadge = $('rec-badge');
const recTimer = $('rec-timer');
const gpsDot = $('gps-dot');
const gpsText = $('gps-text');
const GPS_LIMIT_M = 30; /* ambang akurasi minimum untuk bukti */
const permBanner = $('perm-banner');
const permBtn = $('perm-btn');
const controls = $('controls');
const btnFlash = $('btn-flash');
const btnCapture = $('btn-capture');
const btnRecord = $('btn-record');
const btnGallery = $('btn-gallery');
const btnBackCam = $('btn-back-cam');
const btnSwitch = $('btn-switch');
const btnInstall = $('btn-install');
const cameraView = $('camera-view');
const galleryView = $('gallery-view');
const galleryGrid = $('gallery-grid');
const galleryEmpty = $('gallery-empty');
const galleryError = $('gallery-error');
const modal = $('modal');
const modalBackdrop = $('modal-backdrop');
const modalClose = $('modal-close');
const modalImg = $('modal-img');
const modalVideo = $('modal-video');
const modalMeta = $('modal-meta');
const modalDownload = $('modal-download');
const modalShare = $('modal-share');
const modalDelete = $('modal-delete');
const toast = $('toast');
const galleryToolbar = document.querySelector('.gal-toolbar');
const btnExportAll = $('btn-export-all');
const btnHistory = $('btn-history');
const chkMs = $('chk-ms');
const chkAuto = $('chk-autosave');
const historyView = $('history-view');
const btnBackGal = $('btn-back-gal');
const btnClearLocs = $('btn-clear-locs');
const historyList = $('history-list');
const historyEmpty = $('history-empty');
const btnExportLocsCsv = $('btn-export-locs-csv');
const btnExportLocsJson = $('btn-export-locs-json');
const modalExport = $('modal-export');
const btnSettings = $('btn-settings');
const settingsPanel = $('settings-panel');
const selGeocoder = $('sel-geocoder');
const inpGeoapifyKey = $('inp-geoapify-key');
const btnSaveSettings = $('btn-save-settings');

/* Key Geoapify bawaan (bisa diganti di Pengaturan Galeri) */
const DEFAULT_GEOAPIFY_KEY = '462c1e9d381442eb979437b1aecbef77';

/* ---------------- State ---------------- */
const state = {
  stream: null,
  facing: 'environment',
  flashOn: false,
  recording: false,
  recorder: null,
  burnCanvas: null,
  rafId: 0,
  coords: null,
  address: '',
  addressShort: 'Mencari lokasi...',
  watchId: null,
  recMeta: null,
  recStart: 0,
  recTimerId: null,
  currentModalId: null,
  deferredPrompt: null,
  showMs: false,
  lastLocAt: 0,
  lastLocLat: null,
  lastLocLng: null,
  autoSave: false,
  geocoder: 'geoapify',
  geoapifyKey: DEFAULT_GEOAPIFY_KEY || '',
  lastGeoAt: 0,
  lastGeoLat: null,
  lastGeoLng: null,
  geoInFlight: false,
};

/* ---------------- Pembantu ---------------- */
function shortAddress(full) {
  if (!full) return '';
  const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, 3).join(', ');
}

/* Susun alamat lengkap & rapi dari hasil reverse-geocoding (Nominatim) */
function formatFullAddress(data) {
  const a = data.address || {};
  const parts = [];
  if (a.house_number && !isNaN(+a.house_number)) parts.push(`No. ${a.house_number}`);
  if (a.road) parts.push(a.road);
  if (a.neighbourhood) parts.push(a.neighbourhood);
  else if (a.suburb) parts.push(a.suburb);
  else if (a.quarter) parts.push(a.quarter);
  else if (a.hamlet || a.isolated_dwelling) parts.push(a.hamlet || a.isolated_dwelling);
  else if (a.city_district) parts.push(a.city_district);
  else if (a.district) parts.push(a.district);
  const area = a.city || a.town || a.village || a.municipality;
  if (area) parts.push(area);
  const countyLike = a.county || a.state_district;
  if (countyLike && countyLike !== area) parts.push(countyLike);
  if (a.region && a.region !== countyLike && a.region !== area) parts.push(a.region);
  if (a.state && a.state !== countyLike && a.state !== a.region) parts.push(a.state);
  if (a.postcode) parts.push(a.postcode);
  if (a.country && String(a.country).toLowerCase() !== 'indonesia') parts.push(a.country);
  const seen = new Set();
  return parts.filter((p) => p && !seen.has(p) && seen.add(p)).join(', ');
}

function wmData(coords, address) {
  const now = new Date();
  const c = coords || state.coords;
  return {
    time: now.toLocaleTimeString('id-ID', { hour12: false }),
    timeFull: now.toLocaleTimeString('id-ID', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0'),
    timeDisplay: state.showMs ? (now.toLocaleTimeString('id-ID', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')) : now.toLocaleTimeString('id-ID', { hour12: false }),
    date: now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    coords: c ? `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}` : '--.------, --.------',
    lat: c ? c.latitude : null,
    lng: c ? c.longitude : null,
    accuracy: c ? Math.round(c.accuracy) : null,
    address: address || state.address,
    addressShort: shortAddress(address || state.address),
  };
}

function toastShow(msg, ms = 1800) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.hidden = true; }, ms);
}

/* Status pill GPS: teks akurasi + warna indikator */
function updateGpsPill() {
  const c = state.coords;
  gpsDot.classList.remove('live', 'fair', 'warn', 'error');
  if (!c || c.accuracy == null) {
    gpsText.textContent = 'GPS mencari...';
    gpsDot.classList.add('error');
    return;
  }
  gpsText.textContent = `GPS ±${Math.round(c.accuracy)} m`;
  if (c.accuracy <= 8) {
    gpsDot.classList.add('live');
  } else if (c.accuracy <= GPS_LIMIT_M) {
    gpsDot.classList.add('fair');
  } else {
    gpsDot.classList.add('warn');
  }
}

/* Peringatan bila akurasi GPS masih di bawah standar (penting utk bukti) */
function gpsReadyForCapture() {
  const c = state.coords;
  if (!c || c.accuracy == null) {
    return confirm('Lokasi GPS belum terkunci.\n\nTetap ambil tanpa koordinat?');
  }
  if (c.accuracy > GPS_LIMIT_M) {
    return confirm(`Akurasi GPS masih rendah (±${Math.round(c.accuracy)} m).\n\nTetap ambil bukti?`);
  }
  return true;
}

/* ---------------- Overlay waktu ---------------- */
function updateOverlay() {
  const d = wmData();
  const clockText = d.timeDisplay;
  if (elClock.textContent !== clockText) elClock.textContent = clockText;
  const dateText = d.date;
  if (elDate.textContent !== dateText) elDate.textContent = dateText;
  const coordsText = d.coords;
  if (elCoords.textContent !== coordsText) elCoords.textContent = coordsText;
  const locText = d.address || 'Lokasi belum ditemukan';
  if (elLocation.textContent !== locText) elLocation.textContent = locText;
  if (elAcc) {
    if (state.coords && state.coords.accuracy != null) {
      elAcc.textContent = `(±${Math.round(state.coords.accuracy)} m)`;
      elAcc.hidden = false;
    } else {
      elAcc.hidden = true;
    }
  }
}
setInterval(updateOverlay, 50);
updateOverlay();

/* ---------------- Geolokasi ---------------- */
function startGeo() {
  if (!navigator.geolocation) {
    gpsDot.classList.add('error');
    elCoords.textContent = 'GPS tidak didukung';
    return;
  }
  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      state.coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      updateGpsPill();
      recordLocation(state.coords);
      reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      updateOverlay();
    },
    (err) => {
      state.coords = null;
      updateGpsPill();
      if (err.code === err.PERMISSION_DENIED) {
        elLocation.textContent = 'Izin lokasi ditolak';
        elCoords.textContent = 'GPS nonaktif';
      } else {
        elLocation.textContent = 'Mencari sinyal GPS...';
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 25000 }
  );
}

async function reverseGeocode(lat, lng, force = false) {
  /* Batasi frekuensi agar kuota harian (Geoapify 3000/hari) tidak cepat habis:
     ulangi hanya bila >30 dtk atau bergeser >100 m, kecuali force (saat potret). */
  if (state.geoInFlight) return;
  const now = Date.now();
  const moved = state.lastGeoLat != null
    ? haversine(state.lastGeoLat, state.lastGeoLng, lat, lng)
    : Infinity;
  if (!force && now - state.lastGeoAt < 30000 && moved < 100) return;
  state.lastGeoAt = now;
  state.lastGeoLat = lat;
  state.lastGeoLng = lng;
  state.geoInFlight = true;

  const provider = state.geocoder;
  try {
    if (provider === 'geoapify' && state.geoapifyKey) {
      const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&lang=id&apiKey=${encodeURIComponent(state.geoapifyKey)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('geoapify fail');
      const data = await res.json();
      const f = data && data.features && data.features[0];
      if (f && f.properties) {
        const addr = geoapifyToAddress(f.properties);
        const built = formatFullAddress({ address: addr });
        if (built) state.address = built;
        const short = shortAddress(f.properties.formatted || state.address);
        if (short) state.addressShort = short;
        updateOverlay();
        return;
      }
      throw new Error('geoapify empty');
    }
    /* fallback: Nominatim (OSM) */
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=id&zoom=18`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'id' } });
    if (!res.ok) throw new Error('geo fail');
    const data = await res.json();
    if (data && data.display_name) {
      state.address = formatFullAddress(data);
      const short = shortAddress(state.address);
      if (short) state.addressShort = short;
      updateOverlay();
    }
  } catch (e) {
    /* biarkan alamat tetap kosong */
  } finally {
    state.geoInFlight = false;
  }
}

/* Terjemahkan properti Geoapify ke bentuk alamat terstruktur */
function geoapifyToAddress(p) {
  const a = {};
  if (p.house_number) a.house_number = String(p.house_number);
  if (p.street) a.road = p.street;
  if (p.suburb) a.suburb = p.suburb;
  if (p.neighbourhood) a.neighbourhood = p.neighbourhood;
  if (p.quarter) a.quarter = p.quarter;
  if (p.district) a.district = p.district;
  const area = p.city || p.town || p.village || p.municipality;
  if (area) {
    if (p.city) a.city = p.city;
    else if (p.town) a.town = p.town;
    else if (p.village) a.village = p.village;
    else a.municipality = p.municipality;
  }
  if (p.county) a.county = p.county;
  if (p.region && p.region !== p.state) a.region = p.region;
  if (p.state) a.state = p.state;
  if (p.postcode) a.postcode = p.postcode;
  if (p.country) a.country = p.country;
  return a;
}

/* Riwayat lokasi: simpan titik GPS baru bila bergeser jauh / jeda waktu cukup */
async function recordLocation(c) {
  const now = Date.now();
  const intervalOk = now - state.lastLocAt >= 20000;
  let distOk = true;
  if (state.lastLocLat != null) {
    distOk = haversine(state.lastLocLat, state.lastLocLng, c.latitude, c.longitude) >= 25;
  }
  if (!intervalOk && !distOk) return;
  if (!distOk && intervalOk && state.lastLocLat != null) {
    distOk = true;
  }
  try {
    await idbLocAdd({
      id: `loc-${now}-${Math.random().toString(36).slice(2, 7)}`,
      lat: c.latitude,
      lng: c.longitude,
      accuracy: c.accuracy,
      address: state.address || null,
      addressShort: state.addressShort || null,
      createdAt: now,
    });
  } catch (e) { /* abaikan kegagalan penyimpanan */ }
  state.lastLocAt = now;
  state.lastLocLat = c.latitude;
  state.lastLocLng = c.longitude;
}

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------------- Kamera ---------------- */
function stopStream() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
}

async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showPermMessage(
      'Browser Anda tidak mendukung akses kamera.<br><b>Gunakan Chrome/Edge terbaru</b> dan pastikan alamat dimulai dengan <b>https://</b>.',
      false
    );
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
  } catch (err) {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: state.facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (err2) {
      showCameraError(err2);
      return;
    }
  }
  video.srcObject = state.stream;
  state.burnCanvas = document.createElement('canvas');
  permBanner.hidden = true;
  await video.play().catch(() => {});
  checkFlashSupport();
  startGeo();
}

function showPermMessage(html, showBtn) {
  permBanner.querySelector('p').innerHTML = html;
  permBtn.hidden = !showBtn;
  permBanner.hidden = false;
}

function showCameraError(err) {
  const name = (err && err.name) || '';
  let msg = 'Gagal mengakses kamera. Coba klik tombol lagi.<br>Jika tetap tidak muncul, buka <b>https://</b> (bukan http).';
  let showBtn = true;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    msg = 'Izin kamera <b>ditolak / belum aktif</b>.<br><br>Perbaiki: buka <b>ikon kunci/&#9432; di address bar</b> browser &rarr; <b>Site settings</b> &rarr; izinkan <b>Kamera</b> & <b>Mikrofon/Lokasi</b> &rarr; refresh halaman.';
  } else if (name === 'NotFoundError') {
    msg = '<b>Tidak ada kamera terdeteksi.</b><br>Di HP periksa izin dan pastikan kamera tidak dipakai aplikasi lain; di PC pastikan webcam menyala.';
    showBtn = false;
  } else if (name === 'NotReadableError') {
    msg = '<b>Kamera sedang dipakai aplikasi lain</b> (mis. panggilan video). Tutup aplikasi itu lalu coba lagi.';
  } else if (name === 'SecurityError') {
    msg = 'Browser memblokir kamera.<br>Pastikan alamat dimulai <b>https://</b> dan coba lagi.';
    showBtn = false;
  }
  showPermMessage(msg, showBtn);
}

async function switchCamera() {
  if (state.recording) return;
  stopStream();
  state.facing = state.facing === 'environment' ? 'user' : 'environment';
  await initCamera();
}

async function toggleFlash() {
  if (!state.stream) return;
  const track = state.stream.getVideoTracks()[0];
  if (!track) return;
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if (!caps.torch) {
    toastShow('Kamera tidak mendukung lampu');
    return;
  }
  state.flashOn = !state.flashOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: state.flashOn }] });
  } catch (e) {
    state.flashOn = !state.flashOn;
    toastShow('Gagal mengubah lampu');
    return;
  }
  btnFlash.classList.toggle('flash-on', state.flashOn);
}

function checkFlashSupport() {
  if (!state.stream) return;
  const track = state.stream.getVideoTracks()[0];
  const caps = track && track.getCapabilities ? track.getCapabilities() : {};
  btnFlash.disabled = !(caps && caps.torch);
  if (btnFlash.disabled) btnFlash.classList.remove('flash-on');
}

/* ---------------- Watermark (canvas draw) ---------------- */
function drawWatermark(ctx, w, h, d) {
  const pad = Math.round(w * 0.02);
  const brandSize = Math.max(10, Math.round(w * 0.028));
  const timeSize = Math.round(h * 0.085);
  const subSize = Math.max(11, Math.round(w * 0.02));

  ctx.save();

  const locText = 'Lokasi: ' + (d.address || d.addressShort || 'Lokasi tidak ditemukan');
  const lines = wrapText(locText, ctx, subSize, w - pad * 2);
  const lineStep = subSize * 1.45;

  /* blok info bawah */
  const blockH = pad + timeSize + subSize * 2.0 + lines.length * lineStep + pad * 1.5;
  const y0 = h - blockH;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, y0, w, blockH);

  ctx.textBaseline = 'top';

  /* jam besar */
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${timeSize}px "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(d.timeDisplay || d.time, pad, y0 + pad);

  /* tanggal */
  ctx.font = `600 ${subSize}px "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#f0f4f8';
  ctx.fillText(d.date, pad, y0 + pad + timeSize + subSize * 0.3);

  /* koordinat GPS */
  ctx.fillStyle = '#cfe8ff';
  const acc = d.accuracy ? `   (±${d.accuracy} m)` : '';
  ctx.fillText('GPS: ' + d.coords + acc, pad, y0 + pad + timeSize + subSize * 1.6);

  /* alamat (bisa multi-baris) */
  ctx.font = `500 ${subSize}px "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#eef4f9';
  let locY = y0 + pad + timeSize + subSize * 2.8;
  for (const line of lines) {
    ctx.fillText(line, pad, locY);
    locY += lineStep;
  }

  /* label merek kiri atas */
  ctx.font = `italic 600 ${brandSize}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText('Daniel Alexander', pad, pad);

  /* garis aksen */
  ctx.fillStyle = '#ff5a3c';
  ctx.fillRect(pad, pad + brandSize + 4, brandSize * 1.6, Math.max(2, brandSize * 0.12));

  ctx.restore();
}

/* sederhana: hitung jumlah baris potensial dari lebar teks */
function wrapText(text, ctx, fontSize, maxWidth) {
  if (!text) return [];
  ctx.font = `500 ${fontSize}px "Segoe UI", Roboto, sans-serif`;
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* aksen bingkai kamera (sudut + garis tepi tipis) — digambar sekali */
function drawFrameAccents(ctx, w, h) {
  ctx.save();
  const m = Math.max(3, Math.round(w * 0.008));
  const s = Math.max(8, Math.round(w * 0.022));
  const lw = Math.max(2, Math.round(w * 0.002));

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = lw;
  const corners = [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * s, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * s);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = Math.max(1, lw - 1);
  ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  ctx.restore();
}

/* ---------------- IndexedDB ---------------- */
let dbPromise = null;

function idbOpen() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('timemark', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('media')) {
        const store = db.createObjectStore('media', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('locs')) {
        const locs = db.createObjectStore('locs', { keyPath: 'id' });
        locs.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

async function idbSet(rec) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbAll() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readonly');
    const req = tx.objectStore('media').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbLocAdd(rec) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('locs', 'readwrite');
    tx.objectStore('locs').put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbLocsAll() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('locs', 'readonly');
    const req = tx.objectStore('locs').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbLocsClear() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('locs', 'readwrite');
    tx.objectStore('locs').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveMedia({ type, blob, meta }) {
  const rec = {
    id: `tm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    blob,
    createdAt: Date.now(),
    meta,
  };
  await idbSet(rec);
  await renderGallery();
  return rec;
}

/* ---------------- Foto ---------------- */
function flashEffect() {
  let el = $('flashfx');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flashfx';
    cameraView.appendChild(el);
  }
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
}

async function capturePhoto() {
  if (state.recording) return;
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      toastShow('Kamera belum siap, tunggu sebentar');
      return;
    }
    if (!gpsReadyForCapture()) return;
    if (state.coords) reverseGeocode(state.coords.latitude, state.coords.longitude, true);
    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, vw, vh);

    const d = wmData();
    drawWatermark(ctx, vw, vh, d);

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    flashEffect();
    if (!blob) {
      toastShow('Gagal menyimpan foto');
      return;
    }
    const rec = await saveMedia({ type: 'photo', blob, meta: d });
    toastShow('Foto tersimpan');
    if (state.autoSave) {
      downloadMedia(blob, mediaFilename('photo', rec.createdAt));
      toastShow('Foto tersimpan & diunduh');
    }
  } catch (err) {
    console.error('capturePhoto error:', err);
    toastShow('Gagal mengambil foto (' + (err && err.name ? err.name : 'error') + ')');
  }
}

/* ---------------- Video dengan watermark ---------------- */
function pickMime() {
  const types = [
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const t of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

async function startRecord() {
  if (!state.stream || state.recording) return;
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      toastShow('Kamera belum siap, tunggu sebentar');
      return;
    }
    if (!gpsReadyForCapture()) return;
    if (state.coords) reverseGeocode(state.coords.latitude, state.coords.longitude, true);
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      toastShow('Browser ini tidak mendukung perekaman watermark');
      return;
    }

    /* Resolusi rekaman: naik ke maks 1080p karena watermark statis (ringan) */
    const MAX_W = 1920;
    const MAX_H = 1080;
    let recW = vw;
    let recH = vh;
    if (recW > MAX_W || recH > MAX_H) {
      const scale = Math.min(MAX_W / recW, MAX_H / recH);
      recW = Math.round(recW * scale);
      recH = Math.round(recH * scale);
    }
    if ((recW % 2) !== 0) recW -= 1;
    if ((recH % 2) !== 0) recH -= 1;

    const canvas = state.burnCanvas;
    canvas.width = recW;
    canvas.height = recH;
    const ctx = canvas.getContext('2d');

    /* Bingkai watermark STATIS: digambar SEKALI saat mulai merekam.
       Data diambil sekali (waktu mulai, tanggal, koordinat, alamat),
       sehingga tidak pernah di-render ulang tiap frame. */
    const wmLayer = document.createElement('canvas');
    wmLayer.width = recW;
    wmLayer.height = recH;
    const wmCtx = wmLayer.getContext('2d');
    const staticData = wmData();
    drawWatermark(wmCtx, recW, recH, staticData);
    drawFrameAccents(wmCtx, recW, recH);

    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, recW, recH);
      ctx.drawImage(wmLayer, 0, 0, recW, recH);
      state.rafId = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const fps = 24;
    const outStream = canvas.captureStream(fps);
    const audioTracks = state.stream.getAudioTracks();
    if (audioTracks.length) outStream.addTrack(audioTracks[0]);

    const mime = pickMime();
    const opts = {};
    if (mime) opts.mimeType = mime;
    if (mime && mime.includes('video/webm')) {
      opts.videoBitsPerSecond = 6000000;
    }

    try {
      state.recorder = new MediaRecorder(outStream, opts);
    } catch (e) {
      cancelAnimationFrame(state.rafId);
      toastShow('Perekaman tidak didukung browser ini');
      return;
    }

    const chunks = [];
    state.recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    state.recorder.onstop = async () => {
      cancelAnimationFrame(state.rafId);
      const type = (mime ? mime.split(';')[0] : 'video/webm');
      const blob = new Blob(chunks, { type });
      state.recording = false;
      recBadge.hidden = true;
      btnRecord.classList.remove('recording');
      btnCapture.disabled = false;
      stopRecTimer();
      if (blob.size > 0) {
        const rec = await saveMedia({ type: 'video', blob, meta: state.recMeta });
        toastShow('Video tersimpan');
        if (state.autoSave) {
          downloadMedia(blob, mediaFilename('video', rec.createdAt, mime));
          toastShow('Video tersimpan & diunduh');
        }
      } else {
        toastShow('Rekaman gagal');
      }
    };
state.recorder.onerror = () => {
    cancelAnimationFrame(state.rafId);
    state.recording = false;
    recBadge.hidden = true;
    btnRecord.classList.remove('recording');
    btnCapture.disabled = false;
    stopRecTimer();
    toastShow('Terjadi kesalahan saat merekam');
  };

  state.recMeta = wmData();
  state.recorder.start(250);
  state.recording = true;
  recBadge.hidden = false;
  btnRecord.classList.add('recording');
  btnCapture.disabled = true;
  startRecTimer();
  } catch (err) {
    cancelAnimationFrame(state.rafId);
    console.error('startRecord error:', err);
    toastShow('Gagal merekam (' + (err && err.name ? err.name : 'error') + ')');
  }
}

function stopRecord() {
  if (!state.recording || !state.recorder) return;
  try {
    state.recorder.stop();
  } catch (e) {
    /* abaikan */
  }
}

function startRecTimer() {
  stopRecTimer();
  state.recStart = Date.now();
  state.recTimerId = setInterval(() => {
    const s = Math.max(0, Math.floor((Date.now() - state.recStart) / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    if (recTimer.textContent !== `${mm}:${ss}`) recTimer.textContent = `${mm}:${ss}`;
  }, 500);
}

function stopRecTimer() {
  if (state.recTimerId != null) {
    clearInterval(state.recTimerId);
    state.recTimerId = null;
  }
  if (recTimer) recTimer.textContent = '00:00';
}

async function toggleRecord() {
  if (state.recording) stopRecord();
  else await startRecord();
}

/* ---------------- Galeri ---------------- */
const _urls = new Map(); // id -> objectURL

async function renderGallery() {
  let items;
  try {
    items = await idbAll();
  } catch (e) {
    galleryError.hidden = false;
    return;
  }
  galleryError.hidden = true;
  items.sort((a, b) => b.createdAt - a.createdAt);
  galleryEmpty.hidden = items.length > 0;
  galleryGrid.innerHTML = '';

  for (const item of items) {
    const tile = document.createElement('button');
    tile.className = 'tile';

    const url = (_urls.get(item.id) || URL.createObjectURL(item.blob));
    _urls.set(item.id, url);

    if (item.type === 'photo') {
      const img = document.createElement('img');
      img.src = url;
      img.loading = 'lazy';
      tile.appendChild(img);
    } else {
      const vid = document.createElement('video');
      vid.src = url;
      vid.preload = 'metadata';
      vid.muted = true;
      tile.appendChild(vid);
      const badge = document.createElement('span');
      badge.className = 'tile-badge';
      badge.textContent = 'VIDEO';
      tile.appendChild(badge);
    }

    const info = document.createElement('div');
    info.className = 'tile-info';
    const t = document.createElement('div');
    t.className = 't-time';
    t.textContent = new Date(item.createdAt).toLocaleString('id-ID', { hour12: false });
    info.appendChild(t);
    const loc = document.createElement('div');
    loc.className = 't-loc';
    loc.innerHTML = '<svg viewBox="0 0 24 24" class="ic16"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
    const locSpan = document.createElement('span');
    locSpan.textContent = (item.meta && (item.meta.addressShort || item.meta.coords)) || 'Tanpa lokasi';
    loc.appendChild(locSpan);
    info.appendChild(loc);
    tile.appendChild(info);

    tile.addEventListener('click', () => openModal(item));
    galleryGrid.appendChild(tile);
  }
}

/* ---------------- Modal detail ---------------- */
function openModal(item) {
  state.currentModalId = item.id;
  modalImg.hidden = true;
  modalVideo.hidden = true;

  if (item.type === 'photo') {
    const url = _urls.get(item.id) || URL.createObjectURL(item.blob);
    _urls.set(item.id, url);
    modalImg.src = url;
    modalImg.hidden = false;
  } else {
    const url = _urls.get(item.id) || URL.createObjectURL(item.blob);
    _urls.set(item.id, url);
    modalVideo.src = url;
    modalVideo.hidden = false;
    modalVideo.load();
  }

  const m = item.meta || {};
  const metaLines = [];
  metaLines.push(`<div><span>Waktu:</span> ${m.time || '-'}</div>`);
  metaLines.push(`<div><span>Tanggal:</span> ${m.date || '-'}</div>`);
  metaLines.push(`<div><span>Koordinat:</span> ${m.coords || '-'}</div>`);
  const acc = m.accuracy ? ` (±${m.accuracy} m)` : '';
  if (acc) metaLines.push(`<div><span>Akurasi:</span>${acc}</div>`);
  metaLines.push(`<div><span>Jenis:</span> ${item.type === 'photo' ? 'Foto' : 'Video'}</div>`);
  const locHtml = (m.address || m.addressShort)
    ? `<div class="m-loc"><svg viewBox="0 0 24 24" class="ic16"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg><span>${m.address || m.addressShort}</span></div>`
    : '<div><span>Lokasi:</span> Tidak tersedia</div>';
  metaLines.push(locHtml);
  modalMeta.innerHTML = metaLines.join('');

  window._currentModalItem = item;
  modal.hidden = false;
  pushModalHistory();
}

function pushModalHistory() {
  if (state.modalHistory) return;
  try {
    history.pushState({ tm: 1 }, '');
    state.modalHistory = true;
  } catch (e) { /* abaikan */ }
}

function hideModal() {
  modal.hidden = true;
  if (modalVideo.hidden === false) {
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.load();
  }
  state.currentModalId = null;
}

function closeModal() {
  if (state.modalHistory) {
    state.modalHistory = false;
    try { history.back(); } catch (e) { /* abaikan */ }
  }
  hideModal();
}

window.addEventListener('popstate', () => {
  if (!modal.hidden) {
    state.modalHistory = false;
    hideModal();
  }
});

function filenameFor(item) {
  const ext = item.type === 'photo' ? 'jpg' : (item.meta && item.meta.time ? 'mp4' : 'webm');
  return `timemark-${item.createdAt}.${ext}`;
}

async function downloadCurrent() {
  const item = window._currentModalItem;
  if (!item) return;
  const url = _urls.get(item.id) || URL.createObjectURL(item.blob);
  _urls.set(item.id, url);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFor(item);
  document.body.appendChild(a);
  a.click();
  a.remove();
  toastShow('Mengunduh...');
}

async function shareCurrent() {
  const item = window._currentModalItem;
  if (!item) return;
  const url = _urls.get(item.id) || URL.createObjectURL(item.blob);
  _urls.set(item.id, url);
  if (!(navigator.share && navigator.canShare)) {
    downloadCurrent();
    return;
  }
  const shareData = {
    files: [new File([item.blob], filenameFor(item), { type: item.blob.type })],
    title: 'TimeMark',
  };
  if (navigator.canShare(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  downloadCurrent();
}

async function deleteCurrent() {
  const item = window._currentModalItem;
  if (!item) return;
  try {
    await idbDel(item.id);
  } catch (e) {
    toastShow('Gagal menghapus');
    return;
  }
  const url = _urls.get(item.id);
  if (url) { URL.revokeObjectURL(url); _urls.delete(item.id); }
  closeModal();
  await renderGallery();
  toastShow('Dihapus');
}

/* ---------------- Navigasi view ---------------- */
function showCamera() {
  galleryView.hidden = true;
  cameraView.hidden = false;
}
function showGallery() {
  cameraView.hidden = true;
  galleryView.hidden = false;
  renderGallery();
}

/* ---------------- Ekspor metadata ---------------- */
function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: type || 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* Unduh file media ke penyimpanan HP/galeri HP */
function downloadMedia(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function mediaFilename(type, createdAt, mime) {
  const ext = type === 'photo'
    ? 'jpg'
    : (mime && String(mime).toLowerCase().includes('mp4') ? 'mp4' : 'webm');
  return `timemark-${createdAt}.${ext}`;
}

function metaToJson(item) {
  const m = item.meta || {};
  return {
    id: item.id,
    type: item.type,
    createdAtISO: new Date(item.createdAt).toISOString(),
    waktu: m.time || null,
    tanggal: m.date || null,
    koordinat: m.coords || null,
    latitude: m.lat != null ? m.lat : null,
    longitude: m.lng != null ? m.lng : null,
    akurasiMeter: m.accuracy != null ? m.accuracy : null,
    alamat: m.address || null,
    alamatSingkat: m.addressShort || null,
  };
}

async function exportAllMeta() {
  let items;
  try {
    items = await idbAll();
  } catch (e) {
    toastShow('Gagal membaca data');
    return;
  }
  if (!items.length) {
    toastShow('Belum ada hasil untuk diekspor');
    return;
  }
  const data = items
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(metaToJson);
  downloadBlob(
    JSON.stringify(data, null, 2),
    `timemark-metadata-${new Date().toISOString().slice(0, 10)}.json`,
    'application/json;charset=utf-8'
  );
  toastShow(`${data.length} metadata diekspor`);
}

function exportItemMeta() {
  const item = window._currentModalItem;
  if (!item) return;
  downloadBlob(
    JSON.stringify(metaToJson(item), null, 2),
    `timemark-meta-${item.id}.json`,
    'application/json;charset=utf-8'
  );
  toastShow('Metadata diekspor');
}

async function exportLocs(format) {
  let locs;
  try {
    locs = await idbLocsAll();
  } catch (e) {
    toastShow('Gagal membaca riwayat');
    return;
  }
  locs.sort((a, b) => a.createdAt - b.createdAt);
  if (!locs.length) {
    toastShow('Belum ada riwayat lokasi');
    return;
  }
  if (format === 'csv') {
    const header = 'No,Waktu,Timestamp,Latitude,Longitude,Akurasi(m),Alamat';
    const rows = locs.map((l, i) =>
      `${i + 1},"${new Date(l.createdAt).toLocaleString('id-ID', { hour12: false })}",${l.createdAt},"${l.lat}","${l.lng}",${l.accuracy != null ? l.accuracy : ''},"${(l.address || l.addressShort || '').replace(/"/g, '""')}"`
    );
    downloadBlob(
      '\uFEFF' + [header, ...rows].join('\n'),
      `timemark-lokasi-${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8'
    );
  } else {
    const data = locs.map((l) => ({
      waktu: new Date(l.createdAt).toLocaleString('id-ID', { hour12: false }),
      timestamp: l.createdAt,
      latitude: l.lat,
      longitude: l.lng,
      akurasiMeter: l.accuracy,
      alamat: l.address || l.addressShort || null,
    }));
    downloadBlob(
      JSON.stringify(data, null, 2),
      `timemark-lokasi-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8'
    );
  }
}

/* ---------------- Riwayat lokasi ---------------- */
async function renderHistory() {
  let locs;
  try {
    locs = await idbLocsAll();
  } catch (e) {
    historyEmpty.hidden = false;
    historyEmpty.textContent = 'Gagal memuat riwayat.';
    return;
  }
  locs.sort((a, b) => b.createdAt - a.createdAt);
  historyEmpty.hidden = locs.length > 0;
  historyEmpty.textContent = 'Belum ada riwayat lokasi. Buka kamera dan biarkan GPS aktif.';
  historyList.innerHTML = '';

  for (const l of locs) {
    const div = document.createElement('div');
    div.className = 'h-item';

    const t = document.createElement('div');
    t.className = 'h-time';
    t.textContent = new Date(l.createdAt).toLocaleString('id-ID', { hour12: false });
    div.appendChild(t);

    const c = document.createElement('div');
    c.className = 'h-coords';
    c.textContent = `${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}` + (l.accuracy != null ? `  (±${Math.round(l.accuracy)} m)` : '');
    div.appendChild(c);

    const loc = document.createElement('div');
    loc.className = 'h-loc';
    loc.innerHTML = '<svg viewBox="0 0 24 24" class="ic16"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
    const span = document.createElement('span');
    span.textContent = l.address || l.addressShort || 'Alamat tidak tersedia';
    loc.appendChild(span);
    div.appendChild(loc);

    historyList.appendChild(div);
  }
}

async function showHistory() {
  cameraView.hidden = true;
  galleryView.hidden = true;
  historyView.hidden = false;
  await renderHistory();
}

function showGalleryFromHistory() {
  historyView.hidden = true;
  galleryView.hidden = false;
  renderGallery();
}

async function clearHistory() {
  if (!confirm('Hapus semua riwayat lokasi?')) return;
  try {
    await idbLocsClear();
  } catch (e) {
    toastShow('Gagal menghapus');
    return;
  }
  await renderHistory();
  toastShow('Riwayat dihapus');
}

/* ---------------- PWA ---------------- */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    btnInstall.hidden = false;
  });
  btnInstall.addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    try {
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
    } catch (e) { /* abut */ }
    state.deferredPrompt = null;
    btnInstall.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    toastShow('Aplikasi TimeMark terinstal');
    btnInstall.hidden = true;
  });
}

/* ---------------- Event listeners ---------------- */
btnCapture.addEventListener('click', capturePhoto);
btnRecord.addEventListener('click', toggleRecord);
btnFlash.addEventListener('click', toggleFlash);
btnSwitch.addEventListener('click', switchCamera);
btnGallery.addEventListener('click', showGallery);
btnBackCam.addEventListener('click', showCamera);
permBtn.addEventListener('click', async () => {
  permBanner.hidden = true;
  await initCamera();
});
modalBackdrop.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalDownload.addEventListener('click', downloadCurrent);
modalShare.addEventListener('click', shareCurrent);
modalDelete.addEventListener('click', deleteCurrent);
modalExport.addEventListener('click', exportItemMeta);

btnExportAll.addEventListener('click', exportAllMeta);
btnHistory.addEventListener('click', showHistory);
btnBackGal.addEventListener('click', showGalleryFromHistory);
btnClearLocs.addEventListener('click', clearHistory);
btnExportLocsCsv.addEventListener('click', () => exportLocs('csv'));
btnExportLocsJson.addEventListener('click', () => exportLocs('json'));

chkMs.addEventListener('change', () => {
  state.showMs = chkMs.checked;
  localStorage.setItem('tm_showMs', state.showMs ? '1' : '0');
  updateOverlay();
  toastShow(state.showMs ? 'Milidetik aktif' : 'Milidetik nonaktif');
});

chkAuto.addEventListener('change', () => {
  state.autoSave = chkAuto.checked;
  localStorage.setItem('tm_autoSave', state.autoSave ? '1' : '0');
  toastShow(state.autoSave ? 'Auto-Simpan ke HP aktif' : 'Auto-Simpan ke HP nonaktif');
});

btnSettings.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

btnSaveSettings.addEventListener('click', () => {
  state.geocoder = selGeocoder.value;
  state.geoapifyKey = inpGeoapifyKey.value.trim();
  localStorage.setItem('tm_geocoder', state.geocoder);
  localStorage.setItem('tm_geoapify_key', state.geoapifyKey);
  settingsPanel.hidden = true;
  toastShow(state.geocoder === 'geoapify'
    ? (state.geoapifyKey ? 'Geocoder: Geoapify aktif' : 'Key kosong, tetap pakai OSM')
    : 'Geocoder: OpenStreetMap');
  if (state.coords) reverseGeocode(state.coords.latitude, state.coords.longitude, true);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

window.addEventListener('pagehide', () => {
  if (state.recording && state.recorder && state.recorder.state !== 'inactive') {
    try { state.recorder.stop(); } catch (e) { /* ignore */ }
  }
  stopRecTimer();
  stopStream();
  if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
});

/* ---------------- Init ---------------- */
(async function init() {
  setupInstall();
  registerSW();
  updateGpsPill();
  state.showMs = localStorage.getItem('tm_showMs') === '1';
  chkMs.checked = state.showMs;
  state.autoSave = localStorage.getItem('tm_autoSave') === '1';
  chkAuto.checked = state.autoSave;
  state.geocoder = localStorage.getItem('tm_geocoder') || (DEFAULT_GEOAPIFY_KEY ? 'geoapify' : 'osm');
  state.geocoder = state.geocoder === 'geoapify' ? 'geoapify' : 'osm';
  state.geoapifyKey = localStorage.getItem('tm_geoapify_key') || DEFAULT_GEOAPIFY_KEY || '';
  selGeocoder.value = state.geocoder;
  inpGeoapifyKey.value = state.geoapifyKey;
  try {
    await renderGallery();
  } catch (e) {
    galleryError.hidden = false;
  }
  await initCamera();
})();