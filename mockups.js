'use strict';
// Mockups 3D de VALYRA.
// La camisa se dibuja con Three.js (se carga solo al abrir Mockups). Cada zona (pecho, espalda y las dos
// mangas) tiene su propio lienzo: las imagenes se pintan ahi y se ven pegadas a la tela al girar.
// Este archivo se carga ANTES que app.js; solo usa cosas de app.js (colores, tallas, esc, store...) cuando
// alguien lo llama, nunca al cargar.

// Colores aproximados, en el mismo orden que la lista "colores".
const mkHex = ['#ffffff', '#ebe8e0', '#b9bcc2', '#4a4d52', '#5b6068', '#16181c', '#1f5560', '#1b2a4a', '#1f4fb5', '#7fb8e8',
  '#1fb5c0', '#67d6c8', '#a8e6c9', '#4ca96b', '#cfe04a', '#1f8a3a', '#55603a', '#b5a37a', '#8a5a3a', '#f7d83a',
  '#f08a24', '#c8202b', '#9b1c3a', '#e0306e', '#7a3c8c', '#f59a8b', '#f4a6c0', '#6b3fa0', '#ff6a13', '#ff3d9a', '#5cff3a'];
// Ancho de pecho aproximado (cm), en el mismo orden que la lista "tallas".
const mkPecho = [46, 49, 52, 55, 58, 61, 64, 67, 44, 47, 50, 49, 52, 55, 36, 39, 42, 45, 26, 31, 54];
const MK_REGIONS = { front: 'Pecho', back: 'Espalda', sleeveL: 'Brazo izquierdo', sleeveR: 'Brazo derecho' };
const MK_YAW = { front: 0, back: Math.PI, sleeveL: -Math.PI / 2, sleeveR: Math.PI / 2 };
const MK_THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const MK_NECK_V = 0.5;        // cm: linea del cuello (referencia para "distancia al cuello")
const MK_MAXPX = 1400;        // lado maximo (px) con el que se guardan las imagenes
const MK_UNDO_MAX = 60;

// color, talla, custom: color de la camisa.
// decals: imagenes colocadas {id, n, img, orig, src, region, u, v (cm, v desde arriba), wcm, rot, locked, flipX, flipY, bg}
//   img = lo que se pinta (la original o la version sin fondo), orig = original, src = original en data URL (para guardar)
//   bg = null | { tol, inner } (quitar fondo)
const mkState = {
  color: 5, talla: 2, tipo: 'Playera Cuello Redondo Manga Corta', custom: null, pick: false, decals: [], sel: null, nextId: 1, yaw: 0, pitch: 0.05, zoom: 1, loading: null,
  guides: true, undo: [], redo: [], lastTag: null, lastTagAt: 0, dirty: false, curId: null, booted: null, meta: { nombre: '', cliente: '', cotId: '' }
};
let mk = null;      // escena 3D (se crea al abrir Mockups)
let mkDrag = null;
let mkDraftTimer = 0;
let mkBgTimer = 0;

function mkFill() { return mkState.custom || mkHex[mkState.color]; }
function mkClamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function mkSelDecal() { return mkState.decals.find(d => d.id === mkState.sel) || null; }
function mkIsSleeve(name) { return name === 'sleeveL' || name === 'sleeveR'; }
function mkDecalH(d) { return d.wcm * d.img.height / d.img.width; }
// Alto que ocupa la imagen ya girada (cm)
function mkEffH(d) {
  const r = d.rot * Math.PI / 180;
  return Math.abs(d.wcm * Math.sin(r)) + Math.abs(mkDecalH(d) * Math.cos(r));
}
function mkR1(v) { return Math.round(v * 10) / 10; }

function mkShade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(mkClamp(f < 0 ? v * (1 + f) : v + (255 - v) * f, 0, 255)));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

function mkChipStyle(active) {
  return 'padding:7px 11px;border-radius:10px;font-size:12px;font-weight:800;color:inherit;border:2px solid ' +
    (active ? '#6d5dfc' : 'var(--border)') + ';background:' + (active ? 'rgba(109,93,252,.16)' : 'transparent');
}

function mkToast(msg) {
  try { if (typeof showToast === 'function') { showToast(msg); setTimeout(() => { if (typeof hideToast === 'function') hideToast(); }, 1600); return; } } catch (e) {}
  alert(msg);
}

// ---------- Carga de Three.js: copia local (vendor/) y, si no esta, el CDN ----------
function mkLoadThree() {
  if (window.THREE) return Promise.resolve();
  if (mkState.loading) return mkState.loading;
  const load = src => new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => { s.remove(); no(new Error(src)); };
    document.head.appendChild(s);
  });
  mkState.loading = load('vendor/three.min.js')
    .catch(() => load(MK_THREE_CDN))
    .then(() => { if (!window.THREE) throw new Error('THREE'); })
    .catch(err => { mkState.loading = null; throw err; });
  return mkState.loading;
}

// ---------- Deshacer / rehacer ----------
function mkSnap() {
  const dims = {};
  if (mk) Object.keys(mk.regions).forEach(n => { dims[n] = { w: mk.regions[n].wCm, h: mk.regions[n].hCm }; });
  return { decals: mkState.decals.map(d => Object.assign({}, d)), sel: mkState.sel, color: mkState.color, custom: mkState.custom, dims };
}

// Llamar ANTES de cambiar algo. Con la misma etiqueta y en menos de ~1 s se junta con el paso anterior
// (para que mover un deslizador sea un solo "deshacer").
function mkCommit(tag) {
  const now = Date.now();
  if (tag && mkState.lastTag === tag && now - mkState.lastTagAt < 900) { mkState.lastTagAt = now; return; }
  mkState.lastTag = tag || null;
  mkState.lastTagAt = now;
  mkState.undo.push(mkSnap());
  if (mkState.undo.length > MK_UNDO_MAX) mkState.undo.shift();
  mkState.redo = [];
  mkSyncHistBtns();
}

function mkRestore(s) {
  mkState.decals = s.decals.map(d => Object.assign({}, d));
  mkState.sel = mkState.decals.some(d => d.id === s.sel) ? s.sel : null;
  mkState.color = s.color;
  mkState.custom = s.custom;
  mkState.pick = false;
  // Si cambio la talla desde que se tomo la foto, se reacomodan las posiciones
  mkState.decals.forEach(d => {
    const o = s.dims[d.region], n = mk && mk.regions[d.region];
    if (o && n && (o.w !== n.wCm || o.h !== n.hCm)) { d.u *= n.wCm / o.w; d.v *= n.hCm / o.h; d.wcm = Math.min(d.wcm, Math.max(4, n.wCm)); }
  });
  const c = document.getElementById('mkCustom');
  if (c) c.value = mkFill();
  mkState.lastTag = null;
  mkRefresh();
  mkChanged();
}

function mkUndo() {
  if (!mkState.undo.length) return;
  mkState.redo.push(mkSnap());
  mkRestore(mkState.undo.pop());
  mkSyncHistBtns();
}
function mkRedo() {
  if (!mkState.redo.length) return;
  mkState.undo.push(mkSnap());
  mkRestore(mkState.redo.pop());
  mkSyncHistBtns();
}
function mkResetHistory() { mkState.undo = []; mkState.redo = []; mkState.lastTag = null; mkSyncHistBtns(); }
function mkSyncHistBtns() {
  const u = document.getElementById('mkUndoBtn'), r = document.getElementById('mkRedoBtn');
  if (u) u.disabled = !mkState.undo.length;
  if (r) r.disabled = !mkState.redo.length;
}

// ---------- Controles ----------
function mkCurRegion() {
  let y = mkState.yaw % (Math.PI * 2);
  if (y > Math.PI) y -= Math.PI * 2;
  if (y < -Math.PI) y += Math.PI * 2;
  if (Math.abs(y) < Math.PI / 4) return 'front';
  if (Math.abs(y) > Math.PI * 3 / 4) return 'back';
  return y < 0 ? 'sleeveL' : 'sleeveR';
}

function mkBuildControls() {
  document.getElementById('mkColors').innerHTML = colores.map((c, i) =>
    `<button title="${esc(c)}" aria-label="${esc(c)}" onclick="mkPickColor(${i})" style="width:34px;height:34px;border-radius:50%;background:${mkHex[i]};border:3px solid ${(i === mkState.color && !mkState.custom) ? '#6d5dfc' : 'rgba(128,128,128,.45)'}"></button>`
  ).join('');
  const tAct = tallas[mkState.talla];
  document.getElementById('mkGenero').innerHTML = tallaGrupos.map(g =>
    `<button type="button" class="chip${g.id === tallaGenero(tAct) ? ' active' : ''}" onclick="mkPickGenero('${g.id}')">${esc(g.nombre)}</button>`
  ).join('');
  const grp = tallaGrupos.find(g => g.id === tallaGenero(tAct));
  document.getElementById('mkSizes').innerHTML = grp.tallas.map(n => {
    const i = tallas.indexOf(n);
    return `<button type="button" class="chip${i === mkState.talla ? ' active' : ''}" onclick="mkPickSize(${i})">${esc(tallaCorta(n))}</button>`;
  }).join('');
  const tipoSel = document.getElementById('mkTipo');
  if (tipoSel) {
    tipoSel.innerHTML = tiposPrenda.map(t => `<option value="${esc(t)}"${t === mkState.tipo ? ' selected' : ''}>${esc(t)}</option>`).join('');
  }
  const cur = mkCurRegion();
  document.getElementById('mkViews').innerHTML = Object.keys(MK_REGIONS).map(k =>
    `<button onclick="mkView('${k}')" style="${mkChipStyle(k === cur)}">${MK_REGIONS[k]}</button>`
  ).join('');
}

// Distancias de colocacion de una imagen (cm). Solo pecho y espalda.
function mkPlacement(d) {
  if (!d || !mk || mkIsSleeve(d.region)) return null;
  const R = mk.regions[d.region];
  if (!R) return null;
  return { off: d.u - R.wCm / 2, neck: d.v - mkEffH(d) / 2 - MK_NECK_V };
}

function mkSetVal(id, v) { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; }

