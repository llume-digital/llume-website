#!/bin/sh
# Prepara la web de Lopita para Cloudflare Pages en salida/web.
#   Comando de build en Pages: sh herramientas/construir_web_pages.sh    · Directorio de salida: salida/web
# Las rutas /api/web/* las atiende functions/api/web/[[ruta]].js, que las reenvía a la intranet.
# Con LOPITA_WEB_PRIVADA=1 (la demo) la web pide no ser indexada.
set -eu
cd "$(dirname "$0")/.."
sh herramientas/descargar_recursos_web.sh || echo "Aviso: no se pudieron descargar todas las fotos de lopita.es" >&2
rm -rf salida/web
mkdir -p salida/web/fonts
cp -R web/. salida/web/
rm -rf salida/web/recursos/cartas  # las cartas las sirve la intranet
cp lopita_horarios/assets/fonts/fonts.css lopita_horarios/assets/fonts/*.woff2 lopita_horarios/assets/fonts/OFL-*.txt salida/web/fonts/
{
  echo "/*"
  echo "  X-Content-Type-Options: nosniff"
  echo "  X-Frame-Options: DENY"
  echo "  Referrer-Policy: same-origin"
  if [ "${LOPITA_WEB_PRIVADA:-0}" = "1" ]; then echo "  X-Robots-Tag: noindex, nofollow"; fi
} > salida/web/_headers
if [ "${LOPITA_WEB_PRIVADA:-0}" = "1" ]; then printf 'User-agent: *\nDisallow: /\n' > salida/web/robots.txt; fi
echo "Web lista en salida/web"
