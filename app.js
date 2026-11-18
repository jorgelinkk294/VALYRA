'use strict';
const APP_VERSION = self.VALYRA_VERSION || '0';

// ---------- Diálogos propios (en lugar de alert/confirm del navegador) ----------
let dlgQueue = Promise.resolve();
function uiDialog(msg, withCancel) {
  const run = () => new Promise(resolve => {
    const box = document.getElementById('dlg');
    document.getElementById('dlgMsg').textContent = String(msg);
    const ok = document.getElementById('dlgOk');
    const no = document.getElementById('dlgNo');
    no.style.display = withCancel ? '' : 'none';
    const done = v => { box.style.display = 'none'; ok.onclick = no.onclick = null; resolve(v); };
    ok.onclick = () => done(true);
    no.onclick = () => done(false);
    box.style.display = 'block';
    ok.focus();
  });
  const p = dlgQueue.then(run);
  dlgQueue = p.catch(() => {});
  return p;
}
function uiAlert(msg) { return uiDialog(msg, false); }
function uiConfirm(msg) { return uiDialog(msg, true); }
window.alert = msg => { uiAlert(msg); };
const DEFAULT_LOGO = document.getElementById('splashLogo').src;

let productos = [];
let movs = [];
let precios = [];
let quoteHistory = [];
let logo = '';
let costoDTF = 0;

let curTalla = 'M';
let curPrenda = 'Negro';
let curTipo = 'Playera Cuello Redondo Manga Corta';
let myChart = null;
let editingProductIndex = null;

