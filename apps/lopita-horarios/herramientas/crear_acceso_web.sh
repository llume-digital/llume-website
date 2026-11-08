#!/bin/sh
# Crea (o cambia) el usuario y la contraseña que pide la web de la demo: deploy/demo/acceso-web.caddy.
#   sh herramientas/crear_acceso_web.sh <usuario>
# La contraseña se pide por teclado y solo se guarda su hash (bcrypt). Después: docker compose ... restart caddy
set -eu
cd "$(dirname "$0")/.."
usuario="${1:?Uso: sh herramientas/crear_acceso_web.sh <usuario>}"
case "$usuario" in *[!A-Za-z0-9._-]*) echo "El usuario solo puede llevar letras, números, punto, guion y guion bajo" >&2; exit 1;; esac
hash=$(docker run --rm -it caddy:2.10 caddy hash-password | tr -d '\r' | tail -n 1)
umask 077
printf 'basic_auth {\n\t%s %s\n}\n' "$usuario" "$hash" > deploy/demo/acceso-web.caddy
echo "Guardado en deploy/demo/acceso-web.caddy (no se sube al repositorio)."
