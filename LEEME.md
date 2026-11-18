# VALYRA - GitHub Pages y PWABuilder

La versión actual está en `version.js` (es el único lugar donde se cambia).

## Qué archivos hay
- `index.html`: la estructura de la app (pantallas y formularios).
- `styles.css`: todos los estilos.
- `storage.js`: guardado de datos en el dispositivo (IndexedDB).
- `app.js`: el código principal de la app.
- `enhancements.js`: mejoras (inventario, tallas agrupadas, precios, finanzas).
- `version.js`: número de versión y lista de archivos que vigila el aviso de actualización.
- `sw.js`: service worker (uso sin internet y aviso de actualización).
- `splash.mp4`: el video que se reproduce al abrir la app (reemplaza la animación anterior).
- `manifest.webmanifest`, `logo.png`, `icon-*.png`, `screenshots/`: datos e imágenes de la app.
- `vendor/`: librerías locales (html2pdf, Chart.js, ExcelJS). Ver "Librerías" abajo.
- `.github/workflows/`: revisiones automáticas de GitHub. `tools/check.js`: la revisión en sí.
- `.nojekyll`: hace que GitHub Pages sirva todos los archivos tal cual.

## Publicar en GitHub Pages
1. Sube el CONTENIDO de la carpeta (no el zip) a la raíz del repositorio.
   `index.html` debe quedar en la raíz, no dentro de otra carpeta.
2. Settings > Pages > Deploy from a branch > rama `main` y carpeta `/ (root)`.
3. Espera uno o dos minutos. Tu app queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.

## Librerías sin depender de internet (hazlo una sola vez)
1. En el repositorio entra a la pestaña **Actions** y acepta habilitar los flujos si te lo pide.
2. Elige **Descargar librerías** > **Run workflow**. Tarda menos de un minuto y crea la carpeta `vendor/` con los 3 archivos.
3. Si la página no se actualiza sola después, haz cualquier cambio pequeño (por ejemplo, en este LEEME) para que GitHub la vuelva a publicar.
Mientras `vendor/` esté vacía, la app usa los CDN como antes, así que nada se rompe.

## Generar la APK con PWABuilder
1. Entra a pwabuilder.com, pega la dirección de tu app y toca Start.
2. Revisa que el manifiesto y el service worker aparezcan en verde.
3. Package for stores > Android. Deja el nombre y el ID del paquete (por ejemplo `com.valyra.cotizador`) y genera una llave de firma nueva.
4. Descarga el paquete. Instala `VALYRA.apk`. Guarda `signing.keystore` y `signing-key-info.txt` en un lugar seguro: los necesitas para cada APK futura.

## Quitar la barra del navegador (compartir y tres puntitos) en la APK
Esa barra aparece porque Android no puede comprobar que la APK es dueña de la página. Se comprueba con un archivo
`assetlinks.json` que debe estar en la **raíz del dominio** (`https://TU-USUARIO.github.io/.well-known/assetlinks.json`),
no dentro de la carpeta del proyecto. Por eso:
1. Crea un repositorio público llamado exactamente `TU-USUARIO.github.io` (con tu usuario real de GitHub).
2. Sube lo que hay en la carpeta `repo-usuario.github.io` de este paquete: `.nojekyll` y `.well-known/assetlinks.json`.
3. Abre `assetlinks.json` y deja SOLO tus datos: `package_name` (el ID del paquete) y el SHA-256 que viene en
   `signing-key-info.txt`. PWABuilder también te da un `assetlinks.json` ya listo dentro de su zip: puedes usar ese tal cual.
4. En ese repositorio activa Settings > Pages > Deploy from a branch > `main` / `/ (root)`.
5. Comprueba que abre en el navegador: `https://TU-USUARIO.github.io/.well-known/assetlinks.json`.
6. Tu app puede seguir en el repositorio `VALYRA`; no hay que moverla. Android comprueba el dominio, no la carpeta.
7. Vuelve a abrir la APK. Si sigue la barra, haz Respaldo (Respaldo > exportar), desinstala la APK, instálala de nuevo y restaura.

## Actualizar la app
Cambia lo que necesites y súbelo al repositorio. La app detecta sola que hay cambios y muestra "Actualizar APK".
- Si agregas un archivo nuevo a la app, escríbelo en la lista `VALYRA_WATCH` de `version.js` y en `LOCAL` de `sw.js`.
- Sube el número en `version.js` cuando publiques algo importante (se ve en el pie de la app).
- No hace falta una APK nueva, salvo que cambies iconos, nombre o manifiesto.

## Revisión automática
Cada vez que subes cambios, GitHub corre **Revisar app** (pestaña Actions). Si sale una cruz roja, hay un error de
sintaxis o falta un archivo; el detalle dice cuál. También puedes correrlo en tu computadora: `node tools/check.js`.

## Atajos
Al mantener presionado el icono de la APK salen los atajos Cotizar, Finanzas y Registros (abren `./?tab=cot`, `fin`, `reg`).

## Datos
Se guardan dentro del dispositivo (IndexedDB). Antes de cambiar de dirección o de APK usa Respaldo para exportar un archivo `.json`, y restáuralo después en la app nueva.
