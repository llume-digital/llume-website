#!/usr/bin/env bash
# Genera un enlace de invitación de un solo uso (48 h) para que una persona del equipo elija su contraseña del panel
# /admin. Sirve para la primera persona (después, cualquiera puede invitar desde la pestaña Equipo) o si nadie puede entrar.
# El enlace solo se imprime aquí: en la base de datos se guarda su sha256.
#
#   scripts/invitar.sh pachu            → producción (llumedigital.com)
#   scripts/invitar.sh pachu --local    → base local de `npx wrangler dev` (http://localhost:8787)
set -euo pipefail
cd "$(dirname "$0")/.."

nombre="${1:-}"
if [[ ! "$nombre" =~ ^[A-Za-z0-9._-]{1,40}$ ]]; then
  echo "Uso: scripts/invitar.sh <nombre de la persona> [--local]" >&2
  exit 1
fi
if [[ "${2:-}" == "--local" ]]; then destino="--local"; base="http://localhost:8787"; else destino="--remote"; base="https://llumedigital.com"; fi
# Cuenta de Cloudflare de llume (info@llume.net), donde están el Worker y la base de datos
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-337ee4ee11f19c00435cb1151cb59516}"

token="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
hash="$(printf '%s' "$token" | shasum -a 256 | cut -d' ' -f1)"
ahora="$(date +%s)"
sql="INSERT INTO invitaciones (hash, persona_id, creada, caduca)
  SELECT '$hash', id, $ahora, $((ahora + 48 * 3600)) FROM personas WHERE lower(nombre) = lower('$nombre') AND activa = 1;
SELECT changes() AS creadas;"

salida="$(npx --yes wrangler@4.168.0 d1 execute llume-cerebro "$destino" --command "$sql" --json 2>&1)" || { echo "$salida" >&2; exit 1; }
if ! printf '%s' "$salida" | grep -q '"creadas": 1'; then
  echo "No hay ninguna persona activa llamada «${nombre}»." >&2
  exit 1
fi
echo
echo "Enlace de invitación para ${nombre} (un solo uso, caduca en 48 h). Pásaselo por un canal privado:"
echo
echo "  $base/admin/invitacion?t=$token"
echo
