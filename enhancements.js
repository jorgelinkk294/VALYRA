'use strict';

// VALYRA improvements. This file is loaded by the service worker after the
// page HTML. The app itself boots asynchronously from #appSrc, so wait for its
// public handlers before wiring any enhancements.
(function () {
  const $ = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const shirtTypes = [
    'Playera Cuello V', 'Playera Premium', 'Playera Tipo Polo',
    'Playera Cuello Redondo Manga Larga', 'Playera Sublimac',
    'Playera Cuello Redondo Manga Corta', 'Playera Deportiva', 'Playera Bold',
    'Camiseta', 'Deportiva', 'Camisa Manga Larga',
    'Sudadera Unisex Premium Cuello Redondo',
    'Sudadera Unisex Premium Capucha y Cangurera',
    'Sudadera Unisex Premium Capucha y Cierre'
  ];

  async function readArray(key) {
    try {
      if (!window.store) return [];
      const raw = await window.store.getItem(key);
      const value = JSON.parse(raw || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) { return []; }
  }

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
    if (!more || $('tabInv')) return;
    const inventoryLabel = findLabel(more, 'inventario');
    const inventoryCard = nextCard(inventoryLabel);
    if (!inventoryLabel || !inventoryCard) return;

    const inventoryTab = document.createElement('section');
    inventoryTab.id = 'tabInv';
    inventoryTab.className = 'hidden';
    inventoryTab.innerHTML = '<div class="page-heading"><h1>Inventario</h1><p>Controla las existencias de tus prendas por color y talla.</p></div>';
    inventoryLabel.textContent = 'Existencias de playeras';
    inventoryTab.append(inventoryLabel, inventoryCard);
    $('tabHome').after(inventoryTab);

    [['clientes'], ['precio de estampado']].forEach(([needle]) => {
      const label = findLabel(more, needle);
      if (!label) return;
      const card = nextCard(label);
      label.remove();
      if (card) card.remove();
    });
    // Existing app renderers expect these legacy nodes even when their screens
    // are no longer displayed.
    const legacy = document.createElement('div');
    legacy.className = 'hidden';
    legacy.innerHTML = '<input id="cliBuscar"><div id="cliList"></div><div id="clientesList"></div><div id="posList"></div>';
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
      const description = more.querySelector('small');
      if (title) title.textContent = 'Respaldo';
      if (description) description.textContent = 'Respaldo y ajustes del negocio';
    }
  }

  function setupInventoryNavigation() {
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
      if (!fromPop) history.replaceState({ tab: 'inv' }, '');
      window.scrollTo(0, 0);
    };
    wrapped.__valyraInventoryWrapped = true;
    window.showTab = wrapped;
  }

  function setupPricing() {
    const positions = $('posChips');
    if (positions && positions.closest('.field')) positions.closest('.field').classList.add('hidden');
    // Keep the existing type selector and price lookup: its handlers use the
    // app's lexical state, so replacing it from another script breaks the APK.
    const labels = Array.from(document.querySelectorAll('#tabPre .field-label'));
    labels.forEach(label => {
      const text = label.textContent.trim().toLocaleLowerCase('es-MX');
      if (text === 'costo ($)') label.textContent = 'Costo completo por camisa con diseño ($)';
      if (text === 'precio de venta ($)') label.textContent = 'Precio final de venta por camisa ($)';
    });
    const heading = $('tabPre') && $('tabPre').querySelector('.page-heading p');
    if (heading) heading.textContent = 'Define el costo total de cada camisa con diseño y el precio al que la venderás. Puedes editar estos valores cuando quieras.';
    const stampLabel = $('tabMas') && Array.from($('tabMas').querySelectorAll('.field-label'))
      .find(label => label.textContent.toLocaleLowerCase('es-MX').includes('costo dtf'));
    if (stampLabel && stampLabel.closest('.card')) stampLabel.closest('.card').classList.add('hidden');
  }

  function setupFinance() {
    const grid = $('tabFin') && $('tabFin').querySelector('.stats-grid');
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
        readArray('valyra_v7').then(movements => {
          const income = movements.filter(row => row.tipo === 'ingreso')
            .reduce((sum, row) => sum + (Number(row.monto) || 0), 0);
          const expenses = movements.filter(row => row.tipo === 'egreso');
          const invested = expenses.filter(row => /prendas|dtf|diseño|camisa/i.test(`${row.cat || ''} ${row.concepto || ''}`))
            .reduce((sum, row) => sum + (Number(row.monto) || 0), 0);
          const totalExpenses = expenses.reduce((sum, row) => sum + (Number(row.monto) || 0), 0);
          if ($('kInv')) $('kInv').textContent = money(invested);
          if ($('kProfit')) $('kProfit').textContent = money(income - totalExpenses);
        });
      };
      wrapped.__valyraFinanceWrapped = true;
      window.kpis = wrapped;
    }
    if (typeof window.kpis === 'function') window.kpis();
  }

  function init() {
    setupSections();
    setupInventoryNavigation();
    addInventoryMenu();
    setupPricing();
    setupFinance();
    if (typeof window.renderMas === 'function') window.renderMas();
    if (typeof window.renderPrecios === 'function') window.renderPrecios();
    if (typeof window.kpis === 'function') window.kpis();
  }

  let attempts = 0;
  function waitForApp() {
    if (typeof window.showTab === 'function' && typeof window.setSize === 'function') {
      init();
      return;
    }
    attempts += 1;
    if (attempts < 120) window.setTimeout(waitForApp, 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForApp, { once: true });
  else waitForApp();
})();
