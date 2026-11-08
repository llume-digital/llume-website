#!/bin/sh
# Descarga de lopita.es las fotos, logos y cartas que usa la web nueva (web/recursos/).
# Se ejecuta una vez desde un ordenador o servidor con acceso a internet:
#   sh herramientas/descargar_recursos_web.sh
# Después, sube las cartas a la app (pestaña Web, o `python -m app.cli documento carta-cafeteria <pdf>`).
set -eu
cd "$(dirname "$0")/.."
IMG=web/recursos/img
CARTAS=web/recursos/cartas
mkdir -p "$IMG" "$CARTAS"
U=https://lopita.es/wp-content/uploads

bajar() {  # bajar <url> <destino>
  if [ -s "$2" ]; then echo "ya está: $2"; return; fi
  curl -fsSL --retry 3 -o "$2.tmp" "$1" && mv "$2.tmp" "$2" && echo "ok: $2" || { rm -f "$2.tmp"; echo "FALLO: $1" >&2; }
}

for f in 2023/06/logo-blanco-vertical-02.svg 2023/06/Lopita-blanco-02.svg 2023/06/LopitaCo_Principal_Color_RGB-300x300.jpg \
         2023/08/Lopita-IG-10.jpg 2023/08/Lopita-IG-7.jpg 2023/06/carta-fotos-02.png 2023/06/carta-fotos-04.png \
         2023/06/dsc8218-scaled.webp 2023/06/PRTR_BLANCO_2-1024x216-1-1.png 2023/06/Europea_WHITE_Outline-1024x284-1-1.png \
         2025/06/P1065968-768x512.jpg 2025/06/P1066526-768x512.jpg 2025/06/P1065762-768x512.jpg 2025/06/P1066035-768x512.jpg \
         2025/06/P1065860-768x512.jpg 2025/06/P1065668-2-768x512.jpg 2025/06/P1065928-768x512.jpg 2025/06/P1066385-768x512.jpg; do
  bajar "$U/$f" "$IMG/$(basename "$f")"
done
bajar "$U/elementor/thumbs/P1066071-scaled-r75ipxlgaj96mh01hku0yqp5eix3fbo4xv2eym65i0.jpg" "$IMG/P1066071.jpg"
bajar "$U/2026/09/Carta-Lopita-Co.-Octubre-2026-1.pdf" "$CARTAS/carta-cafeteria.pdf"
bajar "$U/2026/09/Carta-de-comidas-Lopita-Co.-Sept.-2026.pdf" "$CARTAS/carta-comidas.pdf"