function loadArray(key) {
  try {
    const v = JSON.parse(store.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
  } catch (e) { return []; }
}
movs = loadArray('valyra_v7');
precios = loadArray('valyra_precios');
quoteHistory = loadArray('valyra_cotizaciones');
try { logo = store.getItem('valyra_logo') || ''; } catch (e) { logo = ''; }
try { costoDTF = Number(store.getItem('valyra_dtf')) || 0; } catch (e) { costoDTF = 0; }

let brand = { name: 'VALYRA', sub: 'Cotizaciones y finanzas', info: 'TIJUANA B.C.' };
try {
  const savedBrand = JSON.parse(store.getItem('valyra_brand') || 'null');
  if (savedBrand && typeof savedBrand === 'object') brand = { ...brand, ...savedBrand };
} catch (e) {}

const tallas = [
  'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL',
  'S Mujer', 'M Mujer', 'L Mujer',
  'S Hombre', 'M Hombre', 'L Hombre',
  '8 Ni\u00F1o', '10 Ni\u00F1o', '12 Ni\u00F1o', '14 Ni\u00F1o',
  '0-3M', '6-12M', 'Unitalla'
];

const colores = [
  'Blanco', 'Perla', 'Jaspe', 'Carb\u00F3n', 'Oxford', 'Negro',
  'Petr\u00F3leo', 'Marino', 'Rey', 'Celeste', 'Turquesa', 'Aqua',
  'Menta', 'Perry', 'Lim\u00F3n', 'Bandera', 'Militar', 'Kaki',
  'Tabaco', 'Canario', 'Naranja', 'Rojo', 'Cherry', 'Heliconia',
  'Flavina', 'Salm\u00F3n', 'Rosa', 'Morado', 'Naranja Ne\u00F3n',
  'Rosa Ne\u00F3n', 'Verde Ne\u00F3n'
];

const tiposPrenda = [
  'Playera Cuello V',
  'Playera Premium',
  'Playera Tipo Polo',
  'Playera Cuello Redondo Manga Larga',
  'Playera Sublimar',
  'Playera Cuello Redondo Manga Corta',
  'Playera Deportiva',
  'Playera Bold',
  'Camiseta',
  'Deportiva',
  'Camisa Manga Larga',
  'Sudadera Unisex Premium Cuello Redondo',
  'Sudadera Unisex Premium Capucha y Cangurera',
  'Sudadera Unisex Premium Capucha y Cierre'
];

function money(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let storageWarned = false;
function warnStorage() {
  if (storageWarned) return;
  storageWarned = true;
  alert('No se pudo guardar: el almacenamiento est\u00E1 lleno o bloqueado. Haz un respaldo en M\u00E1s > Respaldo y libera espacio.');
}
store.onError = warnStorage;
function saveStorage(key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch (e) { warnStorage(); }
}

function persistMovs() {
  saveStorage('valyra_v7', movs);
}

function savePrecios() {
  saveStorage('valyra_precios', precios);
}

function saveQuoteHistory() {
  saveStorage('valyra_cotizaciones', quoteHistory);
}

function saveDTF() {
  costoDTF = Number(document.getElementById('costoDTF').value) || 0;
  try { store.setItem('valyra_dtf', String(costoDTF)); } catch (e) {}
}

function renderHeaderLogo() {
  const mark = document.getElementById('brandMark');
  if (!mark) return;

  document.getElementById('brandName').textContent = brand.name;
  document.getElementById('brandSub').textContent = brand.sub;
  document.getElementById('footerNote').innerHTML = esc(brand.name) + ' \u00B7 Tus datos se guardan en este dispositivo. <span class="app-version">v' + APP_VERSION + '</span>';
  document.title = brand.name + ' | Gesti\u00F3n de cotizaciones';

  if (logo || DEFAULT_LOGO) {
    mark.innerHTML = `<img src="${logo || DEFAULT_LOGO}" alt="Logo">`;
    mark.classList.add('has-logo');
  } else {
    mark.textContent = (brand.name || 'V').charAt(0).toUpperCase();
    mark.classList.remove('has-logo');
  }
}

const THEMES = ['aventura', 'light', 'dark', 'navidad', 'halloween'];
const THEME_ICON = { aventura: '\u2693', light: '\u25D0', dark: '\u25D1', navidad: '\uD83C\uDF84', halloween: '\uD83C\uDF83' };
const THEME_COLOR = { aventura: '#2a9fd6', navidad: '#b3202e', halloween: '#d9590c' };

function applyTheme(mode) {
  // Halloween es un tema oscuro: usa "dark" para que las gráficas y los colores base también se oscurezcan.
  document.body.classList.toggle('dark', mode === 'dark' || mode === 'halloween');
  document.body.classList.toggle('adventure', mode === 'aventura');
  document.body.classList.toggle('xmas', mode === 'navidad');
  document.body.classList.toggle('halloween', mode === 'halloween');
  document.getElementById('themeButton').textContent = THEME_ICON[mode];
  document.querySelector('meta[name="theme-color"]').content = THEME_COLOR[mode] || '#6d5dfc';
}

function currentTheme() {
  let mode = 'aventura';
  try { mode = store.getItem('valyra_theme') || 'aventura'; } catch (e) {}
  return THEMES.indexOf(mode) >= 0 ? mode : 'aventura';
}

function toggleTheme() {
  const mode = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  try { store.setItem('valyra_theme', mode); } catch (e) {}
  applyTheme(mode);
  if (!document.getElementById('tabFin').classList.contains('hidden')) drawChart();
}

function loadTheme() { applyTheme(currentTheme()); }

// ---------- Gesto / boton "atras" de Android ----------
// Cada seccion y cada ventana abierta usan el historial del navegador, asi que el gesto de las orillas
// cierra la ventana, o regresa al Inicio; estando en Inicio, sale de la app como siempre.
const TAB_NAMES = ['home', 'cot', 'fin', 'pre', 'reg', 'mock', 'mas'];
let curTab = 'home';
let modalPushed = 0;
let stackHasHome = false;
let histBusy = Promise.resolve();
let popWaiter = null;

function histOp(fn) { histBusy = histBusy.then(fn).catch(() => {}); return histBusy; }

function histGo(n) {
  return new Promise(resolve => {
    const w = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(() => { if (popWaiter === w) popWaiter = null; resolve(); }, 700);
    popWaiter = w;
    history.go(n);
  });
}

function visibleModals() {
  return Array.from(document.querySelectorAll('.modal')).filter(m => getComputedStyle(m).display !== 'none');
}

async function syncModalEntries() {
  const want = visibleModals().length;
  while (modalPushed < want) { history.pushState({ modal: 1 }, ''); modalPushed++; }
  if (modalPushed > want) {
    const extra = modalPushed - want;
    modalPushed = want;
    await histGo(-extra);
  }
}

async function reconcileTab(tab) {
  await syncModalEntries();
  const st = history.state && history.state.tab;
  if (st === tab) return;
  if (tab === 'home') {
    if (stackHasHome) { stackHasHome = false; await histGo(-1); }
    else history.replaceState({ tab: 'home' }, '');
  } else if (!st || st === 'home') {
    history.pushState({ tab }, '');
    stackHasHome = true;
  } else {
    history.replaceState({ tab }, '');
  }
}

function closeTopModal() {
  const open = visibleModals();
  if (!open.length) return;
  const z = m => parseInt(getComputedStyle(m).zIndex, 10) || 0;
  const top = open.reduce((a, b) => (z(b) >= z(a) ? b : a));
  if (top.id === 'dlg') {
    const no = document.getElementById('dlgNo');
    (no.style.display !== 'none' ? no : document.getElementById('dlgOk')).click();
  } else if (top.id === 'updModal') {
    updateLater();
  } else {
    closeM(top.id);
  }
}

window.addEventListener('popstate', e => {
  if (popWaiter) { const w = popWaiter; popWaiter = null; w(); return; }   // retroceso hecho por la app
  if (modalPushed > 0) { modalPushed--; closeTopModal(); return; }          // gesto: cierra la ventana abierta
  if (visibleModals().length) {                                              // ventana sin entrada propia
    closeTopModal();
    history.pushState({ tab: curTab }, '');
    stackHasHome = curTab !== 'home';
    return;
  }
  const st = e.state && e.state.tab;
  if (st && TAB_NAMES.indexOf(st) >= 0) { stackHasHome = false; showTab(st, true); }
});

const modalWatcher = new MutationObserver(() => histOp(syncModalEntries));
document.querySelectorAll('.modal').forEach(m => modalWatcher.observe(m, { attributes: true, attributeFilter: ['style', 'class'] }));

function showTab(tab, fromPop) {
  const changed = tab !== curTab;
  curTab = tab;
  const map = {home: 'Home', cot: 'Cot', fin: 'Fin', pre: 'Pre', reg: 'Reg', mock: 'Mock', mas: 'Mas'};
  Object.entries(map).forEach(([key, suffix]) => {
    document.getElementById('tab' + suffix).classList.toggle('hidden', key !== tab);
    const btn = document.getElementById('b' + suffix);
    if (btn) btn.classList.toggle('active', key === tab);
    if (btn && key === tab && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'center' });
  });

  const sec = document.getElementById('tab' + map[tab]);
  if (tab === 'home') {
    const grid = document.getElementById('homeGrid');
    grid.classList.remove('play');
    void grid.offsetWidth;            // reinicia la animacion de entrada
    grid.classList.add('play');
  } else {
    sec.classList.remove('tab-enter');
    void sec.offsetWidth;
    sec.classList.add('tab-enter');
  }

  if (tab === 'fin') {
    renderFin();
    kpis();
    requestAnimationFrame(drawChart);
  }
  if (tab === 'pre') renderPrecios();
  if (tab === 'reg') renderRegistros();
  if (tab === 'mock') mkDraw();
  if (tab === 'mas') renderMas();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (!fromPop && changed) histOp(() => reconcileTab(tab));
}

function precioDe(nombre, talla) {
  const n = String(nombre).toLowerCase();
  const t = String(talla || '').toLowerCase();

  const exact = precios.find(x =>
    String(x.nombre || '').toLowerCase() === n &&
    String(x.talla || '').toLowerCase() === t &&
    Boolean(x.talla)
  );

  if (exact) return exact;

  return precios.find(x =>
    String(x.nombre || '').toLowerCase() === n && !x.talla
  );
}

function setSuggestedPrice() {
  const item = precioDe(curTipo, curTalla);
  if (item) document.getElementById('pPrecio').value = item.precio;
}

function openSize() {
  const box = document.getElementById('sizeList');
  box.innerHTML = tallas.map(t =>
    `<button class="opt" type="button" onclick="setSize('${esc(t)}')">${esc(t)}</button>`
  ).join('');
  document.getElementById('sizeModal').style.display = 'block';
}

function setSize(talla) {
  curTalla = talla;
  document.getElementById('btnTalla').textContent = talla;
  setSuggestedPrice();
  closeM('sizeModal');
}

function openColor() {
  document.getElementById('colorTitle').textContent = 'Selecciona color';
  document.getElementById('colorList').innerHTML = colores.map((color, i) =>
    `<button class="opt" type="button" onclick="setColor(${i})">${esc(color)}</button>`
  ).join('');
  document.getElementById('colorModal').style.display = 'block';
}

function setColor(index) {
  curPrenda = colores[index];
  document.getElementById('btnPrenda').textContent = curPrenda;
  closeM('colorModal');
}

function openTipo() {
  document.getElementById('colorTitle').textContent = 'Selecciona tipo de prenda';
  document.getElementById('colorList').innerHTML = tiposPrenda.map((tipo, i) =>
    `<button class="opt" type="button" onclick="setTipo(${i})">${esc(tipo)}</button>`
  ).join('');
  document.getElementById('colorModal').style.display = 'block';
}

function setTipo(index) {
  curTipo = tiposPrenda[index];
  document.getElementById('btnTipo').textContent = curTipo;
  setSuggestedPrice();
  closeM('colorModal');
}

function closeM(id) {
  document.getElementById(id).style.display = 'none';
  if (id === 'fileModal') releasePendingFile();
}

function modalBackdrop(event, id) {
  if (event.target.id === id) closeM(id);
}

function setProductButtonState() {
  const btn = document.getElementById('addProductBtn');
  if (editingProductIndex !== null) {
    btn.textContent = '\u2713 Actualizar producto';
    btn.classList.remove('btn-accent');
    btn.classList.add('btn-light');
  } else {
    btn.textContent = '\uFF0B Agregar producto';
    btn.classList.remove('btn-light');
    btn.classList.add('btn-accent');
  }
}

function prepareEditProduct(index) {
  const p = productos[index];
  if (!p) return;

  editingProductIndex = index;

  curTipo = p.name;
  curTalla = p.talla;
  curPrenda = p.prenda;

  document.getElementById('btnTipo').textContent = p.name;
  document.getElementById('btnTalla').textContent = p.talla;
  document.getElementById('btnPrenda').textContent = p.prenda;

  document.getElementById('pCant').value = p.cant;
  document.getElementById('pPrecio').value = p.precio - (Number(p.extra) || 0);
  curPos = Array.isArray(p.pos) ? p.pos.slice() : [];
  renderPosChips();

  setProductButtonState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addToQuote() {
  const cant = Math.max(1, Number(document.getElementById('pCant').value) || 1);
  const basePrecio = Number(document.getElementById('pPrecio').value) || 0;
  const extra = curPos.reduce((a, n) => { const p = posiciones.find(x => x.n === n); return a + (p ? Number(p.p) || 0 : 0); }, 0);
  const precio = basePrecio + extra;

  if (precio <= 0) {
    alert('Escribe un precio v\u00E1lido.');
    return;
  }

  const item = precioDe(curTipo, curTalla);

  const product = {
    name: curTipo,
    talla: curTalla,
    prenda: curPrenda,
    cant,
    precio,
    extra,
    pos: curPos.slice(),
    costo: item ? Number(item.costo) || 0 : 0,
    dtf: costoDTF
  };

  const stock = inv.find(x => x.color === curPrenda && x.talla === curTalla);
  if (stock && cant > stock.cant) {
    showToast('Solo hay ' + stock.cant + ' en inventario de ' + curPrenda + ' ' + curTalla);
    setTimeout(hideToast, 3500);
  }

  if (editingProductIndex !== null) {
    productos[editingProductIndex] = product;
    editingProductIndex = null;
  } else {
    productos.push(product);
  }

  setProductButtonState();
  renderQuote();
}

function delRow(index) {
  if (editingProductIndex === index) {
    editingProductIndex = null;
    setProductButtonState();
  }
  productos.splice(index, 1);
  renderQuote();
}

async function clearQuote() {
  if (!(await uiConfirm('\u00BFBorrar todos los productos de esta cotizaci\u00F3n?'))) return;
  productos = [];
  editingProductIndex = null;
  setProductButtonState();
  renderQuote();
}

function renderQuote() {
  const tb = document.getElementById('tb');
  const empty = document.getElementById('quoteEmpty');
  const table = document.getElementById('quoteTable');

  empty.classList.toggle('hidden', productos.length > 0);
  table.classList.toggle('hidden', productos.length === 0);

  tb.innerHTML = productos.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <b>${esc(p.name)}</b><br>
        <span class="badge">${esc(p.talla)}</span> <span>${esc(p.prenda)}</span>${posHtml(p)}
      </td>
      <td>${p.cant}</td>
      <td>${money(p.precio)}</td>
      <td><b>${money(p.cant * p.precio)}</b></td>
      <td>
        <div style="display:flex;gap:4px;align-items:center">
          <button class="btn btn-small btn-light" onclick="prepareEditProduct(${i})" aria-label="Editar producto">Editar</button>
          <button class="btn btn-small btn-danger" onclick="delRow(${i})" aria-label="Eliminar producto">\u00D7</button>
        </div>
      </td>
    </tr>
  `).join('');

  calc();
}

function getTotals() {
  const subtotal = productos.reduce((sum, p) => sum + Number(p.cant) * Number(p.precio), 0);
  const descuento = Math.min(100, Math.max(0, Number(document.getElementById('desc').value) || 0));
  const envio = Math.max(0, Number(document.getElementById('envio').value) || 0);
  const descuentoMonto = subtotal * descuento / 100;
  return { subtotal, descuento, envio, descuentoMonto, total: subtotal - descuentoMonto + envio };
}

function calc() {
  const t = getTotals();
  document.getElementById('sub').textContent = money(t.subtotal);
  document.getElementById('tot').textContent = money(t.total);
  document.getElementById('topTotal').textContent = money(t.total);
  document.getElementById('saldo').textContent = money(saldoDe(t.total));
}

// ---------- Diseños de cotización ----------
const QUOTE_DESIGNS = {
  clasico:  { name: 'Clásico', font: 'Arial,sans-serif', bg: '#fff', ink: '#111827', mute: '#667085', accent: '#111827', rule: '#e5e7eb', zebra: '' },
  moderno:  { name: 'Moderno', font: 'Arial,sans-serif', bg: '#fff', ink: '#1f2340', mute: '#6b7194', accent: '#6d5dfc', rule: '#e6e3ff', zebra: '#f6f4ff', band: 'linear-gradient(135deg,#7c6cff,#4237bf)', bandInk: '#fff', th: true },
  minimal:  { name: 'Minimal', font: 'Helvetica,Arial,sans-serif', bg: '#fff', ink: '#222', mute: '#9aa0a6', accent: '#222', rule: '#eee', zebra: '', light: true, title: true },
  elegante: { name: 'Elegante', font: 'Georgia,serif', bg: '#fffdf8', ink: '#1c1917', mute: '#78716c', accent: '#b8892b', rule: '#eadfc8', zebra: '#faf5e8', band: '#1c1917', bandInk: '#e7c873', th: true, title: true },
  dtf:      { name: 'Color DTF', font: 'Arial,sans-serif', bg: '#fff', ink: '#2a1a24', mute: '#8b6b7b', accent: '#ec4899', rule: '#fde2ee', zebra: '#fff5f9', band: 'linear-gradient(120deg,#ec4899,#f59e0b)', bandInk: '#fff', th: true },
  mapa:     { name: 'Mapa del tesoro', font: 'Georgia,serif', bg: '#f4e4bb', ink: '#3a2614', mute: '#8a6b45', accent: '#9c3b1b', rule: '#d9c08a', zebra: '#ecd9a8', frame: '5px double #7a4a21', title: true }
};
let qDesign = 'clasico';
try { qDesign = store.getItem('valyra_qdesign') || 'clasico'; } catch (e) {}
if (!QUOTE_DESIGNS[qDesign]) qDesign = 'clasico';

function buildHTML(designKey) {
  const d = QUOTE_DESIGNS[designKey || qDesign] || QUOTE_DESIGNS.clasico;
  const cliente = esc(document.getElementById('cliente').value || 'Cliente');
  const fecha = esc(document.getElementById('fecha').value || hoy());
  const t = getTotals();

  const rows = productos.map((p, i) => `
    <tr style="border-bottom:1px solid ${d.rule};${d.zebra && i % 2 ? 'background:' + d.zebra : ''}">
      <td style="padding:9px">${i + 1}</td>
      <td style="padding:9px"><b>${esc(p.name)}</b><br><small>${esc(p.talla)} | ${esc(p.prenda)}</small>${posHtml(p)}</td>
      <td style="padding:9px">${p.cant}</td>
      <td style="padding:9px">${money(p.precio)}</td>
      <td style="padding:9px"><b>${money(p.cant * p.precio)}</b></td>
    </tr>
  `).join('');

  const row = (a, b, extraStyle) => `<div style="display:flex;justify-content:space-between;margin-top:5px;${extraStyle || ''}"><span>${a}</span><span>${b}</span></div>`;
  const extra = [
    t.descuento > 0 ? row('Descuento (' + t.descuento + '%)', '-' + money(t.descuentoMonto)) : '',
    t.envio > 0 ? row('Env\u00EDo', money(t.envio)) : '',
    (getAnticipo(t.total) > 0 && saldoDe(t.total) > 0)
      ? row('Anticipo', money(getAnticipo(t.total))) + row('<b>Saldo pendiente</b>', '<b>' + money(saldoDe(t.total)) + '</b>')
      : ''
  ].join('');

  const sub = d.band ? 'rgba(255,255,255,.85)' : d.mute;
  const headBox = d.band
    ? `background:${d.band};color:${d.bandInk};padding:16px;border-radius:12px`
    : `border-bottom:${d.light ? 1 : 3}px solid ${d.accent};padding-bottom:12px`;
  const logoImg = `<img src="${logo || DEFAULT_LOGO}" alt="Logo" style="max-width:160px;max-height:58px;object-fit:contain;${d.band ? 'background:#fff;border-radius:8px;padding:4px' : ''}">`;
  const th = d.th ? `padding:8px;background:${d.accent};color:#fff` : 'padding:7px';

  return `
    <div id="pdfArea" style="padding:18px;background:${d.bg};color:${d.ink};font-family:${d.font};${d.frame ? 'border:' + d.frame + ';' : ''}">
      ${d.title ? `<div style="font-size:10px;letter-spacing:4px;color:${d.accent};margin-bottom:8px;text-align:center">COTIZACI\u00D3N</div>` : ''}
      <div style="display:flex;justify-content:space-between;gap:14px;align-items:center;${headBox}">
        <div>
          ${(logo || DEFAULT_LOGO) ? logoImg : `<h1 style="margin:0;font-size:26px">${esc(brand.name)}</h1>`}
          <div style="font-size:11px;color:${sub};margin-top:4px">${esc(brand.info)}</div>
          <div style="font-size:12px;margin-top:8px"><b>Cliente:</b> ${cliente}<br><b>Fecha:</b> ${fecha}</div>
        </div>
        <div style="text-align:right"><div style="font-size:11px;color:${sub}">TOTAL</div><div style="font-size:24px;font-weight:900">${money(t.total)}</div></div>
      </div>
      <table style="width:100%;margin-top:14px;border-collapse:collapse">
        <thead><tr style="${d.th ? '' : 'border-bottom:2px solid ' + d.accent + ';'}text-align:left">
          <th style="${th}">#</th><th style="${th}">DESCRIPCI\u00D3N</th><th style="${th}">CANT.</th><th style="${th}">PRECIO</th><th style="${th}">TOTAL</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:14px;padding-top:10px;border-top:2px solid ${d.accent}">
        ${row('Subtotal', money(t.subtotal))}
        ${extra}
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:17px;font-weight:900;color:${d.accent}"><span>TOTAL</span><span>${money(t.total)}</span></div>
      </div>
    </div>`;
}

function renderDesignPicker() {
  document.getElementById('designPicker').innerHTML = Object.keys(QUOTE_DESIGNS).map(k => {
    const d = QUOTE_DESIGNS[k];
    return `<button type="button" class="design-chip${k === qDesign ? ' on' : ''}" onclick="setQuoteDesign('${k}')"><i style="background:${d.band || d.accent}"></i>${d.name}</button>`;
  }).join('');
}

function setQuoteDesign(k) {
  if (!QUOTE_DESIGNS[k]) return;
  qDesign = k;
  try { store.setItem('valyra_qdesign', k); } catch (e) {}
  renderDesignPicker();
  document.getElementById('livePreview').innerHTML = buildHTML();
}

function openPreview() {
  if (!productos.length) {
    alert('Agrega productos antes de revisar la cotizaci\u00F3n.');
    return;
  }
  renderDesignPicker();
  document.getElementById('livePreview').innerHTML = buildHTML();
  document.getElementById('previewModal').style.display = 'block';
}

function baseName() {
  const raw = document.getElementById('cliente').value || 'Cotizacion';
  const name = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  return brandSlug() + '_' + name + '_' + hoy();
}

let busy = false;
let pendingFile = null;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
}

function hideToast() {
  document.getElementById('toast').classList.add('hidden');
}

// El elemento debe estar dentro del documento para que html2pdf mida bien el ancho.
function withPdfElement(fn) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:700px;pointer-events:none';
  host.innerHTML = buildHTML();
  const el = host.firstElementChild;
  el.style.width = '700px';
  const prevX = window.scrollX || 0;
  const prevY = window.scrollY || 0;
  window.scrollTo(0, 0); // html2canvas sale en blanco si la pagina esta desplazada
  document.body.appendChild(host);
  return new Promise(resolve => setTimeout(resolve, 150))
    .then(() => fn(el))
    .finally(() => {
      host.remove();
      window.scrollTo(prevX, prevY);
    });
}

