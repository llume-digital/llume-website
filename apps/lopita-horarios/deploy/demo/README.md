# Demo privada: web de Lopita + app de horarios

Dos direcciones en un dominio propio (el de Yume), en un único servidor:

| Dirección (ejemplo) | Qué hay | Cómo se entra |
|---|---|---|
| `lopita.demo.<dominio>` (`LOPITA_WEB_DOMINIO`) | La web nueva de Lopita (`web/`) | Usuario y contraseña de la demo, los pide el navegador |
| `horarios.lopita.demo.<dominio>` (`LOPITA_DOMINIO`) | La app de horarios (intranet) | Su propio login: encargado (todo) y empleados |

Ninguna se deja indexar (`X-Robots-Tag: noindex` y `robots.txt`). Los formularios de la web y la carta los sirve la
app: lo que se envía desde la web aparece en la pestaña **Web** de la app.

## 1. Servidor

Cualquier máquina Linux con Docker y los puertos 80 y 443 abiertos (por ejemplo, Oracle Cloud Always Free en Madrid o
un Hetzner CX22). Instala Docker y clona el repositorio:

```sh
curl -fsSL https://get.docker.com | sh
git clone https://github.com/llume-digital/llume-website.git && cd llume-website/apps/lopita-horarios
```

## 2. DNS

En el gestor del dominio, dos registros **A** que apunten a la IP pública del servidor:
`lopita.demo` y `horarios.lopita.demo` (o los nombres que se elijan). Caddy saca los certificados HTTPS solo, en cuanto
los registros resuelven.

## 3. Configuración

```sh
cp .env.example .env
python3 -c "import secrets;print(secrets.token_hex(32))"   # pégalo en LOPITA_SECRET
```

En `.env`: `LOPITA_DOMINIO`, `LOPITA_WEB_DOMINIO`, `LOPITA_PUBLIC_URL=https://<LOPITA_DOMINIO>`, `LOPITA_SECRET`,
`LOPITA_ADMIN_USER` y `LOPITA_ADMIN_PASSWORD` (primer encargado; después se cambia desde la app) y
`LOPITA_SEED=ejemplo` si se quiere empezar con los datos de ejemplo (o `vacio`).

Contraseña de la web (se pide por teclado y solo se guarda el hash):

```sh
sh herramientas/crear_acceso_web.sh demo
```

Fotos, logos y cartas de la web actual (lopita.es):

```sh
sh herramientas/descargar_recursos_web.sh
```

## 4. Arrancar

```sh
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d --build
docker compose cp web/recursos/cartas lopita:/tmp/cartas
docker compose exec lopita python -m app.cli documento carta-cafeteria /tmp/cartas/carta-cafeteria.pdf
docker compose exec lopita python -m app.cli documento carta-comidas /tmp/cartas/carta-comidas.pdf
```

(Las cartas también se pueden subir desde la app: pestaña Web → Subir PDF.)

## 5. Comprobar

- `https://<LOPITA_WEB_DOMINIO>` pide usuario y contraseña y enseña la web; los formularios dicen «¡Gracias!».
- `https://<LOPITA_DOMINIO>` enseña el login de la app; tras entrar, la pestaña Web tiene lo enviado.
- Para actualizar: `git pull` y el mismo `docker compose ... up -d --build`. Los datos están en el volumen
  `lopita-datos` (copia diaria en `/data/copias`).

## Variante Cloudflare (dominio en Cloudflare, p. ej. llumedigital.com)

Si el DNS del dominio está en Cloudflare, esta variante no abre puertos en el servidor y deja **web e intranet
privadas con Cloudflare Access** (solo entran los correos autorizados, con un código que les llega por correo).

| Pieza | Dónde | Dirección (ejemplo) |
|---|---|---|
| Web de Lopita | Cloudflare Pages (gratis) | `lopita.demo.llumedigital.com` |
| Intranet | Servidor propio + túnel de Cloudflare | `horarios.lopita.demo.llumedigital.com` |

**0. Servidor gratuito en Oracle Cloud (opcional)**

La capa «Always Free» de Oracle incluye máquinas ARM (Ampere A1) de hasta 4 núcleos y 24 GB. La imagen de la app
construye y resuelve en ARM (lo comprueba el job `imagen-arm` de CI), y `cloudflared` también tiene imagen ARM.

- Crear la instancia: forma `VM.Standard.A1.Flex` con 2 OCPU y 12 GB, Ubuntu 24.04 (aarch64) y la clave SSH pública.
  Si responde «Out of capacity», probar otro dominio de disponibilidad o más tarde.
- No hace falta abrir puertos: el túnel sale del servidor hacia Cloudflare. Basta el SSH (22) que viene abierto.
- Oracle puede recuperar las instancias gratuitas que pasan 7 días casi sin uso de CPU, red y memoria. Pasar la
  cuenta a «Pay As You Go» lo evita y no cobra nada mientras se quede dentro de los límites gratuitos; si no, conviene
  tener las copias de `copias` fuera del servidor.
- Instalar Docker: `curl -fsSL https://get.docker.com | sh`.

**1. Intranet en el servidor**

```sh
cp .env.example .env    # LOPITA_SECRET, LOPITA_ADMIN_*, LOPITA_PUBLIC_URL, LOPITA_PROXY_SECRETO (cadena aleatoria)
```

En Cloudflare Zero Trust → Networks → Tunnels: crear un túnel, copiar su token en `CLOUDFLARE_TUNNEL_TOKEN` y añadir
el «public hostname» `horarios.lopita.demo.llumedigital.com` → `http://lopita:8000`. Después:

```sh
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d --build lopita copias cloudflared
```

**2. Web en Cloudflare Pages** (conectada al repositorio de GitHub)

- Comando de build: `sh herramientas/construir_web_pages.sh` · Directorio de salida: `salida/web`.
- Variables: `LOPITA_WEB_PRIVADA=1`, `INTRANET_URL=https://horarios.lopita.demo.llumedigital.com`,
  `LOPITA_PROXY_SECRETO` (el mismo que en el `.env`), `ACCESS_CLIENT_ID` y `ACCESS_CLIENT_SECRET` (paso 3).
- Dominio personalizado: `lopita.demo.llumedigital.com`.
- `functions/api/web/[[ruta]].js` reenvía a la intranet solo los dos formularios y la carta.

**3. Cloudflare Access** (Zero Trust → Access → Applications)

- Una aplicación por dirección (web e intranet), con la política «Allow» para los correos autorizados.
- Un token de servicio (Access → Service Auth) para la función de Pages, y en la aplicación de la intranet una
  política «Service Auth» que lo permita: así los formularios de la web llegan a la intranet.
- Duración de la sesión de 1 mes, para que en el iPhone no pida el código cada vez.

**4. Compartir con el administrador**: añadir su correo a las dos aplicaciones de Access, crearle la cuenta de
encargado en la intranet (Ajustes → Cuentas) y mandarle el enlace. En el iPhone, Safari → Compartir → «Añadir a
pantalla de inicio»; en Windows, Edge → menú → «Aplicaciones» → «Instalar este sitio como una aplicación».

## Paso a producción

La web se publica en `lopita.es` (Cloudflare Pages o el mismo Caddy sin `acceso-web.caddy`) y la app en
`horarios.lopita.es`, copiando el volumen de datos o con exportar/importar desde Ajustes. Antes de meter datos reales
del personal de Lopita en un servidor de Yume hace falta un contrato de encargado de tratamiento entre las dos.
