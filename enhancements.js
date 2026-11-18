'use strict';

// VALYRA enhancements: inventory navigation, complete garment pricing,
// finance breakdown, and grouped size selection.
(function () {
  const $ = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 2
  }).format(Number(value) || 0);

  function nextCard(label) {
    return label && label.nextElementSibling && label.nextElementSibling.classList.contains('card')
      ? label.nextElementSibling : null;
  }

  function findLabel(section, text) {
    return Array.from(section.querySelectorAll('.section-label'))
      .find(node => node.textContent.trim().toLocaleLowerCase('es-MX').includes(text));
  }

  function setupSections() {
    const more = $('tabMas');
    if (!more) return;
    const inventoryLabel = findLabel(more, 'inventario');
    const inventoryCard = nextCard(inventoryLabel);
    if (!inventoryCard) return;

    const inventoryTab = document.createElement('section');
    inventoryTab.id = 'tabInv';
    inventoryTab.className = 'hidden';
    inventoryTab.innerHTML = '<div class="page-heading"><h1>Inventario</h1><p>Controla las existencias de tus prendas por color y talla.</p></div>';
    inventoryLabel.textContent = 'Existencias de playeras';
    inventoryTab.append(inventoryLabel, inventoryCard);
    $('tabHome').after(inventoryTab);

    for (const [needle, removeCard] of [['clientes', true], ['precio de estampado', true]]) {
      const label = findLabel(more, needle);
      if (label) {
        const card = nextCard(label);
        label.remove();
        if (removeCard && card) card.remove();
      }
    }

    // Keep legacy render targets available for saved data and existing app code,
    // without showing the removed customer and print-position sections.
    const legacy = document.createElement('div');
    legacy.className = 'hidden';
    legacy.innerHTML = '<div id="cliList"></div><div id="clientesList"></div><div id="posList"></div>';
    more.append(legacy);

    const subtitle = more.querySelector('.page-heading p');
    if (subtitle) subtitle.textContent = 'Respaldo y ajustes del negocio.';
  }

  function addInventoryMenu() {
    const grid = $('homeGrid');
    if (!grid || grid.querySelector('[data-inventory-menu]')) return;
    const button = document.createElement('button');
    button.className = 'home-card c-mas';
    button.style.setProperty('--i', '6');
    button.dataset.inventoryMenu = 'true';
    button.innerHTML = '<span class="hc-ico" aria-hidden="true">📦</span><b>Inventario</b><small>Existencias por talla y color</small>';
    button.addEventListener('click', () => window.showTab('inv'));
    grid.append(button);

    const more = Array.from(grid.querySelectorAll('.home-card')).find(card => card.textContent.includes('Más'));
    if (more) {
      const title = more.querySelector('b');
      const desc = more.querySelector('small');
      if (title) title.textContent = 'Respaldo';
      if (desc) desc.textContent = 'Respaldo y ajustes del negocio';
    }
  }

  function setupInventoryTabNavigation() {
    if (Array.isArray(window.TAB_NAMES) && !window.TAB_NAMES.includes('inv')) window.TAB_NAMES.push('inv');
    const original = window.showTab;
    if (typeof original !== 'function' || original.__valyraInventoryWrapped) return;
    const wrapped = function (tab, fromPop) {
      if (tab !== 'inv') return original.apply(this, arguments);
      original.call(this, 'mas', fromPop);
      const more = $('tabMas');
      const inventory = $('tabInv');
      if (more) more.classList.add('hidden');
      if (inventory) {
        inventory.classList.remove('hidden');
        inventory.classList.remove('tab-enter');
        void inventory.offsetWidth;
        inventory.classList.add('tab-enter');
      }
      if (typeof window.curTab !== 'undefined') window.curTab = 'inv';
      if (!fromPop) history.replaceState({ tab: 'inv' }, '');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    wrapped.__valyraInventoryWrapped = true;
    window.showTab = wrapped;
  }

  const sizeGroups = [
    { name: 'Hombre', sizes: ['S Hombre', 'M Hombre', 'L Hombre'] },
    { name: 'Mujer', sizes: ['S Mujer', 'M Mujer', 'L Mujer'] },
    { name: 'Unisex', sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'] },
    { name: 'Infantil y bebé', sizes: ['8 Niño', '10 Niño', '12 Niño', '14 Niño', '0-3M', '6-12M', 'Unitalla'] }
  ];
  const chest = {
    'S Hombre': 49, 'M Hombre': 52, 'L Hombre': 55,
    'S Mujer': 44, 'M Mujer': 47, 'L Mujer': 50,
    XS: 46, S: 49, M: 52, L: 55, XL: 58, '2XL': 61, '3XL': 64, '4XL': 67,
    '8 Niño': 36, '10 Niño': 39, '12 Niño': 42, '14 Niño': 45,
    '0-3M': 26, '6-12M': 31
  };
  function orderedSizes() {
    if (!Array.isArray(window.tallas)) return;
    const all = window.tallas.slice();
    const ordered = sizeGroups.flatMap(group => group.sizes.filter(size => all.includes(size)));
    all.forEach(size => { if (!ordered.includes(size)) ordered.push(size); });
    window.tallas.splice(0, window.tallas.length, ...ordered);
  }
  function sizeLabel(size) {
    const width = chest[size];
    return size + (width ? ` · pecho aprox. ${width} cm` : '');
  }
  function improveSizePicker() {
    const original = window.openSize;
    if (typeof original !== 'function' || original.__valyraSizesWrapped) return;
    const wrapped = function () {
      const box = $('sizeList');
      if (!box) return original();
      box.innerHTML = sizeGroups.map(group => {
        const options = group.sizes.filter(size => window.tallas.includes(size));
        return options.length ? `<h3 style="margin:12px 4px 5px;color:var(--muted);font-size:11px">${group.name}</h3>` +
          options.map(size => `<button class="opt" type="button" onclick="setSize('${size.replaceAll("'", "\\'")}')">${sizeLabel(size)}</button>`).join('') : '';
      }).join('') + window.tallas.filter(size => !sizeGroups.some(group => group.sizes.includes(size)))
        .map(size => `<button class="opt" type="button" onclick="setSize('${size.replaceAll("'", "\\'")}')">${sizeLabel(size)}</button>`).join('');
      $('sizeModal').style.display = 'block';
    };
    wrapped.__valyraSizesWrapped = true;
    window.openSize = wrapped;
  }

  function improveQuotePriceOptions() {
    // The full garment/design price is kept as one editable unit price.
    const positions = $('posChips');
    if (positions) {
      const field = positions.closest('.field');
      if (field) field.classList.add('hidden');
    }
    const form = $('tabCot');
    if (form) {
      const priceLabel = form.querySelector('label[for="costoDTF"]');
      if (priceLabel) priceLabel.closest('.card')?.classList.add('hidden');
    }

    const open = window.openTipo;
    if (typeof open !== 'function' || open.__valyraPriceOptionsWrapped) return;
    const wrapped = function () {
      const list = $('colorList');
      if (!list) return open();
      const saved = Array.isArray(window.precios) ? window.precios : [];
      $('colorTitle').textContent = 'Selecciona una camisa';
      list.innerHTML = saved.length ? saved.map((item, index) =>
        `<button class="opt" type="button" onclick="selectPricedShirt(${index})"><b>${window.esc(item.nombre || 'Camisa')}</b>` +
        `${item.talla ? ` · Talla ${window.esc(item.talla)}` : ''}<br><small>Venta ${window.money(item.precio)} · Costo ${window.money(item.costo)}</small></button>`
      ).join('') : window.tiposPrenda.map((type, index) =>
        `<button class="opt" type="button" onclick="setTipo(${index})">${window.esc(type)}</button>`
      ).join('');
      $('colorModal').style.display = 'block';
    };
    wrapped.__valyraPriceOptionsWrapped = true;
    window.openTipo = wrapped;
    window.selectPricedShirt = function (index) {
      const item = window.precios[index];
      if (!item) return;
      window.curTipo = item.nombre;
      window.curTalla = item.talla || 'M';
      $('btnTipo').textContent = item.nombre;
      $('btnTalla').textContent = item.talla || 'M';
      $('pPrecio').value = Number(item.precio) || 0;
      $('colorModal').style.display = 'none';
    };

    const suggested = window.setSuggestedPrice;
    if (typeof suggested === 'function') {
      window.setSuggestedPrice = function () {
        const item = window.precioDe(window.curTipo, window.curTalla);
        if (item) $('pPrecio').value = Number(item.precio) || 0;
      };
    }
  }

  function improvePriceLabels() {
    const labels = Array.from(document.querySelectorAll('#tabPre .field-label'));
    labels.forEach(label => {
      const text = label.textContent.trim().toLocaleLowerCase('es-MX');
      if (text === 'costo ($)') label.textContent = 'Costo completo por camisa con diseño ($)';
      if (text === 'precio de venta ($)') label.textContent = 'Precio final de venta por camisa ($)';
    });
    const heading = $('tabPre')?.querySelector('.page-heading p');
    if (heading) heading.textContent = 'Define el costo total de cada camisa con diseño y el precio al que la venderás. Puedes editar estos valores cuando quieras.';
    const dtfLabel = $('tabMas') && Array.from($('tabMas').querySelectorAll('.field-label')).find(label => label.textContent.includes('Costo DTF'));
    if (dtfLabel) dtfLabel.closest('.card')?.classList.add('hidden');
  }

  function addFinanceBreakdown() {
    const grid = $('tabFin')?.querySelector('.stats-grid');
    if (!grid || $('kInv')) return;
    const investment = document.createElement('div');
    investment.className = 'stat-card expense';
    investment.innerHTML = '<small>INVERSIÓN EN PRENDAS Y DISEÑO</small><b id="kInv">$0</b>';
    const profit = document.createElement('div');
    profit.className = 'stat-card profit';
    profit.innerHTML = '<small>UTILIDAD REAL</small><b id="kProfit">$0</b>';
    grid.append(investment, profit);

    const original = window.kpis;
    if (typeof original === 'function' && !original.__valyraFinanceWrapped) {
      const wrapped = function () {
        original.apply(this, arguments);
        const movements = Array.isArray(window.movs) ? window.movs : [];
        const income = movements.filter(row => row.tipo === 'ingreso').reduce((sum, row) => sum + (Number(row.monto) || 0), 0);
        const expenses = movements.filter(row => row.tipo === 'egreso');
        const invested = expenses.filter(row => /prendas|dtf|diseño|camisa/i.test(`${row.cat || ''} ${row.concepto || ''}`))
          .reduce((sum, row) => sum + (Number(row.monto) || 0), 0);
        if ($('kInv')) $('kInv').textContent = window.money(invested);
        if ($('kProfit')) $('kProfit').textContent = window.money(income - expenses.reduce((sum, row) => sum + (Number(row.monto) || 0), 0));
      };
      wrapped.__valyraFinanceWrapped = true;
      window.kpis = wrapped;
    }
    window.kpis?.();
  }

  function init() {
    setupSections();
    addInventoryMenu();
    setupInventoryTabNavigation();
    orderedSizes();
    improveSizePicker();
    improveQuotePriceOptions();
    improvePriceLabels();
    addFinanceBreakdown();
    // Keep existing saved finance/inventory screens in sync after each update.
    window.renderMas?.();
    window.renderPrecios?.();
    window.kpis?.();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