// Actualiza solo los campos numericos (barato; se usa mientras se arrastra o se pellizca)
function mkSyncInputs() {
  const d = mkSelDecal();
  if (d) {
    const p = mkPlacement(d);
    mkSetVal('mkNeck', p ? mkR1(p.neck) : '');
  }
  mkInfo();
}

function mkSyncUI() {
  const d = mkSelDecal();
  const list = document.getElementById('mkList');
  if (list) {
    list.innerHTML = mkState.decals.length ? mkState.decals.map(x =>
      `<button onclick="mkSelectDecal(${x.id})" style="${mkChipStyle(x.id === mkState.sel)}">${x.n} · ${MK_REGIONS[x.region]}${x.locked ? ' · fija' : ''}</button>`
    ).join('') : '<span style="font-size:12px;color:var(--muted)">Aun no hay imagenes. Carga una para empezar.</span>';
  }
  document.querySelectorAll('.mk-needs-sel').forEach(b => { b.disabled = !d; });
  const neck = document.getElementById('mkNeck');
  if (neck) neck.disabled = !d || mkIsSleeve(d.region);
  const lock = document.getElementById('mkLockBtn');
  if (lock) lock.textContent = d && d.locked ? 'Soltar imagen' : 'Fijar imagen';
  const bgb = document.getElementById('mkBgBtn');
  if (bgb) bgb.textContent = d && d.bg ? 'Restaurar fondo' : 'Quitar fondo';
  if (d) {
    const tol = document.getElementById('mkTol'), inner = document.getElementById('mkInner');
    if (d.bg) { if (tol) tol.value = d.bg.tol; if (inner) inner.checked = !!d.bg.inner; }
  }
  const drop = document.getElementById('mkDropBtn');
  if (drop) drop.textContent = mkState.pick ? 'Toca la imagen...' : 'Gotero';
  const g = document.getElementById('mkGuideBtn');
  if (g) g.textContent = 'Guias: ' + (mkState.guides ? 'si' : 'no');
  mkSyncInputs();
  mkSyncHistBtns();
  if (mk) mk.cv.style.cursor = mkState.pick ? 'crosshair' : 'grab';
}

function mkInfo() {
  const el = document.getElementById('mkInfo');
  if (!el) return;
  const pecho = mkPecho[mkState.talla];
  let t = mkState.tipo + ' · talla ' + tallas[mkState.talla] + ' · ancho de pecho aprox. ' + pecho + ' cm · ' + (mkState.custom ? 'color ' + mkState.custom : colores[mkState.color]);
  const d = mkSelDecal();
  if (d) {
    t += ' · imagen ' + d.n + ': ' + d.wcm.toFixed(0) + ' x ' + mkDecalH(d).toFixed(0) + ' cm' + (d.locked ? ' (fija)' : '');
    const p = mkPlacement(d);
    if (p) {
      const off = Math.abs(p.off) < 0.3 ? 'centrada' : mkR1(Math.abs(p.off)) + ' cm a la ' + (p.off < 0 ? 'izquierda' : 'derecha') + ' del centro';
      t += ', ' + off + ', a ' + mkR1(p.neck) + ' cm del cuello';
    }
  }
  el.textContent = t + '. Medidas aproximadas.';
}

function mkPickColor(i) {
  mkCommit('color');
  mkState.color = i;
  mkState.custom = null;
  mkState.pick = false;
  document.getElementById('mkCustom').value = mkHex[i];
  mkRefresh();
  mkChanged();
}
function mkSetCustom(hex) { mkCommit('color'); mkState.custom = hex; mkState.pick = false; mkRefresh(); mkChanged(); }
function mkPickSize(i) {
  if (i === mkState.talla) return;
  mkCommit();                       // la foto incluye las medidas de la talla anterior
  mkState.talla = i;
  if (mk) mkBuildShirt();
  mkRefresh();
  mkChanged();
}
function mkPickGenero(id) {
  const n = tallaEquivalente(tallas[mkState.talla], id);
  const i = tallas.indexOf(n);
  if (i >= 0) mkPickSize(i);
}
function mkPickTipo(v) {
  if (tiposPrenda.indexOf(v) < 0 || v === mkState.tipo) return;
  mkState.tipo = v;
  mkRefresh();
  mkChanged();
}
function mkRefresh() { mkBuildControls(); mkSyncUI(); mkInfo(); if (mk && mk.shirt) { mkPaintAll(); mkInvalidate(); } }


function mkView(name) {
  const yaw = MK_YAW[name];
  if (yaw === undefined) return;
  const cur = mkState.yaw;
  mk && (mk.target = { yaw: yaw + Math.PI * 2 * Math.round((cur - yaw) / (Math.PI * 2)), pitch: 0.05 });
  mkInvalidate();
}

function mkToggleGuides() {
  mkState.guides = !mkState.guides;
  mkSyncUI();
  if (mk && mk.shirt) { mkPaintAll(); mkInvalidate(); }
}

// ---------- Imagenes ----------
// Lee el archivo y lo reduce (maximo MK_MAXPX) para que guardarlo no pese demasiado.
function mkReadFile(file) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onerror = () => no(new Error('lectura'));
    r.onload = () => {
      const im = new Image();
      im.onerror = () => no(new Error('imagen'));
      im.onload = () => {
        if (!im.width || !im.height) { no(new Error('tamano')); return; }
        const sc = Math.min(1, MK_MAXPX / Math.max(im.width, im.height));
        if (sc >= 1 && /^data:image\/(png|jpeg|webp)/.test(r.result)) { ok({ src: r.result, im }); return; }
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * sc));
        c.height = Math.max(1, Math.round(im.height * sc));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const src = c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9);
        const im2 = new Image();
        im2.onload = () => ok({ src, im: im2 });
        im2.onerror = () => no(new Error('imagen'));
        im2.src = src;
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function mkLoadImage(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!mk || !mk.shirt) { alert('El visor 3D todavia no esta listo. Espera un momento e intenta de nuevo.'); input.value = ''; return; }
  mkReadFile(file).then(({ src, im }) => {
    mkCommit();
    const region = mkCurRegion();
    const R = mk.regions[region];
    const sleeve = mkIsSleeve(region);
    const wcm = sleeve ? Math.min(8, R.hCm * 0.8) : Math.min(28, mkPecho[mkState.talla]);
    const h = wcm * im.height / im.width;
    const d = {
      id: mkState.nextId, n: mkState.nextId, img: im, orig: im, src, region, wcm, rot: 0, locked: false, flipX: false, flipY: false, bg: null, sample: null,
      u: sleeve ? R.wCm * (region === 'sleeveL' ? 0.75 : 0.25) : R.wCm / 2,
      v: sleeve ? R.hCm * 0.45 : Math.min(0.14 * R.hCm + h / 2, R.hCm * 0.7)
    };
    mkState.nextId++;
    mkState.decals.push(d);
    mkState.sel = d.id;
    mkPaint(region);
    mkSyncUI(); mkInfo(); mkInvalidate(); mkChanged();
  }).catch(() => alert('No se pudo leer la imagen.'));
  input.value = '';
}

function mkSelectDecal(id) {
  const prev = mkSelDecal();
  mkState.sel = id;
  const now = mkSelDecal();
  if (prev) mkPaint(prev.region);
  if (now) mkPaint(now.region);
  mkSyncUI(); mkInfo(); mkInvalidate();
}

function mkToggleLock() {
  const d = mkSelDecal();
  if (!d) return;
  mkCommit();
  d.locked = !d.locked;
  mkPaint(d.region); mkSyncUI(); mkInfo(); mkInvalidate(); mkChanged();
}
function mkRemoveSel() {
  const d = mkSelDecal();
  if (!d) return;
  mkCommit();
  mkState.decals = mkState.decals.filter(x => x !== d);
  mkState.sel = mkState.decals.length ? mkState.decals[mkState.decals.length - 1].id : null;
  mkState.pick = false;
  mkPaintAll(); mkSyncUI(); mkInfo(); mkInvalidate(); mkChanged();
}
function mkClear() {
  if (mkState.decals.length && !confirm('Quitar todas las imagenes del mockup?')) return;
  if (!mkState.decals.length) return;
  mkCommit();
  mkState.decals = [];
  mkState.sel = null;
  mkState.pick = false;
  mkPaintAll(); mkSyncUI(); mkInfo(); mkInvalidate(); mkChanged();
}

// Duplicar, voltear, orden de capas
function mkDuplicate() {
  const d = mkSelDecal();
  if (!d) return;
  mkCommit();
  const R = mk.regions[d.region];
  const c = Object.assign({}, d, { id: mkState.nextId, n: mkState.nextId, locked: false, sample: null });
  mkState.nextId++;
  c.u = mkIsSleeve(d.region) ? d.u : mkClamp(d.u + 3, 0, R.wCm);
  c.v = mkClamp(d.v + 3, 0, R.hCm);
  mkState.decals.push(c);
  mkState.sel = c.id;
  mkPaint(d.region); mkSyncUI(); mkInfo(); mkInvalidate(); mkChanged();
}
function mkFlip(axis) {
  const d = mkSelDecal();
  if (!d) return;
  mkCommit();
  if (axis === 'x') d.flipX = !d.flipX; else d.flipY = !d.flipY;
  mkPaint(d.region); mkInvalidate(); mkChanged();
}
function mkLayer(op) {
  const d = mkSelDecal();
  if (!d) return;
  const a = mkState.decals, i = a.indexOf(d);
  let j = i;
  if (op === 'front') j = a.length - 1;
  else if (op === 'back') j = 0;
  else if (op === 'up') j = Math.min(a.length - 1, i + 1);
  else if (op === 'down') j = Math.max(0, i - 1);
  if (j === i) return;
  mkCommit();
  a.splice(i, 1);
  a.splice(j, 0, d);
  mkPaint(d.region); mkSyncUI(); mkInvalidate(); mkChanged();
}

