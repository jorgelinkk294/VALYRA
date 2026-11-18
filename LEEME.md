# VALYRA v4.0.0 — como publicar en Netlify

1. Sube/arrastra TODA esta carpeta a Netlify (no hace falta build; publish directory = la raiz).
2. (Recomendado) Descarga las librerias una vez: entra a `libs/` y ejecuta `descargar-librerias.sh`
   (o pega los 3 `curl` en PowerShell). Con eso PDF, graficas y Excel funcionan sin internet.
   Si `libs/` esta vacia, la app usa los CDN como antes.
3. Para cada actualizacion: solo vuelve a subir la carpeta. La app detecta sola que cambiaron archivos y
   muestra la ventana con el logo "Actualizar APK"; al tocarla se limpia la cache y se recarga con lo nuevo.
   (Ya no hace falta cambiar numeros de version; `APP_VERSION` es solo el numero que se ve en el pie.)
4. APK: si es TWA/PWABuilder basta con redesplegar; solo regenera el APK si cambias iconos, nombre o manifest.

Datos: ahora se guardan en IndexedDB. Los datos antiguos de localStorage se migran solos la primera vez
(la copia vieja no se borra). Usa Mas > Respaldo para exportar un archivo .json.
