# VALYRA v4.1.1 - GitHub Pages y PWABuilder

## Que archivos hay
- `index.html`: la app completa (estilos, almacenamiento y codigo estan dentro). Es lo unico que hay que editar.
- `sw.js`: service worker (uso sin internet y aviso de actualizacion).
- `manifest.webmanifest`, `logo.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`: datos e imagenes de la app.
- `.nojekyll`: hace que GitHub Pages sirva todos los archivos tal cual.

## Publicar en GitHub Pages
1. Sube todos estos archivos a la raiz del repositorio.
2. En el repositorio: Settings > Pages > Deploy from a branch > rama `main` y carpeta `/ (root)`.
3. Espera uno o dos minutos. Tu app queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.
   Abre esa direccion en Chrome para comprobar que carga completa.

## Generar la APK con PWABuilder
1. Entra a pwabuilder.com, pega la direccion de tu app y toca Start.
2. Revisa que el manifiesto y el service worker aparezcan en verde.
3. Package for stores > Android. Deja el nombre y el ID del paquete (por ejemplo `com.valyra.cotizador`) y genera una llave de firma nueva.
4. Descarga el paquete. Instala `VALYRA.apk`. Guarda `signing.keystore` y `signing-key-info.txt` en un lugar seguro:
   los necesitas para cada APK futura.
5. Si el repositorio se llama `TU-USUARIO.github.io`, la app queda en la raiz y puedes subir `assetlinks.json`
   dentro de una carpeta `.well-known` para quitar la barra del navegador. Si el repositorio tiene otro nombre
   (subcarpeta), Android no puede confirmarlo y la app se ve con una barra arriba; funciona igual.

## Actualizar la app
Cambia `index.html` (o lo que necesites) y subelo al repositorio. La app detecta sola que hay cambios
y muestra la ventana "Actualizar APK". No hace falta generar una APK nueva, salvo que cambies iconos,
nombre o manifiesto.

## Datos
Se guardan dentro del dispositivo (IndexedDB). Antes de cambiar de direccion o de APK usa
Mas > Respaldo para exportar un archivo `.json`, y restauralo despues en la app nueva.