// Ayudas de colocacion
function mkCenter() {
  const d = mkSelDecal();
  if (!d) return;
  mkCommit();
  const R = mk.regions[d.region];
  d.u = mkIsSleeve(d.region) ? R.wCm * (d.region === 'sleeveL' ? 0.75 : 0.25) : R.wCm / 2;
  mkPaint(d.region); mkSyncUI(); mkInvalidate(); mkChanged();
}
function mkSetNeck(v) {
  const d = mkSelDecal();
  if (!d || mkIsSleeve(d.region) || v === '' || isNaN(Number(v))) return;
  mkCommit('neck' + d.id);
  const R = mk.regions[d.region];
  d.v = mkClamp(MK_NECK_V + Number(v) + mkEffH(d) / 2, 0, R.hCm);
  mkPaint(d.region); mkInfo(); mkInvalidate(); mkChanged();
}
function mkNudge(dx, dy) {
  const d = mkSelDecal();
  if (!d || d.locked) return;
  mkCommit('nudge' + d.id);
  const R = mk.regions[d.region];
  d.u = mkIsSleeve(d.region) ? (((d.u + dx) % R.wCm) + R.wCm) % R.wCm : mkClamp(d.u + dx, 0, R.wCm);
  d.v = mkClamp(d.v + dy, 0, R.hCm);
  mkPaint(d.region); mkSyncInputs(); mkInvalidate(); mkChanged();
}

// ---------- Quitar fondo ----------
// Quita el color de fondo (el de las esquinas) con el relleno que parte de los bordes, asi no se borran
// las zonas blancas que son parte del diseño. Con "inner" quita ese color tambien por dentro.
function mkRemoveBg(img, tol, inner) {
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  let id;
  try { id = x.getImageData(0, 0, w, h); } catch (e) { return null; }
  const p = id.data;
  // Color de fondo: el mas repetido entre esquinas y mitades de los bordes
  const pts = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [w >> 1, h - 1], [0, h >> 1], [w - 1, h >> 1]];
  const buckets = {};
  pts.forEach(q => {
    const i = (q[1] * w + q[0]) * 4;
    if (p[i + 3] < 128) return;
    const key = (p[i] >> 4) + ',' + (p[i + 1] >> 4) + ',' + (p[i + 2] >> 4);
    (buckets[key] = buckets[key] || []).push([p[i], p[i + 1], p[i + 2]]);
  });
  const keys = Object.keys(buckets).sort((a, b) => buckets[b].length - buckets[a].length);
  if (!keys.length) return null;                       // los bordes ya son transparentes
  const list = buckets[keys[0]];
  const bg = [0, 1, 2].map(k => list.reduce((a, v) => a + v[k], 0) / list.length);
  const thr = tol * 2.6, thr2 = thr * thr;
  const dist2 = i => {
    const dr = p[i] - bg[0], dg = p[i + 1] - bg[1], db = p[i + 2] - bg[2];
    return dr * dr + dg * dg + db * db;
  };
  const near = i => p[i + 3] < 10 || dist2(i) <= thr2;
  const mask = new Uint8Array(w * h);
  if (inner) {
    for (let k = 0; k < w * h; k++) if (near(k * 4)) mask[k] = 1;
  } else {
    const stack = new Int32Array(w * h);
    let sp = 0;
    const seed = k => { if (!mask[k] && near(k * 4)) { mask[k] = 1; stack[sp++] = k; } };
    for (let xx = 0; xx < w; xx++) { seed(xx); seed((h - 1) * w + xx); }
    for (let yy = 0; yy < h; yy++) { seed(yy * w); seed(yy * w + w - 1); }
    while (sp) {
      const k = stack[--sp], px = k % w, py = (k - px) / w;
      if (px > 0) seed(k - 1);
      if (px < w - 1) seed(k + 1);
      if (py > 0) seed(k - w);
      if (py < h - 1) seed(k + w);
    }
  }
  let removed = 0;
  for (let k = 0; k < w * h; k++) {
    const i = k * 4;
    if (mask[k]) { p[i + 3] = 0; removed++; continue; }
    // borde suave: pixeles pegados al fondo y casi del mismo color
    const px = k % w, py = (k - px) / w;
    if ((px > 0 && mask[k - 1]) || (px < w - 1 && mask[k + 1]) || (py > 0 && mask[k - w]) || (py < h - 1 && mask[k + w])) {
      const dd = Math.sqrt(dist2(i));
      if (dd < thr * 1.7) p[i + 3] = Math.round(p[i + 3] * mkClamp((dd - thr) / (thr * 0.7), 0, 1));
    }
  }
  if (!removed) return null;
  x.putImageData(id, 0, 0);
  return c;
}

function mkBgSettings() {
  const tol = document.getElementById('mkTol'), inner = document.getElementById('mkInner');
  return { tol: mkClamp(Number(tol && tol.value) || 20, 1, 100), inner: !!(inner && inner.checked) };
}

function mkApplyBg(d, bg, img) {
  d.bg = bg;
  d.img = img || d.orig;
  d.sample = null;
}

function mkToggleBg() {
  const d = mkSelDecal();
  if (!d) { alert('Primero carga o selecciona una imagen.'); return; }
  if (d.bg) {
    mkCommit();
    mkApplyBg(d, null);
  } else {
    const bg = mkBgSettings();
    const c = mkRemoveBg(d.orig, bg.tol, bg.inner);
    if (!c) { alert('No se encontro un fondo para quitar. Si el fondo no es de un solo color, prueba subir la tolerancia.'); return; }
    mkCommit();
    mkApplyBg(d, bg, c);
  }
  mkPaint(d.region); mkSyncUI(); mkInvalidate(); mkChanged();
}

// Deslizador de tolerancia / casilla "tambien por dentro": reaplica sobre la imagen original
function mkBgChange() {
  const d = mkSelDecal();
  if (!d || !d.bg) return;
  clearTimeout(mkBgTimer);
  mkBgTimer = setTimeout(() => {
    const s = mkSelDecal();
    if (!s || !s.bg) return;
    const bg = mkBgSettings();
    const c = mkRemoveBg(s.orig, bg.tol, bg.inner);
    if (!c) return;
    mkCommit('bgtol' + s.id);
    mkApplyBg(s, bg, c);
    mkPaint(s.region); mkInvalidate(); mkChanged();
  }, 90);
}

// ---------- Gotero y color de fondo (usan la imagen seleccionada) ----------
function mkSampleOf(d) {
  if (d.sample) return d.sample;
  const k = Math.min(1, 300 / d.img.width);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(d.img.width * k));
  c.height = Math.max(1, Math.round(d.img.height * k));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(d.img, 0, 0, c.width, c.height);
  d.sample = { ctx: x, w: c.width, h: c.height };
  return d.sample;
}
function mkPixel(d, fx, fy) {
  try {
    const s = mkSampleOf(d);
    const px = Math.min(s.w - 1, Math.max(0, Math.floor(fx * s.w)));
    const py = Math.min(s.h - 1, Math.max(0, Math.floor(fy * s.h)));
    const p = s.ctx.getImageData(px, py, 1, 1).data;
    return p[3] < 20 ? null : p;
  } catch (e) { return null; }
}
function mkToHex(p) { return '#' + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, '0')).join(''); }
function mkApplyColor(hex) {
  mkCommit();
  mkState.custom = hex;
  mkState.pick = false;
  document.getElementById('mkCustom').value = hex;
  mkRefresh();
  mkChanged();
}
function mkToggleDropper() {
  if (!mkSelDecal()) { alert('Primero carga o selecciona una imagen.'); return; }
  mkState.pick = !mkState.pick;
  mkSyncUI();
}
function mkBgColor() {
  const d = mkSelDecal();
  if (!d) { alert('Primero carga o selecciona una imagen.'); return; }
  const src = { img: d.orig, sample: null };       // se mira la imagen original, no la que ya no tiene fondo
  const counts = {};
  [[0.01, 0.01], [0.99, 0.01], [0.01, 0.99], [0.99, 0.99]].forEach(p => {
    const px = mkPixel(src, p[0], p[1]);
    if (px) { const key = mkToHex(px); counts[key] = (counts[key] || 0) + 1; }
  });
  const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (!best) { alert('El fondo de la imagen es transparente. Usa el gotero y toca un color del diseño.'); return; }
  mkApplyColor(best);
}

