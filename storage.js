// Almacenamiento de VALYRA: IndexedDB (mucho mas espacio que localStorage).
// Expone `store` con la misma interfaz que localStorage (getItem/setItem/removeItem/key/length)
// y `storeReady`, una promesa que se cumple cuando los datos ya estan cargados en memoria.
// Si IndexedDB no esta disponible, usa localStorage. Migra solo los datos antiguos de localStorage.
(function () {
  var DB_NAME = 'valyra', STORE = 'kv';
  var mem = new Map(), pending = new Set(), db = null;

  function fail(e) { try { if (window.store.onError) window.store.onError(e); } catch (x) {} }

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('sin IndexedDB'));
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = r.onblocked = function () { reject(r.error || new Error('bloqueado')); };
    });
  }

  function loadAll() {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
      var keys = st.getAllKeys(), vals = st.getAll();
      tx.oncomplete = function () {
        keys.result.forEach(function (k, i) { mem.set(k, vals.result[i]); });
        resolve();
      };
      tx.onerror = tx.onabort = function () { reject(tx.error); };
    });
  }

  function track(p) { pending.add(p); p.then(function () { pending.delete(p); }); }

  function write(op, key, value) {
    if (!db) {
      try { op === 'put' ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch (e) { fail(e); }
      return;
    }
    track(new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, 'readwrite');
        op === 'put' ? tx.objectStore(STORE).put(value, key) : tx.objectStore(STORE).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = function () { fail(tx.error); resolve(); };
      } catch (e) { fail(e); resolve(); }
    }));
  }

  window.store = {
    onError: null,
    getItem: function (k) { return mem.has(k) ? mem.get(k) : null; },
    setItem: function (k, v) { v = String(v); mem.set(k, v); write('put', k, v); },
    removeItem: function (k) { mem.delete(k); write('del', k); },
    key: function (i) { var a = Array.from(mem.keys()); return i < a.length ? a[i] : null; },
    get length() { return mem.size; },
    flush: function () { return Promise.all(Array.from(pending)); }
  };

  function fromLocalStorage(saveToDB) {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('valyra') === 0 && !mem.has(k)) {
          var v = localStorage.getItem(k);
          mem.set(k, v);
          if (saveToDB) write('put', k, v);
        }
      }
    } catch (e) {}
  }

  window.storeReady = openDB().then(function (d) {
    db = d;
    return loadAll();
  }).then(function () {
    if (!mem.has('__migrated')) {            // primera vez: pasar datos antiguos
      fromLocalStorage(true);
      mem.set('__migrated', '1');
      write('put', '__migrated', '1');
    }
  }).catch(function () {                      // sin IndexedDB: seguir con localStorage
    db = null;
    fromLocalStorage(false);
  }).then(function () {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  });
})();