function makePDF() {
  return withPdfElement(el => html2pdf()
    .set({
      margin: 10,
      filename: baseName() + '.pdf',
      html2canvas: {scale: 2, useCORS: true, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff'},
      jsPDF: {unit: 'mm', format: 'a4'},
      pagebreak: {mode: ['css', 'legacy'], avoid: 'tr'}
    })
    .from(el)
    .outputPdf('blob'));
}

let lastShareError = '';

async function shareFile(blob, name, type) {
  lastShareError = '';
  if (!navigator.share) {
    lastShareError = 'navigator.share no existe en esta app';
    return false;
  }
  const types = type === 'application/pdf' ? [type, 'application/octet-stream'] : [type];

  for (const t of types) {
    const file = new File([blob], name, {type: t});
    try {
      // Se intenta compartir aunque canShare diga que no (algunos WebView lo reportan mal).
      await navigator.share({files: [file], title: 'Cotizaci\u00F3n ' + brand.name});
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      lastShareError = (e && e.name ? e.name : 'Error') + (e && e.message ? ': ' + e.message : '') +
        ' (' + t + ', ' + Math.round(blob.size / 1024) + ' KB, canShare=' +
        (navigator.canShare ? navigator.canShare({files: [file]}) : 'n/d') + ')';
    }
  }
  return false;
}

function releasePendingFile() {
  if (pendingFile) URL.revokeObjectURL(pendingFile.url);
  pendingFile = null;
}

function showFileModal(blob, name, type, title) {
  releasePendingFile();
  pendingFile = {blob, name, type, url: URL.createObjectURL(blob)};
  document.getElementById('fileModalTitle').textContent = title || 'Archivo listo';
  document.getElementById('fileModalName').textContent = name;
  document.getElementById('fileModal').style.display = 'block';
}

async function fileShare() {
  if (!pendingFile) return;
  try {
    const ok = await shareFile(pendingFile.blob, pendingFile.name, pendingFile.type);
    if (ok) closeM('fileModal');
    else alert('Este dispositivo no permite compartir este archivo desde la app.\n\nDetalle: ' + lastShareError);
  } catch (e) {
    if (e.name !== 'AbortError') alert('No se pudo abrir el men\u00FA de compartir.');
  }
}

async function exportFile(blob, name, type) {
  try {
    if (await shareFile(blob, name, type)) return;
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  if (type.indexOf('image/') === 0) {
    showImageModal(blob);
    return;
  }
  showFileModal(blob, name, type, 'Archivo listo');
}

// Sin navigator.share, la imagen se muestra para compartirla con el men\u00FA de Android (mantener presionada).
function showImageModal(blob) {
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('imgOut').src = reader.result;
    document.getElementById('imgModal').style.display = 'block';
  };
  reader.onerror = () => alert('No se pudo mostrar la imagen.');
  reader.readAsDataURL(blob);
}

async function exportPDF() {
  if (!productos.length) {
    alert('Agrega productos primero.');
    return;
  }
  if (typeof html2pdf === 'undefined') {
    printPreview();
    return;
  }
  if (!navigator.share) {
    alert('Esta app no permite compartir PDF. Se mostrar\u00E1 la cotizaci\u00F3n como imagen: mant\u00E9n presionada para compartirla o guardarla.');
    exportPNG();
    return;
  }
  if (busy) return;
  busy = true;
  showToast('Generando PDF\u2026');
  try {
    const blob = await makePDF();
    await exportFile(blob, baseName() + '.pdf', 'application/pdf');
  } catch (e) {
    console.error(e);
    printPreview();
  } finally {
    busy = false;
    hideToast();
  }
}

function printPreview() {
  if (!productos.length) {
    alert('Agrega productos primero.');
    return;
  }

  const head = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(brand.name) + '</title>' +
    '<style>body{font-family:Arial,sans-serif;padding:16px}@media print{body{padding:0}}</style></head><body>';
  const win = window.open('', '_blank');

  if (win) {
    win.document.write(head + buildHTML() + '<script>window.onload=function(){window.print()}<\/script><\/body><\/html>');
    win.document.close();
    return;
  }

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0';
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { alert('No se pudo imprimir.'); }
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
  frame.srcdoc = head + buildHTML() + '<\/body><\/html>';
}

async function exportPNG() {
  if (!productos.length) {
    alert('Agrega productos primero.');
    return;
  }
  if (typeof html2pdf === 'undefined') {
    alert('No se pudo cargar el generador de imagen (revisa tu internet).');
    return;
  }
  if (busy) return;
  busy = true;
  showToast('Generando imagen...');
  try {
    const canvas = await withPdfElement(el => html2pdf()
      .set({html2canvas: {scale: 2, useCORS: true, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff'}})
      .from(el)
      .toCanvas()
      .get('canvas'));
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo crear la imagen.');
    await exportFile(blob, baseName() + '.png', 'image/png');
  } catch (e) {
    console.error(e);
    alert('No se pudo crear la imagen.');
  } finally {
    busy = false;
    hideToast();
  }
}

function shareTextWA() {
  if (!productos.length) {
    alert('Agrega productos primero.');
    return;
  }

  const cliente = document.getElementById('cliente').value || 'Cliente';
  const t = getTotals();
  let text = `*${brand.name}* - Cotizaci\u00F3n\nCliente: ${cliente}\nFecha: ${document.getElementById('fecha').value || hoy()}\n\n`;

  productos.forEach((p, i) => {
    text += `${i + 1}. ${p.name} - Talla ${p.talla} - ${p.prenda}${p.pos && p.pos.length ? ' [' + p.pos.join(' + ') + ']' : ''} x${p.cant} = ${money(p.cant * p.precio)}\n`;
  });

  text += `\nSubtotal: ${money(t.subtotal)}`;
  if (t.descuento > 0) text += `\nDescuento (${t.descuento}%): -${money(t.descuentoMonto)}`;
  if (t.envio > 0) text += `\nEnv\u00EDo: ${money(t.envio)}`;
  text += `\n\n*TOTAL: ${money(t.total)}*\n\nGracias por cotizar con ${brand.name}`;

  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

function brandSlug() {
  return (brand.name || 'Cotizacion').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20);
}

function openBrandEdit() {
  document.getElementById('brandNameInput').value = brand.name;
  document.getElementById('brandSubInput').value = brand.sub;
  document.getElementById('brandInfoInput').value = brand.info;
  document.getElementById('brandModal').style.display = 'block';
}

function saveBrand() {
  brand = {
    name: document.getElementById('brandNameInput').value.trim() || 'VALYRA',
    sub: document.getElementById('brandSubInput').value.trim(),
    info: document.getElementById('brandInfoInput').value.trim()
  };
  saveStorage('valyra_brand', brand);
  renderHeaderLogo();
  closeM('brandModal');
}

async function removeLogo() {
  if (!logo || !(await uiConfirm('\u00BFQuitar el logo?'))) return;
  logo = '';
  try { store.removeItem('valyra_logo'); } catch (e) {}
  renderHeaderLogo();
}

function loadLogo(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = event => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 500 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      logo = canvas.toDataURL('image/png');
      try { store.setItem('valyra_logo', logo); } catch (e) {}
      renderHeaderLogo();
      alert('Logo guardado.');
      input.value = '';
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function makeQuotePayload() {
  const t = getTotals();
  return {
    id: Date.now() + '-' + Math.random().toString(16).slice(2),
    cliente: document.getElementById('cliente').value.trim() || 'Cliente',
    fecha: document.getElementById('fecha').value || hoy(),
    status: document.getElementById('quoteStatus').value || 'pendiente',
    total: t.total,
    descuento: t.descuento,
    envio: t.envio,
    anticipo: round2(getAnticipo(t.total)),
    saldo: round2(saldoDe(t.total)),
    productos: JSON.parse(JSON.stringify(productos)),
    createdAt: new Date().toISOString()
  };
}

function saveCurrentQuote(silent) {
  if (!productos.length) {
    alert('Agrega al menos un producto para guardar la cotizaci\u00F3n.');
    return;
  }
  quoteHistory.unshift(makeQuotePayload());
  saveQuoteHistory();
  renderQuoteHistory();
  if (silent !== true) alert('Cotizaci\u00F3n guardada en el historial.');
}

function duplicateCurrentQuote() {
  if (!productos.length) {
    alert('Primero agrega productos a la cotizaci\u00F3n.');
    return;
  }
  quoteHistory.unshift(makeQuotePayload());
  saveQuoteHistory();
  renderQuoteHistory();
  alert('Cotizaci\u00F3n duplicada.');
}

function loadQuoteFromHistory(id) {
  const item = quoteHistory.find(q => q.id === id);
  if (!item) return;

  productos = JSON.parse(JSON.stringify(item.productos || []));
  document.getElementById('cliente').value = item.cliente || '';
  document.getElementById('fecha').value = item.fecha || hoy();
  document.getElementById('quoteStatus').value = item.status || 'pendiente';

  document.getElementById('desc').value = Number(item.descuento) || 0;
  document.getElementById('envio').value = Number(item.envio) || 0;
  document.getElementById('anticipo').value = Number(item.saldo) > 0 ? Number(item.anticipo) || 0 : 0;
  editingProductIndex = null;
  setProductButtonState();

  renderQuote();
  showTab('cot');
}

async function deleteQuoteFromHistory(id) {
  if (!(await uiConfirm('\u00BFEliminar esta cotizaci\u00F3n del historial?'))) return;
  quoteHistory = quoteHistory.filter(q => q.id !== id);
  saveQuoteHistory();
  renderQuoteHistory();
}

function renderQuoteHistory() {
  const search = document.getElementById('quoteHistorySearch').value.trim().toLowerCase();
  const filter = document.getElementById('quoteHistoryFilter').value;
  const list = document.getElementById('quoteHistoryList');
  const empty = document.getElementById('historyEmpty');

  const visible = quoteHistory.filter(q => {
    const matchesFilter = filter === 'todos' || q.status === filter;
    const text = `${q.cliente || ''} ${q.fecha || ''} ${q.status || ''}`.toLowerCase();
    return matchesFilter && text.includes(search);
  });

  empty.classList.toggle('hidden', visible.length > 0);
  list.innerHTML = visible.map(q => `
    <div class="quote-item">
      <div class="quote-item-head">
        <div>
          <b>${esc(q.cliente || 'Cliente')}</b><br>
          <small>${esc(q.fecha || '')}</small>
        </div>
        <span class="inline-status ${statusClass(q.status)}">${esc(q.status || 'pendiente')}</span>
      </div>

      <div style="color:var(--muted);font-size:11px">
        ${Array.isArray(q.productos) ? q.productos.length : 0} productos \u00B7 ${money(q.total || 0)}${q.saldo > 0 ? ' \u00B7 Anticipo ' + money(q.anticipo) + ' \u00B7 Saldo ' + money(q.saldo) : ''}
      </div>

      <div class="quote-item-actions">
        ${q.saldo > 0 ? `<button class="btn btn-small btn-green" onclick="cobrarSaldo('${esc(q.id)}')">Cobrar saldo</button>` : ''}
        ${q.status !== 'entregado' && q.status !== 'cancelado' ? `<button class="btn btn-small btn-light" onclick="marcarEntregado('${esc(q.id)}')">Entregado</button>` : ''}
        <button class="btn btn-small btn-light" onclick="loadQuoteFromHistory('${esc(q.id)}')">Cargar</button>
        <button class="btn btn-small btn-light" onclick="duplicateCurrentQuoteFromHistory('${esc(q.id)}')">Duplicar</button>
        <button class="btn btn-small btn-danger" onclick="deleteQuoteFromHistory('${esc(q.id)}')">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function statusClass(value) {
  if (value === 'pagado') return 'status-pagado';
  if (value === 'entregado') return 'status-entregado';
  if (value === 'cancelado') return 'status-cancelado';
  return 'status-pendiente';
}

function duplicateCurrentQuoteFromHistory(id) {
  const item = quoteHistory.find(q => q.id === id);
  if (!item) return;

  const clone = JSON.parse(JSON.stringify(item.productos || []));
  const newEntry = { ...item, id: Date.now() + '-' + Math.random().toString(16).slice(2), createdAt: new Date().toISOString(), productos: clone };
  quoteHistory.unshift(newEntry);
  saveQuoteHistory();
  renderQuoteHistory();
  alert('Cotizaci\u00F3n duplicada desde el historial.');
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

async function saveVenta() {
  const t = getTotals();
  if (!productos.length || t.total <= 0) {
    alert('Agrega productos con un total v\u00E1lido antes de guardar la cotizaci\u00F3n.');
    return;
  }

  const cliente = document.getElementById('cliente').value.trim() || 'Cliente';
  const fecha = document.getElementById('fecha').value || hoy();
  const status = document.getElementById('quoteStatus').value || 'pendiente';
  const total = round2(t.total);
  const ant = round2(getAnticipo(t.total));
  const conSaldo = ant > 0 && ant < total;
  const cobrado = conSaldo ? ant : total;
  const concepto = (conSaldo ? 'Anticipo de ' : 'Venta a ') + cliente;

  if (status === 'cancelado') {
    saveCurrentQuote(true);
    showToast('Cotizaci\u00F3n cancelada guardada (no se registra venta).');
    setTimeout(hideToast, 2500);
    return;
  }

  const repetida = movs.some(m => m.tipo === 'ingreso' && m.cat === 'Venta' &&
    m.concepto === concepto && m.fecha === fecha && Number(m.monto) === cobrado);
  if (repetida && !(await uiConfirm('Ya existe una venta igual en finanzas. \u00BFGuardarla de todos modos?'))) return;

  movs.push({ fecha, tipo: 'ingreso', concepto, cat: 'Venta', monto: cobrado, status });

  let costoPrendas = 0;
  let costoImpresion = 0;
  productos.forEach(p => {
    const cant = Number(p.cant) || 0;
    let costo = Number(p.costo) || 0;
    if (!costo) {
      const item = precioDe(p.name, p.talla);
      costo = item ? Number(item.costo) || 0 : 0;
    }
    const dtf = Number(p.dtf) > 0 ? Number(p.dtf) : costoDTF;
    costoPrendas += cant * costo;
    costoImpresion += cant * dtf;
  });

  if (costoPrendas > 0) {
    movs.push({ fecha, tipo: 'egreso', concepto: 'Costo prendas - ' + cliente, cat: 'Prendas', monto: round2(costoPrendas) });
  }
  if (costoImpresion > 0) {
    movs.push({ fecha, tipo: 'egreso', concepto: 'Costo DTF - ' + cliente, cat: 'DTF', monto: round2(costoImpresion) });
  }

  autoAddCliente(cliente);
  const bajo = descontarInventario();
  persistMovs();
  saveCurrentQuote(true);
  refreshFinanceViews();
  const menu = document.querySelector('.actions-dropdown');
  if (menu) menu.open = false;
  showTab('fin');
  showToast('Venta guardada: ' + money(cobrado) + (bajo.length ? ' | Inventario bajo: ' + bajo.join(', ') : ''));
  setTimeout(hideToast, bajo.length ? 5000 : 2500);
}

function addMov() {
  const tipo = document.getElementById('mTipo').value;
  const cat = document.getElementById('mCat').value;
  const concepto = document.getElementById('mConcepto').value.trim();
  const monto = Number(document.getElementById('mMonto').value);
  const fecha = document.getElementById('mFecha').value || hoy();

  if (!concepto || !Number.isFinite(monto) || monto <= 0) {
    alert('Ingresa un concepto y un monto mayor a cero.');
    return;
  }

  movs.push({fecha, tipo, concepto, cat, monto});
  persistMovs();

  document.getElementById('mConcepto').value = '';
  document.getElementById('mMonto').value = '';

  refreshFinanceViews();
}

async function deleteMov(index) {
  if (!(await uiConfirm('\u00BFEliminar este movimiento del registro?'))) return;
  movs.splice(index, 1);
  persistMovs();
  refreshFinanceViews();
}

function refreshFinanceViews() {
  renderFin();
  renderRegistros();
  kpis();
  if (!document.getElementById('tabFin').classList.contains('hidden')) drawChart();
}

function sums() {
  const income = movs.filter(m => m.tipo === 'ingreso').reduce((sum, m) => sum + (Number(m.monto) || 0), 0);
  const expense = movs.filter(m => m.tipo === 'egreso').reduce((sum, m) => sum + (Number(m.monto) || 0), 0);
  return { income, expense, balance: income - expense };
}

function kpis() {
  const { income, expense, balance } = sums();
  document.getElementById('kIn').textContent = money(income);
  document.getElementById('kEg').textContent = money(expense);
  document.getElementById('kUt').textContent = money(balance);
  document.getElementById('kMg').textContent = (income ? (balance / income * 100).toFixed(1) : '0') + '%';
}

function renderFin() {
  const recent = movs
    .map((m, index) => ({ ...m, index }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .slice(0, 6);

  const table = document.getElementById('recentTable');
  const empty = document.getElementById('recentEmpty');
  table.classList.toggle('hidden', recent.length === 0);
  empty.classList.toggle('hidden', recent.length > 0);

  document.getElementById('tbRecent').innerHTML = recent.map(m => `
    <tr>
      <td>${esc(m.fecha || '')}</td>
      <td>${m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</td>
      <td>${esc(m.concepto || '')}</td>
      <td class="${m.tipo === 'ingreso' ? 'positive' : 'negative'}">${m.tipo === 'ingreso' ? '+' : '\u2212'}${money(m.monto)}</td>
    </tr>
  `).join('');
}

function getMonthly() {
  const monthly = {};
  movs.forEach(m => {
    const month = String(m.fecha || 'Sin fecha').slice(0, 7);
    if (!monthly[month]) monthly[month] = { income: 0, expense: 0 };
    if (m.tipo === 'ingreso') monthly[month].income += Number(m.monto) || 0;
    else monthly[month].expense += Number(m.monto) || 0;
  });
  return monthly;
}

function chartConfig(monthly, dark, forExport) {
  const labels = Object.keys(monthly).sort();
  const txt = dark ? '#eef2f8' : '#172033';
  const mut = dark ? '#9da9bb' : '#748096';
  const grid = dark ? '#2b374a' : '#e5e9f0';
  const options = {
    maintainAspectRatio: false,
    responsive: !forExport,
    plugins: { legend: { position: 'bottom', labels: { color: txt } } },
    scales: {
      x: { ticks: { color: mut }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: mut }, grid: { color: grid } }
    }
  };
  if (forExport) { options.animation = false; options.devicePixelRatio = 1; }
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ingresos', data: labels.map(k => monthly[k].income), backgroundColor: '#6d5dfc', borderRadius: 6 },
        { label: 'Egresos', data: labels.map(k => monthly[k].expense), backgroundColor: '#e26776', borderRadius: 6 }
      ]
    },
    options,
    plugins: forExport ? [{
      id: 'whiteBg',
      beforeDraw(c) {
        const x = c.ctx;
        x.save();
        x.globalCompositeOperation = 'destination-over';
        x.fillStyle = '#ffffff';
        x.fillRect(0, 0, c.width, c.height);
        x.restore();
      }
    }] : []
  };
}

function chartImageBase64() {
  if (typeof Chart === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 420;
  const chart = new Chart(canvas, chartConfig(getMonthly(), false, true));
  const data = canvas.toDataURL('image/png').split(',')[1];
  chart.destroy();
  return data;
}

function drawChart() {
  const canvas = document.getElementById('chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (document.getElementById('tabFin').classList.contains('hidden')) return;
  if (myChart) myChart.destroy();
  myChart = new Chart(canvas, chartConfig(getMonthly(), document.body.classList.contains('dark'), false));
}

function renderRegistros() {
  const query = (document.getElementById('regSearch').value || '').trim().toLowerCase();
  const filter = document.getElementById('regFilter').value;
  const from = document.getElementById('dateFrom').value;
  const to = document.getElementById('dateTo').value;

  const all = movs
    .map((m, index) => ({ ...m, index }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.index - a.index);

  const visible = all.filter(m => {
    const matchesType = filter === 'todos' || m.tipo === filter;
    const matchesFrom = !from || m.fecha >= from;
    const matchesTo = !to || m.fecha <= to;
    const searchText = `${m.concepto || ''} ${m.cat || ''} ${m.fecha || ''} ${m.tipo || ''}`.toLowerCase();
    return matchesType && matchesFrom && matchesTo && searchText.includes(query);
  });

  const totalIncome = all.filter(m => m.tipo === 'ingreso').reduce((sum, m) => sum + (Number(m.monto) || 0), 0);
  const totalExpense = all.filter(m => m.tipo === 'egreso').reduce((sum, m) => sum + (Number(m.monto) || 0), 0);

  document.getElementById('regCount').textContent = movs.length;
  document.getElementById('regIncome').textContent = money(totalIncome);
  document.getElementById('regExpense').textContent = money(totalExpense);
  document.getElementById('regBalance').textContent = money(totalIncome - totalExpense);
  document.getElementById('regShown').textContent = `Mostrando ${visible.length} de ${movs.length} movimientos`;

  const table = document.getElementById('recordsTable');
  const empty = document.getElementById('regEmpty');
  table.classList.toggle('hidden', visible.length === 0);
  empty.classList.toggle('hidden', visible.length > 0);

  document.getElementById('tbReg').innerHTML = visible.map(m => `
    <tr>
      <td>${esc(m.fecha || '')}</td>
      <td><span class="badge">${m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</span></td>
      <td>${esc(m.cat || 'Otro')}</td>
      <td>${esc(m.concepto || '')}</td>
      <td class="${m.tipo === 'ingreso' ? 'positive' : 'negative'}">${m.tipo === 'ingreso' ? '+' : '\u2212'}${money(m.monto)}</td>
      <td><button class="btn btn-small btn-danger" onclick="deleteMov(${m.index})" aria-label="Eliminar movimiento">\u00D7</button></td>
    </tr>
  `).join('');
}

function savePrecio() {
  const nombre = document.getElementById('prNombre').value.trim();
  const talla = document.getElementById('prTalla').value;
  const costo = Number(document.getElementById('prCosto').value) || 0;
  const precio = Number(document.getElementById('prPrecio').value) || 0;

  if (!nombre || precio <= 0) {
    alert('Escribe el nombre de la prenda y un precio de venta mayor a cero.');
    return;
  }

  const index = precios.findIndex(x =>
    String(x.nombre || '').toLowerCase() === nombre.toLowerCase() &&
    String(x.talla || '') === talla
  );

  const item = { nombre, talla, costo, precio };

  if (index >= 0) precios[index] = item;
  else precios.push(item);

  savePrecios();

  document.getElementById('prNombre').value = '';
  document.getElementById('prTalla').value = '';
  document.getElementById('prCosto').value = '';
  document.getElementById('prPrecio').value = '';

  renderPrecios();
}

function editPrecio(index) {
  const item = precios[index];
  if (!item) return;
  document.getElementById('prNombre').value = item.nombre || '';
  document.getElementById('prTalla').value = item.talla || '';
  document.getElementById('prCosto').value = item.costo || 0;
  document.getElementById('prPrecio').value = item.precio || 0;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function delPrecio(index) {
  if (!(await uiConfirm('\u00BFEliminar este precio?'))) return;
  precios.splice(index, 1);
  savePrecios();
  renderPrecios();
}

function renderPrecios() {
  const query = (document.getElementById('prBuscar').value || '').toLowerCase();
  const visible = precios
    .map((item, index) => ({ ...item, index }))
    .filter(item => String(item.nombre || '').toLowerCase().includes(query));

  document.getElementById('prList').innerHTML = tiposPrenda
    .map(tipo => `<option value="${esc(tipo)}"></option>`).join('');

  document.getElementById('tbPre').innerHTML = visible.map(item => `
    <tr>
      <td><button class="btn btn-small btn-light" onclick="editPrecio(${item.index})">${esc(item.nombre)}</button></td>
      <td>${esc(item.talla || 'Todas')}</td>
      <td>${money(item.costo)}</td>
      <td><b>${money(item.precio)}</b></td>
      <td><button class="btn btn-small btn-danger" onclick="delPrecio(${item.index})">\u00D7</button></td>
    </tr>
  `).join('');

  document.getElementById('prEmpty').classList.toggle('hidden', visible.length > 0);
}

async function exportarFinanzasExcel() {
  if (!window.ExcelJS) {
    alert('No se pudo cargar Excel. Revisa tu conexi\u00F3n a internet e intenta de nuevo.');
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VALYRA';
    workbook.created = new Date();

    const movementsSheet = workbook.addWorksheet('Movimientos');
    movementsSheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 16 },
      { header: 'Tipo', key: 'tipo', width: 14 },
      { header: 'Categor\u00EDa', key: 'categoria', width: 20 },
      { header: 'Concepto', key: 'concepto', width: 38 },
      { header: 'Monto', key: 'monto', width: 16 }
    ];

    movs.forEach(m => movementsSheet.addRow({
      fecha: m.fecha || '',
      tipo: m.tipo || '',
      categoria: m.cat || '',
      concepto: m.concepto || '',
      monto: Number(m.monto) || 0
    }));

    const header = movementsSheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171F30' } };
    movementsSheet.getColumn('monto').numFmt = '$#,##0.00';
    movementsSheet.autoFilter = { from: 'A1', to: 'E1' };
    movementsSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const summary = workbook.addWorksheet('Resumen');
    summary.columns = [{ width: 25 }, { width: 20 }, { width: 20 }];
    const totals = sums();

    summary.addRow(['RESUMEN FINANCIERO']);
    summary.addRow(['Ingresos', totals.income]);
    summary.addRow(['Egresos', totals.expense]);
    summary.addRow(['Utilidad / Balance', totals.balance]);
    summary.addRow([]);
    summary.addRow(['Mes', 'Ingresos', 'Egresos']);

    const monthly = getMonthly();

    Object.keys(monthly).sort().forEach(month => {
      summary.addRow([month, monthly[month].income, monthly[month].expense]);
    });

    summary.getRow(1).font = { bold: true, size: 16 };
    summary.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summary.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171F30' } };
    summary.getColumn(2).numFmt = '$#,##0.00';
    summary.getColumn(3).numFmt = '$#,##0.00';

    try {
      const b64 = chartImageBase64();
      if (b64) {
        const imageId = workbook.addImage({ base64: b64, extension: 'png' });
        summary.addImage(imageId, 'E2:L20');
      }
    } catch (chartError) {
      console.warn('No se pudo agregar la gr\u00E1fica al Excel', chartError);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await exportFile(blob, brandSlug() + '_Finanzas_' + hoy() + '.xlsx', blob.type);
  } catch (error) {
    console.error(error);
    alert('No se pudo generar el archivo de Excel.');
  }
}

document.getElementById('prTalla').innerHTML =
  '<option value="">Todas las tallas</option>' +
  tallas.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');

document.getElementById('fecha').value = hoy();
document.getElementById('mFecha').value = hoy();
document.getElementById('costoDTF').value = costoDTF;

loadTheme();
renderHeaderLogo();
setProductButtonState();
renderQuote();
renderPrecios();
renderQuoteHistory();
renderFin();
renderRegistros();
kpis();

function openBackup() {
  document.getElementById('backupText').value = '';
  document.getElementById('backupModal').style.display = 'block';
}

function backupJSON() {
  const data = {};
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.indexOf('valyra') === 0) data[k] = store.getItem(k);
    }
  } catch (e) {}
  return JSON.stringify({ app: 'valyra', version: 1, fecha: new Date().toISOString(), data });
}

function makeBackup() {
  const box = document.getElementById('backupText');
  box.value = backupJSON();
  box.focus();
  box.select();
}

function downloadBackup() {
  const blob = new Blob([backupJSON()], { type: 'application/json' });
  exportFile(blob, 'respaldo-valyra-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json');
}

function loadBackupFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { document.getElementById('backupText').value = String(r.result || ''); restoreBackup(); };
  r.onerror = () => alert('No se pudo leer el archivo.');
  r.readAsText(f);
  input.value = '';
}

function copyBackup() {
  const box = document.getElementById('backupText');
  if (!box.value) makeBackup();
  box.focus();
  box.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  if (ok) {
    alert('Respaldo copiado. P\u00E9galo en WhatsApp o en una nota para guardarlo.');
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(box.value)
      .then(() => alert('Respaldo copiado. P\u00E9galo en WhatsApp o en una nota para guardarlo.'))
      .catch(() => alert('Mant\u00E9n presionado el texto, elige Seleccionar todo y Copiar.'));
  } else {
    alert('Mant\u00E9n presionado el texto, elige Seleccionar todo y Copiar.');
  }
}

async function restoreBackup() {
  let parsed;
  try { parsed = JSON.parse(document.getElementById('backupText').value.trim()); } catch (e) { parsed = null; }
  if (!parsed || parsed.app !== 'valyra' || !parsed.data) {
    alert('El texto pegado no es un respaldo v\u00E1lido.');
    return;
  }
  if (!(await uiConfirm('Esto reemplazar\u00E1 los datos de este dispositivo. \u00BFContinuar?'))) return;
  try {
    Object.keys(parsed.data).forEach(k => {
      if (k.indexOf('valyra') === 0) store.setItem(k, parsed.data[k]);
    });
  } catch (e) {
    alert('No se pudo restaurar el respaldo.');
    return;
  }
  await store.flush();
  await uiAlert('Datos restaurados. La app se va a recargar.');
  location.reload();
}

// ---------- Actualizaciones automaticas ----------
// Detecta cualquier cambio que subas a GitHub (compara una huella de los archivos de la app)
// y muestra la ventana "Actualizar APK" con el logo. No hace falta cambiar numeros de version.
const WATCH_FILES = self.VALYRA_WATCH || ['index.html', 'manifest.webmanifest', 'logo.png'];
let updShown = false;
let updHash = null;

async function buildHash() {
  const parts = await Promise.all(WATCH_FILES.map(async f => {
    const r = await fetch(f + '?chk=1', { cache: 'no-cache' });
    if (!r.ok) throw new Error('No se pudo revisar ' + f);
    return new Uint8Array(await r.arrayBuffer());
  }));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  parts.forEach(p => { all.set(p, off); off += p.length; });
  if (window.crypto && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', all);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 0x811c9dc5, h2 = 0x1b873593;           // respaldo: hash FNV doble
  for (let i = 0; i < all.length; i++) {
    h1 = Math.imul(h1 ^ all[i], 16777619) >>> 0;
    h2 = Math.imul(h2 ^ all[i], 2246822519) >>> 0;
  }
  return 'f' + h1.toString(16) + h2.toString(16) + all.length;
}

function pingSW() {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'check-update' });
    }
  } catch (e) {}
}

// Permiso de notificaciones + revision periodica en segundo plano (Chrome/APK basado en Chrome)
async function enableUpdateNotifications(manual) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    if (manual) uiAlert('Este dispositivo no permite notificaciones desde la app.');
    return;
  }
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) {} }
  if (perm !== 'granted') {
    if (manual) uiAlert('Las notificaciones est\u00E1n bloqueadas. Act\u00EDvalas para VALYRA en los ajustes de Android.');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.periodicSync) await reg.periodicSync.register('valyra-update-check', { minInterval: 6 * 60 * 60 * 1000 });
  } catch (e) {}
  if (manual) uiAlert('Listo. Recibir\u00E1s una notificaci\u00F3n con sonido cuando haya una actualizaci\u00F3n y no est\u00E9s usando la app.');
}

async function askNotificationsOnce() {
  if (!('Notification' in window) || Notification.permission !== 'default' || store.getItem('__askedNotif')) return;
  store.setItem('__askedNotif', '1');
  if (await uiConfirm('\u00BFQuieres recibir una notificaci\u00F3n cuando haya una actualizaci\u00F3n de la app?')) enableUpdateNotifications(false);
}

async function checkForUpdate(manual) {
  if (updShown) return;
  if (!navigator.onLine) { if (manual === true) uiAlert('Sin internet: con\u00E9ctate para buscar actualizaciones.'); return; }
  try {
    const h = await buildHash();
    const saved = store.getItem('__build');
    if (!saved) {                                           // primera vez: solo guarda la huella
      store.setItem('__build', h);
      if (manual === true) uiAlert('Listo. Esta es la versi\u00F3n ' + APP_VERSION + '. Cuando publiques cambios en GitHub aparecer\u00E1 la ventana de actualizaci\u00F3n.');
      return;
    }
    if (saved !== h) { updHash = h; showUpdate(); if (document.hidden) pingSW(); return; }
    if (manual === true) uiAlert('Ya tienes la \u00FAltima versi\u00F3n (v' + APP_VERSION + ').');
  } catch (e) {
    if (manual === true) uiAlert('No se pudo revisar: ' + (e && e.message ? e.message : 'error de conexi\u00F3n') + '. Verifica tu internet e int\u00E9ntalo de nuevo.');
  }
}

function showUpdate() {
  if (updShown) return;
  // Justo después de actualizar no se vuelve a avisar (evita que la ventana salga dos veces).
  try { if (Date.now() - Number(sessionStorage.getItem('__upd_done') || 0) < 2 * 60 * 1000) return; } catch (e) {}
  updShown = true;
  document.getElementById('updName').textContent = brand.name;
  document.getElementById('updLogo').src = logo || DEFAULT_LOGO;
  document.getElementById('updBtn').disabled = false;
  document.getElementById('updBtn').textContent = 'Actualizar APK';
  document.getElementById('updModal').style.display = 'block';
}

function updateLater() {
  document.getElementById('updModal').style.display = 'none';
  setTimeout(() => { updShown = false; }, 30 * 60 * 1000);   // vuelve a avisar en 30 min
}

async function applyUpdate() {
  const btn = document.getElementById('updBtn');
  btn.disabled = true;
  btn.textContent = 'Actualizando\u2026';
  try { sessionStorage.setItem('__upd_done', String(Date.now())); } catch (e) {}
  try { store.setItem('__build', updHash || await buildHash()); await store.flush(); } catch (e) {}
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  } catch (e) {}
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch (e) {}
  location.reload();
}

if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) checkForUpdate(); });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
}
if ('Notification' in window && Notification.permission === 'granted') enableUpdateNotifications(false);  // renueva la revision en segundo plano
else setTimeout(askNotificationsOnce, 6000);
if (location.protocol.indexOf('http') === 0) {          // funciona aunque el APK no soporte service worker
  setTimeout(checkForUpdate, 2000);
  setInterval(checkForUpdate, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  window.addEventListener('online', checkForUpdate);
  window.addEventListener('focus', checkForUpdate);
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// ---------- Mockups (3D) ----------
// La camisa se dibuja con Three.js (se carga solo al abrir Mockups). Cada zona (pecho, espalda y las dos
// mangas) tiene su propio lienzo: las imagenes se pintan ahi y se ven pegadas a la tela al girar.
// Colores aproximados, en el mismo orden que la lista "colores".
const mkHex = ['#ffffff', '#ebe8e0', '#b9bcc2', '#4a4d52', '#5b6068', '#16181c', '#1f5560', '#1b2a4a', '#1f4fb5', '#7fb8e8',
  '#1fb5c0', '#67d6c8', '#a8e6c9', '#4ca96b', '#cfe04a', '#1f8a3a', '#55603a', '#b5a37a', '#8a5a3a', '#f7d83a',
  '#f08a24', '#c8202b', '#9b1c3a', '#e0306e', '#7a3c8c', '#f59a8b', '#f4a6c0', '#6b3fa0', '#ff6a13', '#ff3d9a', '#5cff3a'];
// Ancho de pecho aproximado (cm), en el mismo orden que la lista "tallas".
const mkPecho = [46, 49, 52, 55, 58, 61, 64, 67, 44, 47, 50, 49, 52, 55, 36, 39, 42, 45, 26, 31, 54];
const MK_REGIONS = { front: 'Pecho', back: 'Espalda', sleeveL: 'Brazo izquierdo', sleeveR: 'Brazo derecho' };
const MK_THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
// color, talla, custom: color de la camisa. decals: imagenes colocadas {id, n, img, region, u, v (cm, v desde arriba), wcm, rot, locked}
const mkState = { color: 5, talla: 2, custom: null, pick: false, decals: [], sel: null, nextId: 1, yaw: 0, pitch: 0.05, zoom: 1, loading: null };
let mk = null;      // escena 3D (se crea al abrir Mockups)
let mkDrag = null;

function mkFill() { return mkState.custom || mkHex[mkState.color]; }
function mkClamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function mkSelDecal() { return mkState.decals.find(d => d.id === mkState.sel) || null; }
function mkIsSleeve(name) { return name === 'sleeveL' || name === 'sleeveR'; }
function mkDecalH(d) { return d.wcm * d.img.height / d.img.width; }

function mkShade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(mkClamp(f < 0 ? v * (1 + f) : v + (255 - v) * f, 0, 255)));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

function mkChipStyle(active) {
  return 'padding:7px 11px;border-radius:10px;font-size:12px;font-weight:800;color:inherit;border:2px solid ' +
    (active ? '#6d5dfc' : 'var(--border)') + ';background:' + (active ? 'rgba(109,93,252,.16)' : 'transparent');
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
  document.getElementById('mkSizes').innerHTML = tallas.map((t, i) =>
    `<button onclick="mkPickSize(${i})" style="${mkChipStyle(i === mkState.talla)}">${esc(t)}</button>`
  ).join('');
  const cur = mkCurRegion();
  document.getElementById('mkViews').innerHTML = Object.keys(MK_REGIONS).map(k =>
    `<button onclick="mkView('${k}')" style="${mkChipStyle(k === cur)}">${MK_REGIONS[k]}</button>`
  ).join('');
}

function mkSyncUI() {
  const d = mkSelDecal();
  const list = document.getElementById('mkList');
  if (list) {
    list.innerHTML = mkState.decals.length ? mkState.decals.map(x =>
      `<button onclick="mkSelectDecal(${x.id})" style="${mkChipStyle(x.id === mkState.sel)}">${x.n} · ${MK_REGIONS[x.region]}${x.locked ? ' · fija' : ''}</button>`
    ).join('') : '<span style="font-size:12px;color:var(--muted)">Aun no hay imagenes. Carga una para empezar.</span>';
  }
  const ancho = document.getElementById('mkAncho');
  const rot = document.getElementById('mkRot');
  const lock = document.getElementById('mkLockBtn');
  const del = document.getElementById('mkDelBtn');
  if (ancho) { ancho.disabled = !d; if (d) ancho.value = Math.round(d.wcm * 10) / 10; }
  if (rot) { rot.disabled = !d; if (d) rot.value = d.rot; }
  if (lock) { lock.disabled = !d; lock.textContent = d && d.locked ? 'Soltar imagen' : 'Fijar imagen'; }
  if (del) del.disabled = !d;
  const drop = document.getElementById('mkDropBtn');
  if (drop) drop.textContent = mkState.pick ? 'Toca la imagen...' : 'Gotero';
  if (mk) mk.cv.style.cursor = mkState.pick ? 'crosshair' : 'grab';
}

function mkInfo() {
  const el = document.getElementById('mkInfo');
  if (!el) return;
  const pecho = mkPecho[mkState.talla];
  let t = 'Talla ' + tallas[mkState.talla] + ' \u00B7 ancho de pecho aprox. ' + pecho + ' cm \u00B7 ' + (mkState.custom ? 'color ' + mkState.custom : colores[mkState.color]);
  const d = mkSelDecal();
  if (d) t += ' \u00B7 imagen ' + d.n + ': ' + d.wcm.toFixed(0) + ' x ' + mkDecalH(d).toFixed(0) + ' cm' + (d.locked ? ' (fija)' : '');
  el.textContent = t + '. Medidas aproximadas.';
}

function mkPickColor(i) {
  mkState.color = i;
  mkState.custom = null;
  mkState.pick = false;
  document.getElementById('mkCustom').value = mkHex[i];
  mkRefresh();
}
function mkSetCustom(hex) { mkState.custom = hex; mkState.pick = false; mkRefresh(); }
function mkPickSize(i) { mkState.talla = i; if (mk) mkBuildShirt(); mkRefresh(); }
function mkRefresh() { mkBuildControls(); mkSyncUI(); mkInfo(); if (mk && mk.shirt) { mkPaintAll(); mkInvalidate(); } }

function mkSetZoom(v) { mkState.zoom = mkClamp(Number(v) / 100 || 1, 0.5, 3); mkInvalidate(); }

function mkView(name) {
  const yaw = { front: 0, back: Math.PI, sleeveL: -Math.PI / 2, sleeveR: Math.PI / 2 }[name];
  if (yaw === undefined) return;
  const cur = mkState.yaw;
  mk && (mk.target = { yaw: yaw + Math.PI * 2 * Math.round((cur - yaw) / (Math.PI * 2)), pitch: 0.05 });
  mkInvalidate();
}

// ---------- Imagenes ----------
function mkLoadImage(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!mk || !mk.shirt) { alert('El visor 3D todavia no esta listo. Espera un momento e intenta de nuevo.'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    const im = new Image();
    im.onload = () => {
      const region = mkCurRegion();
      const R = mk.regions[region];
      const sleeve = mkIsSleeve(region);
      const wcm = sleeve ? Math.min(8, R.hCm * 0.8) : Math.min(28, mkPecho[mkState.talla]);
      const h = wcm * im.height / im.width;
      const d = {
        id: mkState.nextId, n: mkState.nextId, img: im, region, wcm, rot: 0, locked: false, sample: null,
        u: sleeve ? R.wCm * (region === 'sleeveL' ? 0.75 : 0.25) : R.wCm / 2,
        v: sleeve ? R.hCm * 0.45 : Math.min(0.14 * R.hCm + h / 2, R.hCm * 0.7)
      };
      mkState.nextId++;
      mkState.decals.push(d);
      mkState.sel = d.id;
      mkPaint(region);
      mkSyncUI(); mkInfo(); mkInvalidate();
    };
    im.onerror = () => alert('No se pudo leer la imagen.');
    im.src = reader.result;
  };
  reader.readAsDataURL(file);
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

function mkSetWidth(v) {
  const d = mkSelDecal();
  if (!d) return;
  const R = mk.regions[d.region];
  d.wcm = mkClamp(Number(v) || d.wcm, 2, Math.max(4, R.wCm));
  mkPaint(d.region); mkInfo(); mkInvalidate();
}
function mkSetRot(v) {
  const d = mkSelDecal();
  if (!d) return;
  d.rot = mkClamp(Number(v) || 0, -180, 180);
  mkPaint(d.region); mkInvalidate();
}
function mkToggleLock() {
  const d = mkSelDecal();
  if (!d) return;
  d.locked = !d.locked;
  mkPaint(d.region); mkSyncUI(); mkInfo(); mkInvalidate();
}
function mkRemoveSel() {
  const d = mkSelDecal();
  if (!d) return;
  mkState.decals = mkState.decals.filter(x => x !== d);
  mkState.sel = mkState.decals.length ? mkState.decals[mkState.decals.length - 1].id : null;
  mkState.pick = false;
  mkPaintAll(); mkSyncUI(); mkInfo(); mkInvalidate();
}
function mkClear() {
  if (mkState.decals.length && !confirm('Quitar todas las imagenes del mockup?')) return;
  mkState.decals = [];
  mkState.sel = null;
  mkState.pick = false;
  mkPaintAll(); mkSyncUI(); mkInfo(); mkInvalidate();
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
  mkState.custom = hex;
  mkState.pick = false;
  document.getElementById('mkCustom').value = hex;
  mkRefresh();
}
function mkToggleDropper() {
  if (!mkSelDecal()) { alert('Primero carga o selecciona una imagen.'); return; }
  mkState.pick = !mkState.pick;
  mkSyncUI();
}
function mkBgColor() {
  const d = mkSelDecal();
  if (!d) { alert('Primero carga o selecciona una imagen.'); return; }
  const counts = {};
  [[0.01, 0.01], [0.99, 0.01], [0.01, 0.99], [0.99, 0.99]].forEach(p => {
    const px = mkPixel(d, p[0], p[1]);
    if (px) { const key = mkToHex(px); counts[key] = (counts[key] || 0) + 1; }
  });
  const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (!best) { alert('El fondo de la imagen es transparente. Usa el gotero y toca un color del dise\u00F1o.'); return; }
  mkApplyColor(best);
}

// ---------- Pintado de cada zona ----------
function mkPaint(name) {
  const R = mk && mk.regions[name];
  if (!R) return;
  const ctx = R.ctx, k = R.k;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = mkFill();
  ctx.fillRect(0, 0, R.canvas.width, R.canvas.height);
  const offs = mkIsSleeve(name) ? [-R.wCm, 0, R.wCm] : [0];
  mkState.decals.filter(d => d.region === name).forEach(d => {
    const w = d.wcm * k, h = w * d.img.height / d.img.width;
    offs.forEach(o => {
      ctx.save();
      ctx.translate((d.u + o) * k, d.v * k);
      ctx.rotate(d.rot * Math.PI / 180);
      ctx.drawImage(d.img, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
  });
  const s = mkSelDecal();
  if (s && s.region === name && !mk.noSel) {
    const w = s.wcm * k, h = w * s.img.height / s.img.width;
    offs.forEach(o => {
      ctx.save();
      ctx.translate((s.u + o) * k, s.v * k);
      ctx.rotate(s.rot * Math.PI / 180);
      ctx.lineWidth = Math.max(2, 0.3 * k);
      ctx.strokeStyle = s.locked ? '#f08a24' : '#6d5dfc';
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
  const camera = new T.PerspectiveCamera(32, 1, 1, 2000);
  scene.add(new T.HemisphereLight(0xffffff, 0x9aa0b0, 0.95));
  const key = new T.DirectionalLight(0xffffff, 0.5); key.position.set(60, 90, 120); scene.add(key);
  const fill = new T.DirectionalLight(0xffffff, 0.3); fill.position.set(-80, 30, -120); scene.add(fill);
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
  tex.anisotropy = Math.min(4, mk.renderer.capabilities.getMaxAnisotropy());
  return { name, wCm, hCm, k, canvas, ctx: canvas.getContext('2d'), tex, mesh: null };
}

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
  for (let j = 0; j <= M; j++) {
    const t = j / M;
    for (let i = 0; i <= N; i++) {
      const y = bot + (topY(xs[i]) - bot) * t;
      pos.push(xs[i], y, zs[i]);
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
  const mkMat = R => new T.MeshStandardMaterial({ map: R.tex, roughness: 0.92, metalness: 0, side: T.DoubleSide });
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
  const na = 0.17 * pecho, nb = b * 0.7, ring = [], inner = [], NR = 64;
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
  mk.yokeMat = new T.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: T.DoubleSide });
  shirt.add(new T.Mesh(yg, mk.yokeMat));
  const collar = new T.TubeGeometry(new T.CatmullRomCurve3(inner.slice(0, NR), true), 64, 0.9, 8, true);
  mk.collarMat = new T.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
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

function mkResize() {
  if (!mk || !mk.shirt) return;
  const w = mk.cv.clientWidth;
  if (!w) return;
  const h = Math.round(w * 640 / 600);
  mk.renderer.setSize(w, h, false);
  mk.camera.aspect = w / h;
  mk.camera.updateProjectionMatrix();
  const tan = Math.tan(mk.camera.fov * Math.PI / 360);
  mk.dist = Math.max(0.72 * mk.H / tan, 1.08 * mk.halfW / (tan * mk.camera.aspect));
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
  mkLoadThree().then(() => {
    if (!mk) mkInitScene();
    if (!mk.shirt) mkBuildShirt();
    mkResize();
    mkInvalidate();
  }).catch(() => {
    const el = document.getElementById('mkInfo');
    if (el) el.textContent = 'No se pudo cargar la libreria 3D. Conectate a internet una vez (o ejecuta "Descargar librerias" en GitHub Actions) y vuelve a abrir Mockups.';
  });
}

// ---------- Tocar y arrastrar ----------
function mkRayAt(e) {
  const r = mk.cv.getBoundingClientRect();
  mk.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
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
  cv.addEventListener('pointerdown', e => {
    if (!mk || !mk.shirt) return;
    const hit = mkRayAt(e);
    if (mkState.pick) {
      const f = hit && mkDecalAt(hit);
      const d = mkSelDecal();
      if (!f || !d || f.d !== d) { alert('Toca sobre la imagen seleccionada.'); return; }
      const px = mkPixel(d, (f.l.x + f.l.w / 2) / f.l.w, (f.l.y + f.l.h / 2) / f.l.h);
      if (!px) { alert('Ese punto es transparente. Toca otro.'); return; }
      mkApplyColor(mkToHex(px));
      return;
    }
    mk.target = null;
    cv.setPointerCapture(e.pointerId);
    const found = hit && mkDecalAt(hit);
    if (found) {
      if (found.d.id !== mkState.sel) mkSelectDecal(found.d.id);
      if (!found.d.locked) {
        mkDrag = { type: 'decal', d: found.d, ox: found.d.u - hit.u, oy: found.d.v - hit.v, region: hit.region };
        cv.style.cursor = 'move';
        return;
      }
    }
    mkDrag = { type: 'orbit', x: e.clientX, y: e.clientY, yaw: mkState.yaw, pitch: mkState.pitch };
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', e => {
    if (!mkDrag || !mk) return;
    if (mkDrag.type === 'orbit') {
      mkState.yaw = mkDrag.yaw + (e.clientX - mkDrag.x) * 0.012;
      mkState.pitch = mkClamp(mkDrag.pitch + (e.clientY - mkDrag.y) * 0.008, -0.9, 0.9);
      mkInvalidate();
      return;
    }
    const hit = mkRayAt(e);
    if (!hit) return;
    const d = mkDrag.d, from = d.region;
    if (hit.region !== mkDrag.region) { mkDrag.region = hit.region; mkDrag.ox = 0; mkDrag.oy = 0; }
    const R = mk.regions[hit.region];
    let u = hit.u + mkDrag.ox, v = hit.v + mkDrag.oy;
    u = mkIsSleeve(hit.region) ? ((u % R.wCm) + R.wCm) % R.wCm : mkClamp(u, 0, R.wCm);
    v = mkClamp(v, 0, R.hCm);
    d.region = hit.region; d.u = u; d.v = v;
    if (from !== d.region) { mkPaint(from); mkSyncUI(); }
    mkPaint(d.region);
    mkInvalidate();
  });
  const stop = () => {
    if (mkDrag && mkDrag.type === 'decal') { mkSyncUI(); mkInfo(); }
    mkDrag = null;
    if (mk) mk.cv.style.cursor = mkState.pick ? 'crosshair' : 'grab';
  };
  cv.addEventListener('pointerup', stop);
  cv.addEventListener('pointercancel', stop);
  cv.addEventListener('wheel', e => {
    if (!mk || !mk.shirt) return;
    e.preventDefault();
    mkState.zoom = mkClamp(mkState.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.5, 3);
    const z = document.getElementById('mkZoom');
    if (z) z.value = Math.round(mkState.zoom * 100);
    mkInvalidate();
  }, { passive: false });
  window.addEventListener('resize', () => { if (mk && mk.shirt) mkResize(); });
})();

function mkExport() {
  if (!mk || !mk.shirt) { alert('El visor 3D todavia no esta listo.'); return; }
  const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
  mk.noSel = true;
  mkPaintAll();
  mk.root.rotation.set(mkState.pitch, mkState.yaw, 0, 'YXZ');
  mk.camera.position.set(0, 0, mk.dist / mkState.zoom);
  mk.camera.lookAt(0, 0, 0);
  mk.renderer.render(mk.scene, mk.camera);
  const name = 'Mockup_' + slug(mkState.custom ? 'Personalizado' : colores[mkState.color]) + '_' + slug(tallas[mkState.talla]) + '_' + slug(MK_REGIONS[mkCurRegion()]) + '.png';
  mk.cv.toBlob(blob => {
    if (!blob) { alert('No se pudo crear la imagen.'); return; }
    exportFile(blob, name, 'image/png');
  }, 'image/png');
  mk.noSel = false;
  mkPaintAll();
  mkInvalidate();
}

// ---------- Anticipos, clientes, inventario, estampados ----------
let clientes = loadArray('valyra_clientes');
let inv = loadArray('valyra_inv');
let posiciones = loadArray('valyra_pos');
let invMin = 3;
try { invMin = Number(store.getItem('valyra_invmin')) || 3; } catch (e) {}
let curPos = [];
if (!posiciones.length) posiciones = [{ n: 'Frente', p: 0 }, { n: 'Espalda', p: 0 }, { n: 'Manga', p: 0 }, { n: 'Pecho', p: 0 }];

function getAnticipo(total) {
  return Math.min(total, Math.max(0, Number(document.getElementById('anticipo').value) || 0));
}

function saldoDe(total) {
  const a = getAnticipo(total);
  return a > 0 ? total - a : 0;
}

function posHtml(p) {
  return p.pos && p.pos.length ? '<br><small>Estampado: ' + esc(p.pos.join(' + ')) + '</small>' : '';
}

async function cobrarSaldo(id) {
  const q = quoteHistory.find(x => x.id === id);
  if (!q || !(q.saldo > 0)) return;
  if (!(await uiConfirm('\u00BFRegistrar el cobro de ' + money(q.saldo) + ' de ' + (q.cliente || 'Cliente') + '?'))) return;
  movs.push({ fecha: hoy(), tipo: 'ingreso', concepto: 'Saldo de ' + (q.cliente || 'Cliente'), cat: 'Venta', monto: round2(q.saldo), status: 'pagado' });
  q.anticipo = q.total;
  q.saldo = 0;
  if (q.status === 'pendiente') q.status = 'pagado';
  persistMovs();
  saveQuoteHistory();
  renderQuoteHistory();
  refreshFinanceViews();
}

function marcarEntregado(id) {
  const q = quoteHistory.find(x => x.id === id);
  if (!q) return;
  q.status = 'entregado';
  saveQuoteHistory();
  renderQuoteHistory();
}

// Estampados
function renderPosChips() {
  document.getElementById('posChips').innerHTML = posiciones.map((p, i) =>
    `<button onclick="togglePos(${i})" style="${mkChipStyle(curPos.indexOf(p.n) >= 0)}">${esc(p.n)}${p.p ? ' +' + money(p.p) : ''}</button>`
  ).join('');
}

function togglePos(i) {
  const n = posiciones[i].n;
  const k = curPos.indexOf(n);
  if (k >= 0) curPos.splice(k, 1); else curPos.push(n);
  renderPosChips();
}

function renderPosList() {
  document.getElementById('posList').innerHTML = posiciones.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--border)">
      <b style="flex:1">${esc(p.n)}</b>
      <input type="number" min="0" value="${Number(p.p) || 0}" onchange="setPosPrecio(${i}, this.value)" style="width:90px">
      <button class="btn btn-small btn-danger" onclick="delPos(${i})">Eliminar</button>
    </div>`).join('');
}

function setPosPrecio(i, v) {
  posiciones[i].p = Math.max(0, Number(v) || 0);
  saveStorage('valyra_pos', posiciones);
  renderPosChips();
}

function addPos() {
  const n = document.getElementById('posNombre').value.trim();
  if (!n) { alert('Escribe el nombre de la posici\u00F3n.'); return; }
  if (posiciones.some(p => p.n.toLowerCase() === n.toLowerCase())) { alert('Esa posici\u00F3n ya existe.'); return; }
  posiciones.push({ n, p: Math.max(0, Number(document.getElementById('posPrecio').value) || 0) });
  saveStorage('valyra_pos', posiciones);
  document.getElementById('posNombre').value = '';
  document.getElementById('posPrecio').value = 0;
  renderPosList();
  renderPosChips();
}

async function delPos(i) {
  if (!(await uiConfirm('\u00BFEliminar esta posici\u00F3n?'))) return;
  curPos = curPos.filter(n => n !== posiciones[i].n);
  posiciones.splice(i, 1);
  saveStorage('valyra_pos', posiciones);
  renderPosList();
  renderPosChips();
}

// Clientes
function fillClientesList() {
  document.getElementById('clientesList').innerHTML = clientes.map(c => `<option value="${esc(c.nombre)}"></option>`).join('');
}

function saveCliente() {
  const nombre = document.getElementById('cliNombre').value.trim();
  const tel = document.getElementById('cliTel').value.replace(/[^0-9+]/g, '');
  if (!nombre) { alert('Escribe el nombre del cliente.'); return; }
  const prev = clientes.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
  if (prev) { if (tel) prev.tel = tel; }
  else clientes.push({ id: Date.now() + '-' + Math.random().toString(16).slice(2), nombre, tel });
  saveStorage('valyra_clientes', clientes);
  document.getElementById('cliNombre').value = '';
  document.getElementById('cliTel').value = '';
  fillClientesList();
  renderClientes();
}

function autoAddCliente(nombre) {
  if (!nombre || nombre === 'Cliente') return;
  if (clientes.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) return;
  clientes.push({ id: Date.now() + '-' + Math.random().toString(16).slice(2), nombre, tel: '' });
  saveStorage('valyra_clientes', clientes);
  fillClientesList();
}

function renderClientes() {
  const qBox = document.getElementById('cliBuscar');
  const q = (qBox ? qBox.value : '').trim().toLowerCase();
  const list = clientes.filter(c => c.nombre.toLowerCase().indexOf(q) >= 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  document.getElementById('cliList').innerHTML = list.map(c => {
    const qs = quoteHistory.filter(x => (x.cliente || '').toLowerCase() === c.nombre.toLowerCase() && x.status !== 'cancelado');
    const total = qs.reduce((a, x) => a + (Number(x.total) || 0), 0);
    const saldo = qs.reduce((a, x) => a + (Number(x.saldo) || 0), 0);
    return `
    <div style="padding:9px 0;border-top:1px solid var(--border)">
      <b>${esc(c.nombre)}</b> <small style="color:var(--muted)">${esc(c.tel || '')}</small><br>
      <small style="color:var(--muted)">${qs.length} cotizaciones \u00B7 ${money(total)}${saldo > 0 ? ' \u00B7 Debe ' + money(saldo) : ''}</small>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <button class="btn btn-small btn-light" onclick="useCliente('${esc(c.id)}')">Cotizar</button>
        ${c.tel ? `<button class="btn btn-small btn-green" onclick="waCliente('${esc(c.id)}')">WhatsApp</button>` : ''}
        <button class="btn btn-small btn-danger" onclick="delCliente('${esc(c.id)}')">Eliminar</button>
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--muted);font-size:12px">Todav\u00EDa no hay clientes. Se agregan solos al guardar una cotizaci\u00F3n.</p>';
}

function useCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cliente').value = c.nombre;
  showTab('cot');
}

function waCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c || !c.tel) return;
  let n = c.tel.replace(/[^0-9]/g, '');
  if (n.length === 10) n = '52' + n;
  window.open('https://wa.me/' + n, '_blank');
}

async function delCliente(id) {
  if (!(await uiConfirm('\u00BFEliminar este cliente? Sus cotizaciones se conservan.'))) return;
  clientes = clientes.filter(c => c.id !== id);
  saveStorage('valyra_clientes', clientes);
  fillClientesList();
  renderClientes();
}

// Inventario
function saveInv() { saveStorage('valyra_inv', inv); }

function saveInvMin() {
  invMin = Math.max(0, Number(document.getElementById('invMin').value) || 0);
  try { store.setItem('valyra_invmin', String(invMin)); } catch (e) {}
  renderInv();
}

function addInv() {
  const color = document.getElementById('invColor').value;
  const talla = document.getElementById('invTalla').value;
  const n = Math.round(Number(document.getElementById('invCant').value));
  if (!n) { alert('Escribe cu\u00E1ntas piezas sumar (negativo para restar).'); return; }
  let it = inv.find(x => x.color === color && x.talla === talla);
  if (!it) { it = { color, talla, cant: 0 }; inv.push(it); }
  it.cant = Math.max(0, it.cant + n);
  saveInv();
  renderInv();
}

function adjInv(i, d) {
  inv[i].cant = Math.max(0, inv[i].cant + d);
  saveInv();
  renderInv();
}

async function delInv(i) {
  if (!(await uiConfirm('\u00BFQuitar esta l\u00EDnea del inventario?'))) return;
  inv.splice(i, 1);
  saveInv();
  renderInv();
}

function renderInv() {
  const rows = inv.map((it, i) => ({ it, i })).sort((a, b) => a.it.cant - b.it.cant);
  document.getElementById('invList').innerHTML = rows.map(({ it, i }) => {
    const low = it.cant <= invMin;
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border)">
      <div style="flex:1"><b>${esc(it.color)}</b> ${esc(it.talla)}<br>
        <small style="color:${low ? '#c8202b' : 'var(--muted)'};font-weight:800">${it.cant === 0 ? 'AGOTADO' : (low ? 'Poco: ' : '') + it.cant + ' pzas'}</small></div>
      <button class="btn btn-small btn-light" onclick="adjInv(${i}, -1)">-1</button>
      <button class="btn btn-small btn-light" onclick="adjInv(${i}, 1)">+1</button>
      <button class="btn btn-small btn-danger" onclick="delInv(${i})">X</button>
    </div>`;
  }).join('') || '<p style="color:var(--muted);font-size:12px">Sin inventario registrado.</p>';
}

function descontarInventario() {
  const bajo = [];
  productos.forEach(p => {
    const it = inv.find(x => x.color === p.prenda && x.talla === p.talla);
    if (!it) return;
    it.cant = Math.max(0, it.cant - (Number(p.cant) || 0));
    if (it.cant <= invMin) bajo.push(it.color + ' ' + it.talla + ' (' + it.cant + ')');
  });
  saveInv();
  return bajo;
}

function renderMas() {
  document.getElementById('invMin').value = invMin;
  renderClientes();
  renderInv();
  renderPosList();
}

(function masInit() {
  document.getElementById('invColor').innerHTML = colores.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  document.getElementById('invTalla').innerHTML = tallas.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  fillClientesList();
  renderPosChips();
})();

if (!history.state) history.replaceState({ tab: 'home' }, '');
let bootTab = history.state && history.state.tab;
try {                                                       // atajos de la APK: ./?tab=cot
  const urlTab = new URLSearchParams(location.search).get('tab');
  if (urlTab && TAB_NAMES.indexOf(urlTab) >= 0) {
    bootTab = urlTab;
    history.replaceState({ tab: urlTab }, '', location.pathname);
  }
} catch (e) {}
if (bootTab && bootTab !== 'home' && TAB_NAMES.indexOf(bootTab) >= 0) showTab(bootTab, true);   // al recargar, vuelve a la seccion
else showTab('home', true);