// ---------- Tela: arrugas, costuras y trama (se pintan como una capa semitransparente) ----------
function mkRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function mkSeedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Capa de tela de una zona: negro y blanco con transparencia, del tamaño del lienzo de la zona.
function mkFabric(name, wCm, hCm, k) {
  const W = Math.max(8, Math.round(wCm * k)), H = Math.max(8, Math.round(hCm * k));
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ox = out.getContext('2d');
  const rnd = mkRng(mkSeedOf(name + Math.round(wCm) + 'x' + Math.round(hCm)));
  const sleeve = name === 'sleeveL' || name === 'sleeveR';

  // 1) Arrugas: se dibujan chicas y se agrandan, asi quedan suaves
  const sc = 8, lw = Math.max(8, Math.round(W / sc)), lh = Math.max(8, Math.round(H / sc));
  const lo = document.createElement('canvas');
  lo.width = lw; lo.height = lh;
  const c = lo.getContext('2d');
  const f = k / sc;                                   // px chicos por cm
  c.lineCap = 'round';
  const fold = (x, y, ang, len, wd, dark, light, bend) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const x2 = x + dx * len, y2 = y + dy * len;
    const cx = (x + x2) / 2 + nx * len * bend, cy = (y + y2) / 2 + ny * len * bend;
    const path = (ox2, oy2) => { c.beginPath(); c.moveTo(x + ox2, y + oy2); c.quadraticCurveTo(cx + ox2, cy + oy2, x2 + ox2, y2 + oy2); c.stroke(); };
    c.lineWidth = wd * f;
    c.strokeStyle = 'rgba(0,0,0,' + dark + ')';
    path(0, 0);
    c.lineWidth = wd * f * 0.8;
    c.strokeStyle = 'rgba(255,255,255,' + light + ')';
    path(nx * wd * f * 0.9, ny * wd * f * 0.9);
  };
  const R = (a, b) => a + (b - a) * rnd();
  if (!sleeve) {
    // pliegues que bajan desde las axilas, hacia el centro
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < 7; i++) {
        const x0 = (side ? wCm - R(0.02, 0.2) * wCm : R(0.02, 0.2) * wCm) * f;
        const y0 = hCm * R(0.15, 0.4) * f;
        const a = R(55, 85) * Math.PI / 180;
        fold(x0, y0, side ? Math.PI - a : a, R(8, 22) * f, R(1.8, 3.6), R(0.045, 0.1), R(0.02, 0.045), R(-0.12, 0.12));
      }
    }
    // pliegues anchos del abdomen
    for (let i = 0; i < 5; i++) {
      const a = R(-18, 18) * Math.PI / 180;
      fold(wCm * R(0.1, 0.4) * f, hCm * R(0.5, 0.88) * f, a, wCm * R(0.3, 0.55) * f, R(2.6, 4.2), R(0.025, 0.055), R(0.015, 0.03), R(-0.1, 0.1));
    }
  } else {
    for (let i = 0; i < 9; i++) {
      fold(wCm * rnd() * f, hCm * R(0.3, 1) * f, R(0.3, 2.8), R(4, 9) * f, R(1.4, 2.8), R(0.05, 0.1), R(0.02, 0.045), R(-0.15, 0.15));
    }
  }
  // agrandar en dos pasos para que quede difuminado y sin cuadritos
  const mid = document.createElement('canvas');
  mid.width = Math.max(8, Math.round(W / 3)); mid.height = Math.max(8, Math.round(H / 3));
  const mc = mid.getContext('2d');
  mc.imageSmoothingEnabled = true; mc.imageSmoothingQuality = 'high';
  mc.drawImage(lo, 0, 0, mid.width, mid.height);
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(mid, 0, 0, W, H);

  // 2) Sombra en las orillas (la tela se curva y se oscurece)
  if (!sleeve) {
    ['l', 'r'].forEach(side => {
      const g = ox.createLinearGradient(side === 'l' ? 0 : W, 0, side === 'l' ? 5 * k : W - 5 * k, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ox.fillStyle = g;
      ox.fillRect(0, 0, W, H);
    });
  }

  // 3) Dobladillo con doble costura (en las mangas esta en v = 0, en pecho y espalda abajo)
  const y1 = sleeve ? 1.7 * k : H - 2.5 * k, y2 = sleeve ? 2.1 * k : H - 2.1 * k;
  const band = ox.createLinearGradient(0, sleeve ? 0 : H - 2.8 * k, 0, sleeve ? 2.4 * k : H);
  band.addColorStop(0, sleeve ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0)');
  band.addColorStop(1, sleeve ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.12)');
  ox.fillStyle = band;
  ox.fillRect(0, sleeve ? 0 : H - 2.8 * k, W, 2.8 * k);
  ox.lineWidth = Math.max(1, 0.09 * k);
  ox.setLineDash([0.35 * k, 0.17 * k]);
  [y1, y2].forEach(y => {
    ox.strokeStyle = 'rgba(0,0,0,0.38)';
    ox.beginPath(); ox.moveTo(0, y); ox.lineTo(W, y); ox.stroke();
    ox.strokeStyle = 'rgba(255,255,255,0.14)';
    ox.beginPath(); ox.moveTo(0, y + ox.lineWidth); ox.lineTo(W, y + ox.lineWidth); ox.stroke();
  });
  ox.setLineDash([]);

  // 4) Trama del tejido: columnas finas y ruido (casi no se nota de lejos, se ve al acercar)
  const tile = document.createElement('canvas');
  tile.width = tile.height = 64;
  const tc = tile.getContext('2d');
  const td = tc.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const col = (i % 64) % 3 === 0;
    const n = rnd();
    const dark = (col ? 0.05 : 0) + (n < 0.5 ? n * 0.07 : 0);
    const light = n >= 0.5 ? (n - 0.5) * 0.1 : 0;
    const v = light > dark ? 255 : 0;
    td.data[i * 4] = td.data[i * 4 + 1] = td.data[i * 4 + 2] = v;
    td.data[i * 4 + 3] = Math.round(255 * Math.max(dark, light));
  }
  tc.putImageData(td, 0, 0);
  ox.fillStyle = ox.createPattern(tile, 'repeat');
  ox.fillRect(0, 0, W, H);
  return out;
}

// ---------- Pintado de cada zona ----------
function mkDrawDecal(ctx, d, k, offs) {
  const w = d.wcm * k, h = w * d.img.height / d.img.width;
  offs.forEach(o => {
    ctx.save();
    ctx.translate((d.u + o) * k, d.v * k);
    ctx.rotate(d.rot * Math.PI / 180);
    if (d.flipX || d.flipY) ctx.scale(d.flipX ? -1 : 1, d.flipY ? -1 : 1);
    ctx.drawImage(d.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  });
}

function mkDrawGuides(R, sel) {
  const ctx = R.ctx, k = R.k, cx = R.wCm / 2 * k, nv = MK_NECK_V * k;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, 0.13 * k);
  ctx.setLineDash([0.8 * k, 0.5 * k]);
  ctx.strokeStyle = 'rgba(109,93,252,0.8)';
  ctx.beginPath(); ctx.moveTo(cx, nv); ctx.lineTo(cx, R.canvas.height); ctx.stroke();       // centro
  ctx.setLineDash([0.5 * k, 0.35 * k]);
  ctx.strokeStyle = 'rgba(240,138,36,0.9)';
  ctx.beginPath(); ctx.moveTo(cx - 9 * k, nv); ctx.lineTo(cx + 9 * k, nv); ctx.stroke();    // cuello
  ctx.setLineDash([]);
  ctx.font = '800 ' + Math.round(1.5 * k) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240,138,36,0.95)';
  ctx.fillText('cuello', cx + 13 * k, nv + 0.5 * k);
  if (sel) {
    // medida del cuello al borde de arriba de la imagen
    const top = (sel.v - mkEffH(sel) / 2) * k;
    if (top > nv + 0.8 * k) {
      ctx.strokeStyle = 'rgba(240,138,36,0.95)';
      ctx.lineWidth = Math.max(1.5, 0.15 * k);
      ctx.beginPath(); ctx.moveTo(sel.u * k, nv); ctx.lineTo(sel.u * k, top); ctx.stroke();
      ctx.fillStyle = 'rgba(240,138,36,0.98)';
      ctx.textAlign = 'left';
      ctx.fillText(mkR1((top - nv) / k) + ' cm', sel.u * k + 0.7 * k, (nv + top) / 2 + 0.5 * k);
    }
  }
  ctx.restore();
}

function mkPaint(name) {
  const R = mk && mk.regions[name];
  if (!R) return;
  const ctx = R.ctx, k = R.k;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = mkFill();
  ctx.fillRect(0, 0, R.canvas.width, R.canvas.height);
  const offs = mkIsSleeve(name) ? [-R.wCm, 0, R.wCm] : [0];
  mkState.decals.filter(d => d.region === name).forEach(d => mkDrawDecal(ctx, d, k, offs));
  if (R.fabric) ctx.drawImage(R.fabric, 0, 0);          // arrugas y costuras por encima de la imagen
  const s = mkSelDecal();
  const mine = s && s.region === name ? s : null;
  if (mkState.guides && !mk.noSel && !mkIsSleeve(name)) mkDrawGuides(R, mine);
  if (mine && !mk.noSel) {
    const w = mine.wcm * k, h = w * mine.img.height / mine.img.width;
    offs.forEach(o => {
      ctx.save();
      ctx.translate((mine.u + o) * k, mine.v * k);
      ctx.rotate(mine.rot * Math.PI / 180);
      ctx.lineWidth = Math.max(2, 0.3 * k);
      ctx.strokeStyle = mine.locked ? '#f08a24' : '#6d5dfc';
      ctx.setLineDash([k, k * 0.6]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    });
  }
  R.tex.needsUpdate = true;
}
function mkPaintAll() {
  if (!mk) return;
  Object.keys(mk.regions).forEach(mkPaint);
  const base = mkFill();
  if (mk.yokeMat) mk.yokeMat.color.set(base).convertSRGBToLinear();
  if (mk.collarMat) mk.collarMat.color.set(mkShade(base, -0.14)).convertSRGBToLinear();
}

// ---------- Escena 3D ----------
function mkInitScene() {
  const T = THREE;
  const cv = document.getElementById('mkCanvas');
  const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.setClearColor(0xeef1f6, 1);
  const scene = new T.Scene();
  // Fondo con un degradado suave (mas centro claro, orillas un poco mas oscuras)
  const bgc = document.createElement('canvas');
  bgc.width = bgc.height = 256;
  const bx = bgc.getContext('2d');
  const g = bx.createRadialGradient(128, 118, 10, 128, 128, 190);
  g.addColorStop(0, '#f8f9fc');
  g.addColorStop(1, '#dde2ec');
  bx.fillStyle = g;
  bx.fillRect(0, 0, 256, 256);
  const bgTex = new T.CanvasTexture(bgc);
  bgTex.encoding = T.sRGBEncoding;
  scene.background = bgTex;
  const camera = new T.PerspectiveCamera(32, 1, 1, 2000);
  scene.add(new T.HemisphereLight(0xffffff, 0x9aa0b0, 0.9));
  const key = new T.DirectionalLight(0xffffff, 0.55); key.position.set(60, 90, 120); scene.add(key);
  const fill = new T.DirectionalLight(0xffffff, 0.3); fill.position.set(-80, 30, -120); scene.add(fill);
  const rim = new T.DirectionalLight(0xffffff, 0.2); rim.position.set(-90, 60, 90); scene.add(rim);
  const root = new T.Group();
  scene.add(root);
  mk = { T, cv, renderer, scene, camera, root, shirt: null, regions: {}, ray: new T.Raycaster(), ptr: new T.Vector2(), dist: 150, raf: 0, target: null, noSel: false };
}

function mkRegion(name, wCm, hCm) {
  const T = mk.T;
  const k = Math.min(12, 2048 / Math.max(wCm, hCm));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(wCm * k));
  canvas.height = Math.max(8, Math.round(hCm * k));
  const tex = new T.CanvasTexture(canvas);
  tex.encoding = T.sRGBEncoding;
  tex.anisotropy = Math.min(8, mk.renderer.capabilities.getMaxAnisotropy());
  return { name, wCm, hCm, k, canvas, ctx: canvas.getContext('2d'), tex, mesh: null, fabric: mkFabric(name, wCm, hCm, k) };
}

