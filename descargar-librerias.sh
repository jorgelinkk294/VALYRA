#!/bin/sh
# Ejecuta esto UNA vez (con internet) dentro de la carpeta libs/ y vuelve a subir a Netlify.
# En Windows 10/11 puedes pegar los 3 comandos curl en PowerShell o CMD.
curl -L -o html2pdf.bundle.min.js https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js
curl -L -o chart.umd.min.js https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js
curl -L -o exceljs.min.js https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js
