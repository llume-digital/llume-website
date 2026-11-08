FROM python:3.14-slim

# WITH_PDF=1 añade Chromium para exportar a PDF desde el servidor (la imagen pasa de ~400 MB a ~1 GB).
# Sin él, el botón «Imprimir» del navegador sigue permitiendo guardar en PDF.
ARG WITH_PDF=0

# FORWARDED_ALLOW_IPS: de quién se aceptan las cabeceras X-Forwarded-* (IP del cliente, https). Por defecto solo de
# la propia máquina; docker-compose.yml lo abre a la red interna, donde solo está Caddy.
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    LOPITA_DB=/data/lopita.db PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers FORWARDED_ALLOW_IPS=127.0.0.1

WORKDIR /app
# requirements.txt tiene todas las versiones fijadas (se genera desde requirements.in)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && if [ "$WITH_PDF" = "1" ]; then pip install --no-cache-dir playwright && python -m playwright install --with-deps chromium; fi

COPY lopita_horarios ./lopita_horarios
COPY app ./app
COPY datos/ejemplo.json ./datos/ejemplo.json

RUN useradd --create-home lopita && mkdir -p /data && chown lopita /data
USER lopita
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/healthz')"
# Un solo proceso: la caché de alertas vive en memoria y el motor ya usa todos los núcleos en cada cálculo.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