// Pecho o espalda: media elipse. Se le da un poco de caida (ondulacion) que se apaga en las orillas
// para que siga pegada a hombros y costados.
function mkPanelGeometry(sign, a, b, H, topY) {
  const T = mk.T, N = 64, M = 28, bot = -H / 2;
  const xs = [], zs = [], S = [0];
  for (let i = 0; i <= N; i++) {
    const phi = -Math.PI / 2 + Math.PI * i / N;
    xs.push(sign * a * Math.sin(phi));
    zs.push(sign * b * Math.cos(phi));
    if (i) S.push(S[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
  }
  const total = S[N];
  const pos = [], uv = [], idx = [];
  const amp = 0.0085 * H;
  for (let j = 0; j <= M; j++) {
    const t = j / M;
    for (let i = 0; i <= N; i++) {
      const y = bot + (topY(xs[i]) - bot) * t;
      const side = 1 - Math.pow(Math.min(1, Math.abs(xs[i]) / a), 4);
      const fade = side * (1 - Math.pow(t, 3));
      const wave = Math.sin(y * 0.21 + xs[i] * 0.33) * 0.6 + Math.sin(y * 0.47 - xs[i] * 0.19 + 1.3) * 0.4;
      pos.push(xs[i], y, zs[i] + sign * amp * wave * fade);
      uv.push(S[i] / total, (y - bot) / H);
    }
  }
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const p = j * (N + 1) + i;
      idx.push(p, p + 1, p + N + 1, p + 1, p + N + 2, p + N + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, wCm: total };
}

// Textura de las costillas del cuello (rayitas finas)
function mkRibTexture() {
  const T = mk.T;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 128, 8);
  x.fillStyle = 'rgba(0,0,0,0.16)';
  for (let i = 0; i < 128; i += 4) x.fillRect(i, 0, 2, 8);
  const tex = new T.CanvasTexture(c);
  tex.wrapS = T.RepeatWrapping;
  tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(70, 1);
  tex.encoding = T.sRGBEncoding;
  return tex;
}

function mkBuildShirt() {
  const T = mk.T;
  const oldDims = {};
  Object.keys(mk.regions).forEach(n => { oldDims[n] = { w: mk.regions[n].wCm, h: mk.regions[n].hCm }; });
  if (mk.shirt) {
    mk.root.remove(mk.shirt);
    mk.shirt.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }
  mk.regions = {};
  const shirt = new T.Group();
  const pecho = mkPecho[mkState.talla];
  const a = pecho / 2, b = a * 0.42, H = pecho * 1.28, slope = 0.10 * H;
  const topY = x => H / 2 - slope * Math.pow(Math.min(1, Math.abs(x) / a), 1.6);
  const mkMat = R => new T.MeshStandardMaterial({ map: R.tex, roughness: 0.9, metalness: 0, side: T.DoubleSide });
  const addRegion = (name, wCm, hCm, geo) => {
    const R = mkRegion(name, wCm, hCm);
    R.mesh = new T.Mesh(geo, mkMat(R));
    R.mesh.userData.region = name;
    mk.regions[name] = R;
    shirt.add(R.mesh);
    return R;
  };

  // Pecho y espalda
  const front = mkPanelGeometry(1, a, b, H, topY);
  addRegion('front', front.wCm, H, front.geo);
  const back = mkPanelGeometry(-1, a, b, H, topY);
  addRegion('back', back.wCm, H, back.geo);

  // Mangas
  const rs = 0.125 * pecho, rc = 0.11 * pecho, L = 0.32 * pecho, tilt = 25 * Math.PI / 180;
  [['sleeveL', 1], ['sleeveR', -1]].forEach(([name, side]) => {
    const geo = new T.CylinderGeometry(rc, rs, L, 32, 8, true);
    const R = addRegion(name, 2 * Math.PI * (rs + rc) / 2, L, geo);
    const sx = side * 0.88 * a;
    const sy = topY(sx) - 0.07 * H;
    const dx = side * Math.cos(tilt), dy = -Math.sin(tilt);
    R.mesh.rotation.z = side > 0 ? -(Math.PI / 2 + tilt) : (Math.PI / 2 + tilt);
    R.mesh.position.set(sx + dx * L / 2, sy + dy * L / 2, 0);
  });

  // Hombros (anillo entre el borde de la camisa y el cuello) y cuello
  const na = 0.17 * pecho, nb = b * 0.7, inner = [], NR = 64;
  const pos = [], idx = [];
  for (let i = 0; i <= NR; i++) {
    const th = Math.PI * 2 * i / NR;
    const ox = a * Math.cos(th), oz = b * Math.sin(th);
    pos.push(ox, topY(ox), oz);
  }
  for (let i = 0; i <= NR; i++) {
    const th = Math.PI * 2 * i / NR;
    const ix = na * Math.cos(th), iz = nb * Math.sin(th);
    const iy = H / 2 - (iz > 0 ? 0.045 * H * (iz / nb) : 0.004 * H);
    pos.push(ix, iy, iz);
    inner.push(new T.Vector3(ix, iy, iz));
  }
  for (let i = 0; i < NR; i++) idx.push(i, i + 1, NR + 1 + i, i + 1, NR + 2 + i, NR + 1 + i);
  const yg = new T.BufferGeometry();
  yg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  yg.setIndex(idx);
  yg.computeVertexNormals();
  mk.yokeMat = new T.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: T.DoubleSide });
  shirt.add(new T.Mesh(yg, mk.yokeMat));
  const collar = new T.TubeGeometry(new T.CatmullRomCurve3(inner.slice(0, NR), true), 64, 0.9, 8, true);
  mk.collarMat = new T.MeshStandardMaterial({ roughness: 0.95, metalness: 0, map: mkRibTexture() });
  shirt.add(new T.Mesh(collar, mk.collarMat));

  mk.shirt = shirt;
  mk.root.add(shirt);
  mk.H = H;
  mk.halfW = a + 0.88 * 0 + L * Math.cos(tilt) + rs * 0.4;

  // Al cambiar de talla las imagenes conservan su posicion relativa
  mkState.decals.forEach(d => {
    const o = oldDims[d.region], n = mk.regions[d.region];
    if (o && n) { d.u *= n.wCm / o.w; d.v *= n.hCm / o.h; d.wcm = Math.min(d.wcm, Math.max(4, n.wCm)); }
  });
  mkPaintAll();
  mkResize();
}

function mkFitDist(aspect) {
  const tan = Math.tan(mk.camera.fov * Math.PI / 360);
  return Math.max(0.72 * mk.H / tan, 1.08 * mk.halfW / (tan * aspect));
}

function mkResize() {
  if (!mk || !mk.shirt) return;
  const w = mk.cv.clientWidth;
  if (!w) return;
  const h = Math.round(w * 640 / 600);
  mk.renderer.setSize(w, h, false);
  mk.camera.aspect = w / h;
  mk.camera.updateProjectionMatrix();
  mk.dist = mkFitDist(mk.camera.aspect);
  mkInvalidate();
}

function mkInvalidate() {
  if (!mk || mk.raf) return;
  mk.raf = requestAnimationFrame(mkFrame);
}

function mkFrame() {
  mk.raf = 0;
  if (!mk.shirt) return;
  let moving = false;
  if (mk.target) {
    const dy = mk.target.yaw - mkState.yaw, dp = mk.target.pitch - mkState.pitch;
    if (Math.abs(dy) < 0.003 && Math.abs(dp) < 0.003) {
      mkState.yaw = mk.target.yaw; mkState.pitch = mk.target.pitch; mk.target = null;
    } else {
      mkState.yaw += dy * 0.2; mkState.pitch += dp * 0.2; moving = true;
    }
  }
  mk.root.rotation.set(mkState.pitch, mkState.yaw, 0, 'YXZ');
  mk.camera.position.set(0, 0, mk.dist / mkState.zoom);
  mk.camera.lookAt(0, 0, 0);
  mk.renderer.render(mk.scene, mk.camera);
  const cur = mkCurRegion();
  if (cur !== mk.lastView) { mk.lastView = cur; mkBuildControls(); }
  if (moving) mkInvalidate();
}

function mkDraw() {
  mkBuildControls(); mkSyncUI(); mkInfo();
  mkFillQuotes(); mkMetaWrite(mkState.meta); mkRenderSaved();
  Promise.all([mkLoadThree(), mkBootDraft()]).then(() => {
    if (!mk) mkInitScene();
    if (!mk.shirt) mkBuildShirt();
    mkPaintAll();
    mkBuildControls(); mkSyncUI(); mkInfo(); mkMetaWrite(mkState.meta);
    mkResize();
    mkInvalidate();
  }).catch(() => {
    const el = document.getElementById('mkInfo');
    if (el) el.textContent = 'No se pudo cargar la libreria 3D. Conectate a internet una vez (o ejecuta "Descargar librerias" en GitHub Actions) y vuelve a abrir Mockups.';
  });
}

// ---------- Tocar, arrastrar y pellizcar ----------
function mkRayAtXY(x, y) {
  const r = mk.cv.getBoundingClientRect();
  mk.ptr.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  mk.root.updateMatrixWorld(true);
  mk.camera.updateMatrixWorld(true);
  mk.ray.setFromCamera(mk.ptr, mk.camera);
  const hit = mk.ray.intersectObjects(Object.values(mk.regions).map(R => R.mesh), false)[0];
  if (!hit || !hit.uv) return null;
  const R = mk.regions[hit.object.userData.region];
  return { region: R.name, u: hit.uv.x * R.wCm, v: (1 - hit.uv.y) * R.hCm };
}

function mkLocal(d, u, v) {
  const R = mk.regions[d.region];
  let dx = u - d.u;
  if (mkIsSleeve(d.region)) { dx = ((dx % R.wCm) + R.wCm) % R.wCm; if (dx > R.wCm / 2) dx -= R.wCm; }
  const dy = v - d.v, r = -d.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: dx * c - dy * s, y: dx * s + dy * c, w: d.wcm, h: mkDecalH(d) };
}

