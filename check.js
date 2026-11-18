// Revisión automática de VALYRA (sin dependencias). Uso: node tools/check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const errors = [], notes = [];
const fail = msg => errors.push(msg);

// 1. Sintaxis de cada script
['storage.js', 'app.js', 'enhancements.js', 'sw.js', 'version.js'].forEach(f => {
  try { new vm.Script(read(f), { filename: f }); } catch (e) { fail(f + ': ' + e.message); }
});

// 2. Manifiesto: JSON válido y archivos que menciona
let manifest = {};
try { manifest = JSON.parse(read('manifest.webmanifest')); } catch (e) { fail('manifest.webmanifest: ' + e.message); }
const listed = []
  .concat((manifest.icons || []).map(i => i.src))
  .concat((manifest.screenshots || []).map(i => i.src))
  .concat((manifest.shortcuts || []).flatMap(s => (s.icons || []).map(i => i.src)));
listed.forEach(f => { if (!fs.existsSync(path.join(root, f))) fail('El manifiesto menciona un archivo que no existe: ' + f); });

// 3. Archivos que usa index.html (excepto vendor/ y CDN)
const html = read('index.html');
[...html.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"?#]+)"/g)].map(m => m[1]).forEach(f => {
  if (f.startsWith('vendor/')) { if (!fs.existsSync(path.join(root, f))) notes.push('Falta ' + f + ' (se usará el CDN; ejecuta "Descargar librerías").'); return; }
  if (!fs.existsSync(path.join(root, f))) fail('index.html usa un archivo que no existe: ' + f);
});
if (!/enhancements\.js/.test(html + read('app.js') )) fail('Ningún archivo carga enhancements.js');

// 4. Que no vuelva a pasar: nada de código incrustado dentro de index.html que contenga </body> o </script>
if ((html.match(/<\/body>/gi) || []).length !== 1) fail('index.html debe tener un solo </body>');

// 5. Versión y archivos vigilados
const ctx = { self: {} }; vm.createContext(ctx); vm.runInContext(read('version.js'), ctx);
if (!/^\d+\.\d+\.\d+$/.test(ctx.self.VALYRA_VERSION || '')) fail('version.js: VALYRA_VERSION debe verse como 1.2.3');
(ctx.self.VALYRA_WATCH || []).forEach(f => { if (!fs.existsSync(path.join(root, f))) fail('version.js vigila un archivo que no existe: ' + f); });
const sw = read('sw.js');
['styles.css', 'storage.js', 'app.js', 'enhancements.js', 'version.js'].forEach(f => {
  if (sw.indexOf("'" + f + "'") < 0) fail('sw.js no guarda en caché ' + f);
});

notes.forEach(n => console.log('AVISO:', n));
if (errors.length) { errors.forEach(e => console.error('ERROR:', e)); process.exit(1); }
console.log('Todo bien. Versión ' + ctx.self.VALYRA_VERSION);
