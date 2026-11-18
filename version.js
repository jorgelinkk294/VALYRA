// ÚNICO lugar donde se cambia la versión de VALYRA.
// La usan la app (pie de página y mensajes), el service worker (nombre del caché)
// y la lista de archivos que se vigilan para avisar "Actualizar APK".
self.VALYRA_VERSION = '4.3.0';

// Si agregas un archivo nuevo a la app, ponlo aquí para que el aviso de actualización lo detecte.
self.VALYRA_WATCH = [
  'index.html', 'styles.css', 'storage.js', 'app.js', 'enhancements.js',
  'version.js', 'manifest.webmanifest', 'logo.png'
];