function mkDecalAt(hit) {
  for (let i = mkState.decals.length - 1; i >= 0; i--) {
    const d = mkState.decals[i];
    if (d.region !== hit.region) continue;
    const l = mkLocal(d, hit.u, hit.v);
    if (Math.abs(l.x) <= l.w / 2 && Math.abs(l.y) <= l.h / 2) return { d, l };
  }
  return null;
}

(function mkInit() {
  const cv = document.getElementById('mkCanvas');
  if (!cv) return;
  const ptrs = new Map();       // dedos / punteros activos
  let pinch = null;             // gesto de dos dedos en curso
  let single = true;            // false mientras queda un dedo despues de pellizcar (no debe arrastrar)

  const pair = () => {
    const a = Array.from(ptrs.values()).slice(0, 2);
    return { mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, dist: Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y) || 1, ang: Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x), a };
  };

  const startPinch = () => {
    mkDrag = null;
    mk.target = null;
    const p = pair();
    // Si algun dedo (o el punto medio) esta sobre una imagen, el gesto es para esa imagen; si no, es zoom
    let found = null;
    [{ x: p.mx, y: p.my }, p.a[0], p.a[1]].some(q => {
      const hit = mkRayAtXY(q.x, q.y);
      const f = hit && mkDecalAt(hit);
      if (f) { found = f.d; return true; }
      return false;
    });
    if (found && !found.locked) {
      if (found.id !== mkState.sel) mkSelectDecal(found.id);
      pinch = { mode: 'decal', d: found, w0: found.wcm, r0: found.rot, dist0: p.dist, ang0: p.ang, done: false };
    } else {
      pinch = { mode: 'zoom', z0: mkState.zoom, dist0: p.dist };
    }
  };

  const movePinch = () => {
    const p = pair();
    if (pinch.mode === 'zoom') {
      mkState.zoom = mkClamp(pinch.z0 * p.dist / pinch.dist0, 0.5, 3);
      mkInvalidate();
      return;
    }
    const d = pinch.d, R = mk.regions[d.region];
    if (!pinch.done) { mkCommit(); pinch.done = true; }
    d.wcm = mkClamp(pinch.w0 * p.dist / pinch.dist0, 2, Math.max(4, R.wCm));
    let r = pinch.r0 + (p.ang - pinch.ang0) * 180 / Math.PI;
    r = ((r + 180) % 360 + 360) % 360 - 180;
    d.rot = Math.round(r * 10) / 10;
    mkPaint(d.region);
    mkSyncInputs();
    mkInvalidate();
  };

  cv.addEventListener('pointerdown', e => {
    if (!mk || !mk.shirt) return;
    if (mkState.pick && ptrs.size === 0) {
      const hit = mkRayAtXY(e.clientX, e.clientY);
      const f = hit && mkDecalAt(hit);
      const d = mkSelDecal();
      if (!f || !d || f.d !== d) { alert('Toca sobre la imagen seleccionada.'); return; }
      let fx = (f.l.x + f.l.w / 2) / f.l.w, fy = (f.l.y + f.l.h / 2) / f.l.h;
      if (d.flipX) fx = 1 - fx;
      if (d.flipY) fy = 1 - fy;
      const px = mkPixel(d, fx, fy);
      if (!px) { alert('Ese punto es transparente. Toca otro.'); return; }
      mkApplyColor(mkToHex(px));
      return;
    }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    if (ptrs.size === 2) { startPinch(); single = false; return; }
    if (ptrs.size > 2) return;
    single = true;
    mk.target = null;
    const hit = mkRayAtXY(e.clientX, e.clientY);
    const found = hit && mkDecalAt(hit);
    if (found) {
      if (found.d.id !== mkState.sel) mkSelectDecal(found.d.id);
      if (!found.d.locked) {
        mkDrag = { type: 'decal', d: found.d, ox: found.d.u - hit.u, oy: found.d.v - hit.v, region: hit.region, moved: false };
        cv.style.cursor = 'move';
        return;
      }
    }
    mkDrag = { type: 'orbit', x: e.clientX, y: e.clientY, yaw: mkState.yaw, pitch: mkState.pitch };
    cv.style.cursor = 'grabbing';
  });

  cv.addEventListener('pointermove', e => {
    if (!mk || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) { movePinch(); return; }
    if (!single || ptrs.size > 1 || !mkDrag) return;
    if (mkDrag.type === 'orbit') {
      mkState.yaw = mkDrag.yaw + (e.clientX - mkDrag.x) * 0.012;
      mkState.pitch = mkClamp(mkDrag.pitch + (e.clientY - mkDrag.y) * 0.008, -0.9, 0.9);
      mkInvalidate();
      return;
    }
    const hit = mkRayAtXY(e.clientX, e.clientY);
    if (!hit) return;
    const d = mkDrag.d, from = d.region;
    if (!mkDrag.moved) { mkCommit(); mkDrag.moved = true; }
    if (hit.region !== mkDrag.region) { mkDrag.region = hit.region; mkDrag.ox = 0; mkDrag.oy = 0; }
    const R = mk.regions[hit.region];
    let u = hit.u + mkDrag.ox, v = hit.v + mkDrag.oy;
    u = mkIsSleeve(hit.region) ? ((u % R.wCm) + R.wCm) % R.wCm : mkClamp(u, 0, R.wCm);
    v = mkClamp(v, 0, R.hCm);
    if (mkState.guides && !mkIsSleeve(hit.region) && Math.abs(u - R.wCm / 2) < 0.8) u = R.wCm / 2;   // imán al centro
    d.region = hit.region; d.u = u; d.v = v;
    if (from !== d.region) { mkPaint(from); mkSyncUI(); }
    mkPaint(d.region);
    mkSyncInputs();
    mkInvalidate();
  });

  const stop = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (pinch && ptrs.size < 2) {
      if (pinch.mode === 'decal' && pinch.done) { mkSyncUI(); mkChanged(); }
      pinch = null;
      single = false;           // el dedo que queda no debe mover ni girar nada
    }
    if (mkDrag && mkDrag.type === 'decal' && mkDrag.moved) { mkSyncUI(); mkInfo(); mkChanged(); }
    mkDrag = null;
    if (!ptrs.size) single = true;
    if (mk) mk.cv.style.cursor = mkState.pick ? 'crosshair' : 'grab';
  };
  cv.addEventListener('pointerup', stop);
  cv.addEventListener('pointercancel', stop);
  cv.addEventListener('wheel', e => {
    if (!mk || !mk.shirt) return;
    e.preventDefault();
    mkState.zoom = mkClamp(mkState.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.5, 3);
    mkInvalidate();
  }, { passive: false });
  window.addEventListener('resize', () => { if (mk && mk.shirt) mkResize(); });

  // Teclado (computadora): deshacer, rehacer, borrar y mover con flechas
  document.addEventListener('keydown', e => {
    if (typeof curTab === 'undefined' || curTab !== 'mock') return;
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    const ctrl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (ctrl && key === 'z') { e.preventDefault(); e.shiftKey ? mkRedo() : mkUndo(); return; }
    if (ctrl && key === 'y') { e.preventDefault(); mkRedo(); return; }
    if (!mkSelDecal()) return;
    if (key === 'delete' || key === 'backspace') { e.preventDefault(); mkRemoveSel(); return; }
    const st = e.shiftKey ? 1 : 0.2;
    const mv = { arrowleft: [-st, 0], arrowright: [st, 0], arrowup: [0, -st], arrowdown: [0, st] }[key];
    if (mv) { e.preventDefault(); mkNudge(mv[0], mv[1]); }
  });
})();

// ---------- Capturas: varias vistas de la camisa en una sola pasada ----------
// views: [{ yaw, fit }]. Devuelve un lienzo 2D por vista (sin recuadros ni guias).
function mkCapture(views, w, h) {
  const r = mk.renderer, T = mk.T;
  const prevPR = r.getPixelRatio();
  const prevSize = r.getSize(new T.Vector2());
  const prevAspect = mk.camera.aspect;
  const out = [];
  try {
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    mk.camera.aspect = w / h;
    mk.camera.updateProjectionMatrix();
    mk.noSel = true;
    mkPaintAll();
    const dist = mkFitDist(w / h);
    views.forEach(v => {
      mk.root.rotation.set(v.pitch === undefined ? 0.05 : v.pitch, v.yaw, 0, 'YXZ');
      mk.camera.position.set(0, 0, dist / (v.fit || 1));
      mk.camera.lookAt(0, 0, 0);
      r.render(mk.scene, mk.camera);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(r.domElement, 0, 0, w, h);
      out.push(c);
    });
  } finally {
    r.setPixelRatio(prevPR);
    r.setSize(prevSize.x, prevSize.y, false);
    mk.camera.aspect = prevAspect;
    mk.camera.updateProjectionMatrix();
    mk.noSel = false;
    mkPaintAll();
    mkResize();
    mkInvalidate();
  }
  return out;
}

function mkSlug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_'); }

function mkExport() {
  if (!mk || !mk.shirt) { alert('El visor 3D todavia no esta listo.'); return; }
  const cur = mkCurRegion();
  const cap = mkCapture([{ yaw: mkState.yaw, pitch: mkState.pitch, fit: mkState.zoom }], 900, 960)[0];
  const name = 'Mockup_' + mkSlug(mkState.custom ? 'Personalizado' : colores[mkState.color]) + '_' + mkSlug(tallas[mkState.talla]) + '_' + mkSlug(MK_REGIONS[cur]) + '.png';
  cap.toBlob(blob => {
    if (!blob) { alert('No se pudo crear la imagen.'); return; }
    exportFile(blob, name, 'image/png');
  }, 'image/png');
}

function mkLoadImg(src) {
  return new Promise(ok => {
    if (!src) { ok(null); return; }
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
}

function mkRoundRect(x, X, Y, W, H, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

// Hoja con todas las vistas: pecho y espalda siempre; las mangas solo si llevan imagen.
async function mkBuildSheet() {
  const meta = mkMetaRead();
  const regions = ['front', 'back'].concat(['sleeveL', 'sleeveR'].filter(r => mkState.decals.some(d => d.region === r)));
  const cw = 820, ch = Math.round(cw * 640 / 600);
  const caps = mkCapture(regions.map(r => ({ yaw: MK_YAW[r], fit: mkIsSleeve(r) ? 1.18 : 1 })), cw, ch);
  const W = 1800, M = 60, gap = 40, label = 64;
  const rows = Math.ceil(regions.length / 2);
  const lines = mkState.decals.slice().sort((p, q) => p.n - q.n).map(d => {
    const p = mkPlacement(d);
    let t = d.n + '. ' + MK_REGIONS[d.region] + ': ' + mkR1(d.wcm) + ' x ' + mkR1(mkDecalH(d)) + ' cm';
    if (p) t += ' · ' + (Math.abs(p.off) < 0.3 ? 'centrada' : mkR1(Math.abs(p.off)) + ' cm a la ' + (p.off < 0 ? 'izq.' : 'der.')) + ' · a ' + mkR1(p.neck) + ' cm del cuello';
    if (d.rot) t += ' · giro ' + Math.round(d.rot) + '°';
    return t;
  });
  const headH = 190, foot = lines.length ? 90 + lines.length * 40 : 40;
  const H = headH + rows * (ch + label + gap) + foot;
  const sheet = document.createElement('canvas');
  sheet.width = W; sheet.height = H;
  const x = sheet.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, W, H);
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const brandName = (typeof brand !== 'undefined' && brand.name) || 'VALYRA';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#1b1e28';
  x.font = '800 54px ' + FONT;
  x.textAlign = 'left';
  x.fillText(brandName, M, 90);
  x.font = '600 32px ' + FONT;
  x.fillStyle = '#6b7080';
  x.fillText('Mockup' + (meta.nombre ? ' · ' + meta.nombre : ''), M, 138);
  x.font = '500 26px ' + FONT;
  const colorName = mkState.custom ? 'color ' + mkState.custom : colores[mkState.color];
  x.fillText(mkState.tipo + ' · Talla ' + tallas[mkState.talla] + ' · ' + colorName, M, 176);
  x.textAlign = 'right';
  x.fillStyle = '#1b1e28';
  x.font = '700 32px ' + FONT;
  if (meta.cliente) x.fillText(meta.cliente, W - M, 90);
  x.font = '500 26px ' + FONT;
  x.fillStyle = '#6b7080';
  x.fillText(hoy(), W - M, 132);
  const logoImg = await mkLoadImg(typeof logo === 'string' ? logo : '');
  if (logoImg) {
    const lh = 70, lw = Math.min(260, logoImg.width * lh / logoImg.height);
    x.drawImage(logoImg, W - M - lw, 100, lw, lh);
  }
  // Vistas
  const cols = 2;
  regions.forEach((r, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, regions.length - row * cols);
    const col = i - row * cols;
    const rowW = inRow * cw + (inRow - 1) * gap;
    const X = (W - rowW) / 2 + col * (cw + gap), Y = headH + row * (ch + label + gap);
    x.save();
    mkRoundRect(x, X, Y, cw, ch, 22);
    x.clip();
    x.drawImage(caps[i], X, Y, cw, ch);
    x.restore();
    x.fillStyle = '#1b1e28';
    x.font = '800 32px ' + FONT;
    x.textAlign = 'center';
    x.fillText(MK_REGIONS[r], X + cw / 2, Y + ch + 44);
  });
  // Medidas
  if (lines.length) {
    const Y = headH + rows * (ch + label + gap);
    x.textAlign = 'left';
    x.fillStyle = '#1b1e28';
    x.font = '800 30px ' + FONT;
    x.fillText('Dise\u00F1os y medidas', M, Y + 40);
    x.font = '500 26px ' + FONT;
    x.fillStyle = '#3d4152';
    lines.forEach((t, i) => x.fillText(t, M, Y + 90 + i * 40));
  }
  return sheet;
}

// PDF de una pagina con la hoja como imagen (sin librerias).
async function mkPdfFromCanvas(cv) {
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('jpeg');
  const data = new Uint8Array(await blob.arrayBuffer());
  const land = cv.width > cv.height;
  const pw = land ? 841.89 : 595.28, ph = land ? 595.28 : 841.89, mg = 24;
  const sc = Math.min((pw - mg * 2) / cv.width, (ph - mg * 2) / cv.height);
  const dw = cv.width * sc, dh = cv.height * sc, dx = (pw - dw) / 2, dy = (ph - dh) / 2;
  const enc = s => new TextEncoder().encode(s);
  const parts = [], offs = [];
  let len = 0;
  const push = b => { parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(enc(n + ' 0 obj\n' + body + '\nendobj\n')); };
  push(enc('%PDF-1.4\n%âãÏÓ\n'));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw.toFixed(2) + ' ' + ph.toFixed(2) + '] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>');
  const content = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + dx.toFixed(2) + ' ' + dy.toFixed(2) + ' cm /Im0 Do Q';
  obj(4, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
  offs[5] = len;
  push(enc('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + data.length + ' >>\nstream\n'));
  push(data);
  push(enc('\nendstream\nendobj\n'));
  const xref = len;
  let t = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) t += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(enc(t + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF'));
  return new Blob(parts, { type: 'application/pdf' });
}

let mkExporting = false;
async function mkExportAll(kind) {
  if (!mk || !mk.shirt) { alert('El visor 3D todavia no esta listo.'); return; }
  if (mkExporting) return;
  mkExporting = true;
  mkToast('Preparando todas las vistas…');
  try {
    const meta = mkMetaRead();
    const sheet = await mkBuildSheet();
    const base = 'Mockup_' + mkSlug(meta.cliente || meta.nombre || (mkState.custom ? 'Personalizado' : colores[mkState.color])) + '_' + mkSlug(tallas[mkState.talla]);
    if (kind === 'pdf') {
      await exportFile(await mkPdfFromCanvas(sheet), base + '.pdf', 'application/pdf');
    } else {
      const blob = await new Promise(r => sheet.toBlob(r, 'image/png'));
      if (!blob) throw new Error('png');
      await exportFile(blob, base + '.png', 'image/png');
    }
  } catch (e) {
    console.error(e);
    alert('No se pudo crear el archivo con todas las vistas.');
  } finally {
    mkExporting = false;
    if (typeof hideToast === 'function') hideToast();
  }
}

// ---------- Guardar: borrador automatico y mockups guardados (IndexedDB, via store) ----------
function mkChanged() {
  mkState.dirty = true;
  clearTimeout(mkDraftTimer);
  mkDraftTimer = setTimeout(mkSaveDraft, 1200);
}

function mkSerialize() {
  const imgs = [];
  const idx = s => { let i = imgs.indexOf(s); if (i < 0) { imgs.push(s); i = imgs.length - 1; } return i; };
  return {
    v: 1, color: mkState.color, custom: mkState.custom, talla: mkState.talla, tipo: mkState.tipo, nextId: mkState.nextId,
    decals: mkState.decals.map(d => ({
      id: d.id, n: d.n, i: idx(d.src), region: d.region, u: d.u, v: d.v, wcm: d.wcm, rot: d.rot,
      locked: !!d.locked, flipX: !!d.flipX, flipY: !!d.flipY, bg: d.bg || null
    })),
    imgs
  };
}

function mkSaveDraft() {
  mkDraftTimer = 0;
  try {
    if (!mkState.decals.length && !mkState.curId && !mkState.dirty) { store.removeItem('valyra_mk_draft'); return; }
    const data = mkSerialize();
    data.meta = mkMetaRead();
    data.curId = mkState.curId;
    saveStorage('valyra_mk_draft', data);
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && mkDraftTimer) { clearTimeout(mkDraftTimer); mkSaveDraft(); }
});
window.addEventListener('pagehide', () => { if (mkDraftTimer) { clearTimeout(mkDraftTimer); mkSaveDraft(); } });

// Reconstruye el estado a partir de datos guardados (decodifica las imagenes y reaplica "quitar fondo")
async function mkRestoreData(data) {
  const ims = await Promise.all((data.imgs || []).map(mkLoadImg));
  const decals = [];
  (data.decals || []).forEach(o => {
    const im = ims[o.i];
    if (!im) return;
    const d = {
      id: o.id, n: o.n, img: im, orig: im, src: data.imgs[o.i], region: MK_REGIONS[o.region] ? o.region : 'front',
      u: Number(o.u) || 0, v: Number(o.v) || 0, wcm: Number(o.wcm) || 10, rot: Number(o.rot) || 0,
      locked: !!o.locked, flipX: !!o.flipX, flipY: !!o.flipY, bg: null, sample: null
    };
    if (o.bg) {
      const c = mkRemoveBg(im, o.bg.tol, !!o.bg.inner);
      if (c) mkApplyBg(d, { tol: o.bg.tol, inner: !!o.bg.inner }, c);
    }
    decals.push(d);
  });
  return decals;
}

// Pone en pantalla un mockup (guardado o borrador)
async function mkApplyData(data, meta, curId) {
  const decals = await mkRestoreData(data);
  const talla = mkClamp(Number(data.talla) || 0, 0, mkPecho.length - 1);
  mkState.decals = [];
  mkState.sel = null;
  mkState.color = mkClamp(Number(data.color) || 0, 0, mkHex.length - 1);
  mkState.custom = typeof data.custom === 'string' && /^#[0-9a-f]{6}$/i.test(data.custom) ? data.custom : null;
  if (mk && mk.shirt && talla !== mkState.talla) { mkState.talla = talla; mkBuildShirt(); } else mkState.talla = talla;
  mkState.decals = decals;
  mkState.nextId = Math.max(Number(data.nextId) || 1, decals.reduce((a, d) => Math.max(a, d.id), 0) + 1);
  mkState.sel = decals.length ? decals[decals.length - 1].id : null;
  mkState.tipo = typeof data.tipo === 'string' && tiposPrenda.indexOf(data.tipo) >= 0 ? data.tipo : 'Playera Cuello Redondo Manga Corta';
  mkState.pick = false;
  mkState.curId = curId || null;
  mkState.meta = { nombre: (meta && meta.nombre) || '', cliente: (meta && meta.cliente) || '', cotId: (meta && meta.cotId) || '' };
  mkResetHistory();
  const c = document.getElementById('mkCustom');
  if (c) c.value = mkFill();
  mkMetaWrite(mkState.meta);
  mkFillQuotes();
  mkRefresh();
}

// Al abrir Mockups por primera vez en esta sesion, vuelve a poner lo que habia antes de cerrar la app
function mkBootDraft() {
  if (mkState.booted) return mkState.booted;
  mkState.booted = (async () => {
    let data = null;
    try { data = JSON.parse(store.getItem('valyra_mk_draft') || 'null'); } catch (e) {}
    if (!data || !Array.isArray(data.decals) || !Array.isArray(data.imgs)) return;
    if (mkState.decals.length) return;
    let curId = data.curId || null;
    if (curId && !mkLoadIndex().some(m => m.id === curId)) curId = null;
    await mkApplyData(data, data.meta, curId);
    mkState.dirty = !!(data.decals.length);
    if (curId) mkState.dirty = false;
  })().catch(() => {});
  return mkState.booted;
}

function mkLoadIndex() {
  try {
    const v = JSON.parse(store.getItem('valyra_mockups') || '[]');
    return Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && x.id) : [];
  } catch (e) { return []; }
}

// Datos del mockup: nombre, cliente y cotizacion a la que esta ligado
function mkMetaRead() {
  const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : null; };
  const n = g('mkName'), c = g('mkCliente'), q = g('mkCot');
  return {
    nombre: n === null ? mkState.meta.nombre : n,
    cliente: c === null ? mkState.meta.cliente : c,
    cotId: q === null ? mkState.meta.cotId : q
  };
}
function mkMetaWrite(m) {
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  s('mkName', m.nombre); s('mkCliente', m.cliente);
  mkFillQuotes(m.cotId);
  const cur = document.getElementById('mkCurLabel');
  if (cur) {
    const e = mkState.curId && mkLoadIndex().find(x => x.id === mkState.curId);
    cur.textContent = e ? 'Editando mockup guardado: ' + e.nombre : 'Mockup nuevo (sin guardar). Se conserva solo, pero toca Guardar para tenerlo en la lista.';
  }
}
function mkMetaChange(source) {
  if (source === 'cot') {
    const q = quoteHistory.find(x => x.id === document.getElementById('mkCot').value);
    const cli = document.getElementById('mkCliente');
    if (q && cli && !cli.value.trim() && q.cliente && q.cliente !== 'Cliente') cli.value = q.cliente;
  }
  if (source === 'cliente') mkFillQuotes();
  mkState.meta = mkMetaRead();
  mkChanged();
}

// Lista de cotizaciones para ligar (las del cliente escrito, o todas)
function mkFillQuotes(selected) {
  const sel = document.getElementById('mkCot');
  if (!sel || typeof quoteHistory === 'undefined') return;
  const want = selected !== undefined ? selected : sel.value;
  const cli = ((document.getElementById('mkCliente') || {}).value || '').trim().toLowerCase();
  let list = quoteHistory.filter(q => q.status !== 'cancelado' && (!cli || (q.cliente || '').toLowerCase() === cli));
  if (want && !list.some(q => q.id === want)) { const w = quoteHistory.find(q => q.id === want); if (w) list = [w].concat(list); }
  sel.innerHTML = '<option value="">Sin cotizacion</option>' + list.slice(0, 80).map(q =>
    `<option value="${esc(q.id)}">${esc(q.cliente || 'Cliente')} · ${esc(q.fecha || '')} · ${money(q.total || 0)}</option>`).join('');
  sel.value = list.some(q => q.id === want) ? want : '';
}

function mkThumb() {
  try {
    if (!mk || !mk.shirt) return '';
    const cap = mkCapture([{ yaw: 0 }], 300, 320)[0];
    return cap.toDataURL('image/jpeg', 0.8);
  } catch (e) { return ''; }
}

async function mkSave(asCopy) {
  if (!mkState.decals.length && !(await uiConfirm('Este mockup todavia no tiene imagenes. ¿Guardarlo de todos modos?'))) return;
  const meta = mkMetaRead();
  mkState.meta = meta;
  const idx = mkLoadIndex();
  const id = (!asCopy && mkState.curId) || ('m' + Date.now().toString(36) + Math.random().toString(16).slice(2, 6));
  const quote = meta.cotId && quoteHistory.find(q => q.id === meta.cotId);
  const nombre = meta.nombre || (meta.cliente ? 'Mockup de ' + meta.cliente : 'Mockup ' + hoy());
  const data = mkSerialize();
  data.meta = { nombre, cliente: meta.cliente, cotId: meta.cotId };
  saveStorage('valyra_mk_' + id, data);
  const entry = {
    id, nombre, cliente: meta.cliente, cotId: meta.cotId, cotLabel: quote ? (quote.fecha || '') + ' · ' + money(quote.total || 0) : '',
    fecha: hoy(), ts: Date.now(), color: mkState.color, custom: mkState.custom, talla: mkState.talla, n: mkState.decals.length, thumb: mkThumb()
  };
  const at = idx.findIndex(m => m.id === id);
  if (at >= 0) idx[at] = entry; else idx.unshift(entry);
  saveStorage('valyra_mockups', idx);
  mkState.curId = id;
  mkState.dirty = false;
  mkState.meta.nombre = nombre;
  if (meta.cliente && typeof autoAddCliente === 'function') autoAddCliente(meta.cliente);
  mkMetaWrite(mkState.meta);
  mkSaveDraft();
  mkRenderSaved();
  mkToast('Mockup guardado');
}

async function mkOpen(id) {
  const e = mkLoadIndex().find(m => m.id === id);
  let data = null;
  try { data = JSON.parse(store.getItem('valyra_mk_' + id) || 'null'); } catch (x) {}
  if (!e || !data) { alert('No se encontro este mockup.'); return false; }
  if (mkState.dirty && mkState.decals.length && id !== mkState.curId &&
      !(await uiConfirm('¿Abrir este mockup? Lo que no hayas guardado del actual se perdera.'))) return false;
  await mkApplyData(data, data.meta || e, id);
  mkState.dirty = false;
  mkSaveDraft();
  mkRenderSaved();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return true;
}

async function mkSendSaved(id) {
  if (await mkOpen(id)) {
    await new Promise(r => setTimeout(r, 250));
    mkExportAll('pdf');
  }
}

async function mkDelete(id) {
  if (!(await uiConfirm('¿Eliminar este mockup guardado?'))) return;
  store.removeItem('valyra_mk_' + id);
  saveStorage('valyra_mockups', mkLoadIndex().filter(m => m.id !== id));
  if (mkState.curId === id) { mkState.curId = null; mkMetaWrite(mkState.meta); mkChanged(); }
  mkRenderSaved();
}

async function mkNew() {
  if (mkState.dirty && mkState.decals.length && !(await uiConfirm('¿Empezar un mockup nuevo? Lo que no hayas guardado se perdera.'))) return;
  mkState.decals = [];
  mkState.sel = null;
  mkState.pick = false;
  mkState.curId = null;
  mkState.meta = { nombre: '', cliente: '', cotId: '' };
  mkState.dirty = false;
  mkResetHistory();
  mkMetaWrite(mkState.meta);
  mkRefresh();
  try { store.removeItem('valyra_mk_draft'); } catch (e) {}
}

function mkRenderSaved() {
  const box = document.getElementById('mkSaved');
  if (!box) return;
  const q = ((document.getElementById('mkSearch') || {}).value || '').trim().toLowerCase();
  const list = mkLoadIndex().filter(m => (m.nombre + ' ' + (m.cliente || '') + ' ' + (m.cotLabel || '')).toLowerCase().indexOf(q) >= 0)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  box.innerHTML = list.map(m => `
    <div style="padding:10px 0;border-top:1px solid var(--border)">
      <div style="display:flex;gap:10px;align-items:center">
        ${m.thumb ? `<img src="${esc(m.thumb)}" alt="" style="width:62px;height:66px;border-radius:10px;object-fit:cover;background:#eef1f6;flex:none">` : `<span style="width:62px;height:66px;border-radius:10px;background:${esc(m.custom || mkHex[m.color] || '#eef1f6')};flex:none"></span>`}
        <div style="min-width:0;flex:1">
          <b>${esc(m.nombre)}</b>${m.id === mkState.curId ? ' <small style="color:#6d5dfc;font-weight:800">abierto</small>' : ''}<br>
          <small style="color:var(--muted)">${esc(m.cliente || 'Sin cliente')} · ${esc(m.fecha || '')} · ${m.n || 0} imágenes</small>
          ${m.cotLabel ? `<br><small style="color:var(--muted)">Cotización ${esc(m.cotLabel)}</small>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-small btn-light" onclick="mkOpen('${esc(m.id)}')">Abrir</button>
        <button class="btn btn-small btn-green" onclick="mkSendSaved('${esc(m.id)}')">Enviar PDF</button>
        <button class="btn btn-small btn-danger" onclick="mkDelete('${esc(m.id)}')">Eliminar</button>
      </div>
    </div>`).join('') || `<p style="color:var(--muted);font-size:12px;margin:8px 0 0">${q ? 'Ningún mockup coincide.' : 'Todavía no hay mockups guardados.'}</p>`;
}

// Usado desde Clientes y Cotizaciones: "cuantos mockups tiene" y "abrir la lista de ese cliente"
function mkCountFor(o) {
  try {
    return mkLoadIndex().filter(m => (o.cotId && m.cotId === o.cotId) ||
      (!o.cotId && o.cliente && (m.cliente || '').toLowerCase() === String(o.cliente).toLowerCase())).length;
  } catch (e) { return 0; }
}
function mkOpenFor(o) {
  showTab('mock');
  const s = document.getElementById('mkSearch');
  if (s) s.value = o.cliente || '';
  mkRenderSaved();
  const b = document.getElementById('mkSaved');
  if (b && b.scrollIntoView) setTimeout(() => b.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
}
