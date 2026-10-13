"""Generate the blog (Spanish): public/blog/index.html and one page per article.

To add an article, append a dict to POSTS and run:

    python3 scripts/build_blog.py

Then add the new URL to public/sitemap.xml.
"""
import html
import json
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"
BASE = "https://llumedigital.com"
BEACON = """  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "067b84e48590464ea55b033a36a010bc"}'></script>"""

POSTS = [
    {
        "slug": "automatizar-presupuestos",
        "title": "Cómo automatizar los presupuestos de tu empresa, paso a paso",
        "desc": "Guía práctica para dejar de preparar presupuestos a mano: qué ordenar primero, cómo definir las reglas de cálculo y cómo mantener el control humano.",
        "date": "2026-10-13",
        "read": "6 min",
        "tag": "Automatización",
        "case": ("presupuestos", "Presupuestos automáticos"),
        "body": """
<p>Preparar un presupuesto parece una tarea pequeña, pero se repite muchas veces a la semana: buscar la tarifa, copiar los datos del cliente, revisar condiciones, darle formato y enviarlo. Si en tu empresa cada presupuesto lleva más de media hora, es uno de los primeros procesos que merece la pena automatizar.</p>
<h2>Por qué los presupuestos son un buen punto de partida</h2>
<p>Tienen tres características que los hacen ideales: siguen siempre una estructura parecida, se basan en datos que ya tienes (tarifas, servicios, condiciones) y un error cuesta dinero o imagen. Automatizarlos ahorra tiempo y, sobre todo, elimina errores de copia.</p>
<h2>Paso 1. Ordena lo que ya tienes</h2>
<p>Antes de tocar ninguna herramienta, reúne en un solo sitio tus tarifas, los servicios o productos que ofreces, los descuentos habituales y las condiciones (plazos, forma de pago, validez). Muchas veces este paso destapa incoherencias: precios distintos en documentos distintos o condiciones que nadie recuerda por qué existen.</p>
<h2>Paso 2. Decide de dónde llegan las peticiones</h2>
<p>¿Te piden presupuesto por correo, por teléfono, desde un formulario web o por WhatsApp? Cuantos menos canales, mejor. Lo ideal es que la petición entre siempre con los mismos datos mínimos: quién la pide, qué necesita y cuándo. Un formulario sencillo en tu web suele bastar.</p>
<h2>Paso 3. Escribe las reglas de cálculo</h2>
<p>Aquí está el corazón del sistema. Pon por escrito cómo calculas un presupuesto: qué partidas incluye cada servicio, cuándo aplicas un descuento, cómo cambian los precios según la cantidad o la urgencia. Si una persona nueva pudiera hacer un presupuesto correcto siguiendo esas reglas, un sistema también puede.</p>
<h2>Paso 4. Crea una plantilla con tu imagen</h2>
<p>El documento final debe salir siempre igual: logotipo, datos de la empresa, tabla de partidas, total, impuestos y condiciones. Una plantilla bien hecha transmite profesionalidad y evita que cada persona del equipo lo haga a su manera.</p>
<h2>Paso 5. Mantén la revisión humana</h2>
<p>Automatizar no significa enviar a ciegas. Lo recomendable es que el sistema prepare el presupuesto y una persona lo revise con un clic antes de enviarlo. Así ganas velocidad sin perder el control, y con el tiempo puedes decidir qué presupuestos sencillos salen solos.</p>
<h2>Paso 6. Haz seguimiento</h2>
<p>Un presupuesto enviado no es una venta. Registra cuáles están pendientes, cuáles se aceptan y cuáles se rechazan, y programa un recordatorio si el cliente no responde en unos días. Con esos datos sabrás qué servicios se venden mejor y dónde ajustar precios.</p>
<h2>Errores habituales</h2>
<ul>
<li><strong>Automatizar el desorden:</strong> si las tarifas no están claras, el sistema solo repetirá el caos más rápido.</li>
<li><strong>Querer cubrir todos los casos desde el principio:</strong> empieza por el 80&nbsp;% de los presupuestos, los más habituales y deja los especiales para más adelante.</li>
<li><strong>Olvidar al equipo:</strong> quien hace hoy los presupuestos sabe dónde están las excepciones; cuenta con esa persona desde el primer día.</li>
</ul>
<h2>¿Por dónde empezar?</h2>
<p>Calcula cuánto tiempo dedica tu equipo a los presupuestos con nuestra <a href="/#calculadora">calculadora</a>. Si la cifra te sorprende, podemos ayudarte a montarlo: en una primera llamada de 30 minutos te decimos cómo lo haríamos en tu caso.</p>
""",
    },
    {
        "slug": "crm-a-medida",
        "title": "7 señales de que tu empresa necesita un CRM a medida (y cuándo no)",
        "desc": "Cómo saber si te basta con un CRM estándar o si tu forma de trabajar pide una herramienta propia, con señales concretas para decidir.",
        "date": "2026-10-13",
        "read": "5 min",
        "tag": "Software a medida",
        "case": ("clevercar", "Clevercar: software interno de gestión de clientes"),
        "body": """
<p>Un CRM es la herramienta donde vive la relación con tus clientes: quiénes son, qué te han pedido, en qué punto está cada operación y qué toca hacer después. Hay muchos CRM estándar en el mercado y, para muchas empresas, son la mejor opción. Pero no para todas.</p>
<h2>Siete señales de que el estándar se te queda corto</h2>
<ol>
<li><strong>Tu proceso tiene fases que ningún CRM contempla.</strong> Si vendes algo que pasa por pasos muy concretos (compra en otro país, transporte, trámites administrativos, instalación), las fases genéricas de «lead, oportunidad, cliente» no te sirven.</li>
<li><strong>Cada persona del equipo usa el CRM de una forma distinta.</strong> Cuando la herramienta no encaja, cada uno se inventa su sistema y la información deja de ser comparable.</li>
<li><strong>Sigues necesitando hojas de cálculo al lado.</strong> Si el CRM existe pero los datos importantes siguen en Excel, es que no recoge lo que de verdad necesitas.</li>
<li><strong>Los documentos están en otro sitio.</strong> Facturas, contratos, certificados o fotos que deberían estar asociados a cada cliente acaban repartidos entre correo y carpetas.</li>
<li><strong>Pagas licencias por funciones que no usas.</strong> Muchos CRM cobran por usuario y por módulo; a veces pagas mucho por usar un 20&nbsp;% de la herramienta.</li>
<li><strong>Integrarlo con tus otras herramientas es una pelea.</strong> Si conectar el CRM con tu facturación, tu web o tus formularios requiere parches constantes, el coste oculto crece cada mes.</li>
<li><strong>Para saber cómo va algo, hay que preguntar.</strong> La señal más clara: si la información está en la cabeza de las personas y no en el sistema.</li>
</ol>
<h2>Cuándo no necesitas un CRM a medida</h2>
<p>Si tu proceso comercial es sencillo y parecido al de muchas otras empresas, si tu equipo es pequeño y un CRM estándar cubre lo que haces, no tiene sentido construir uno propio. En ese caso, lo que suele faltar no es una herramienta nueva, sino configurar bien la que tienes y conectarla con el resto.</p>
<h2>Qué ganas con uno a medida</h2>
<ul>
<li>Fases, campos y documentos que reflejan exactamente cómo trabajas.</li>
<li>Alertas pensadas para tus plazos reales, no para un proceso genérico.</li>
<li>Integración directa con lo que ya usas, sin depender de módulos de pago.</li>
<li>Sin licencias por usuario: no dependes de las subidas de precio de un proveedor.</li>
</ul>
<h2>Cómo decidir</h2>
<p>Haz una lista de las tres cosas que más tiempo os hacen perder en la gestión de clientes. Si un CRM estándar las resuelve, adelante. Si ninguna encaja del todo, merece la pena hablarlo. En nuestro caso de <a href="/casos/clevercar">Clevercar</a> puedes ver cómo un CRM propio ordenó un proceso de importación de vehículos con muchas fases.</p>
""",
    },
    {
        "slug": "migrar-base-de-datos-nube",
        "title": "Cómo migrar una base de datos antigua a la nube sin parar el negocio",
        "desc": "Las fases de una migración segura de una base de datos heredada a la nube: auditoría, plan por fases, validación y vuelta atrás.",
        "date": "2026-10-13",
        "read": "6 min",
        "tag": "Nube",
        "case": ("nube", "De una base de datos antigua a la nube"),
        "body": """
<p>Muchas empresas funcionan sobre una base de datos que se montó hace años. Funciona, pero cada vez cuesta más mantenerla, depende de muy pocas personas y nadie se atreve a tocarla. Migrarla a la nube da miedo, y es lógico: si algo sale mal, el negocio se para. La buena noticia es que una migración bien planificada se puede hacer sin interrupciones.</p>
<h2>1. Audita antes de mover nada</h2>
<p>El primer paso es entender qué hay: qué tablas existen, cuáles se usan de verdad, qué procesos y aplicaciones leen o escriben en ellas y qué datos son críticos. Es habitual encontrar tablas abandonadas, duplicados y dependencias que nadie recordaba. Esta foto inicial evita sorpresas a mitad de camino.</p>
<h2>2. Diseña el destino, no solo copies</h2>
<p>Migrar es una oportunidad para ordenar. Define cómo será la nueva base de datos: qué estructura tendrá, qué datos se limpian o se descartan, quién podrá acceder y cómo se harán las copias de seguridad. Copiar tal cual un sistema desordenado solo traslada el problema.</p>
<h2>3. Migra por fases</h2>
<p>En lugar de un «gran apagón» de fin de semana, divide la migración en partes. Empieza por datos menos críticos, comprueba que todo funciona y avanza. Durante un tiempo, ambos sistemas pueden convivir y sincronizarse, de modo que el día del cambio definitivo sea casi un trámite.</p>
<h2>4. Valida con datos reales</h2>
<p>Cada fase necesita una comprobación objetiva: el número de registros coincide, los totales cuadran y los procesos clave dan el mismo resultado en el sistema antiguo y en el nuevo. Automatizar estas comprobaciones permite repetirlas tantas veces como haga falta.</p>
<h2>5. Ten siempre un plan de vuelta atrás</h2>
<p>Antes de cada paso, decide cómo volverías al estado anterior si algo falla. Saber que existe esa red de seguridad es lo que permite avanzar con tranquilidad.</p>
<h2>6. Deja el sistema mejor de lo que estaba</h2>
<ul>
<li><strong>Copias de seguridad automáticas</strong>, probadas, no solo configuradas.</li>
<li><strong>Monitorización</strong> para enterarte de un problema antes que tus clientes.</li>
<li><strong>Documentación</strong> para que el conocimiento no dependa de una sola persona.</li>
</ul>
<h2>¿Cuánto se tarda?</h2>
<p>Depende del volumen de datos y, sobre todo, de cuántas aplicaciones dependen de la base de datos. Lo importante es que el negocio siga funcionando durante todo el proceso. Si estás en esta situación, en una llamada de 30 minutos te contamos cómo lo plantearíamos; puedes ver un ejemplo en nuestro caso de <a href="/casos/nube">migración a la nube</a>.</p>
""",
    },
]


def head(title, desc, url, schema, og_type="website"):
    return f"""<!doctype html>
<html lang="es" class="no-webgl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} · llume</title>
  <meta name="description" content="{html.escape(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="{og_type}">
  <meta property="og:locale" content="es_ES">
  <meta property="og:site_name" content="llume">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{html.escape(title)}">
  <meta property="og:description" content="{html.escape(desc)}">
  <meta property="og:image" content="{BASE}/assets/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#07070a">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">{json.dumps(schema, ensure_ascii=False)}</script>
</head>
<body>
  <header class="nav scrolled" id="nav">
    <a href="/" class="logo" aria-label="llume"><img src="/assets/mark.svg" alt="" width="20" height="24"><span>llume.</span></a>
    <a href="/#contacto" class="btn btn-light btn-sm">Hablemos <span aria-hidden="true">→</span></a>
  </header>
"""


FOOT = f"""  <footer class="footer">
    <div class="wrap foot-bottom"><span>© 2026 llume</span><span><a href="/">Volver a la web</a> · <a href="/blog/">Blog</a> · <a href="/aviso-legal">Aviso legal</a> · <a href="/privacidad">Privacidad</a></span></div>
  </footer>
  <script type="module" src="/ui.js"></script>
{BEACON}
</body>
</html>
"""


def crumbs(*items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}


def article(p):
    url = f"{BASE}/blog/{p['slug']}"
    schema = {"@context": "https://schema.org", "@graph": [
        {"@type": "BlogPosting", "headline": p["title"], "description": p["desc"], "datePublished": p["date"], "dateModified": p["date"],
         "inLanguage": "es", "image": f"{BASE}/assets/og.png", "mainEntityOfPage": url,
         "author": {"@type": "Organization", "name": "llume", "url": BASE + "/"},
         "publisher": {"@type": "Organization", "name": "llume", "logo": {"@type": "ImageObject", "url": f"{BASE}/assets/og.png"}}},
        crumbs(("Inicio", BASE + "/"), ("Blog", BASE + "/blog/"), (p["title"], url)),
    ]}
    others = "".join(f'<li><a href="/blog/{o["slug"]}">{o["title"]}</a></li>' for o in POSTS if o["slug"] != p["slug"])
    case_slug, case_name = p["case"]
    return head(p["title"], p["desc"], url, schema, "article") + f"""  <main class="wrap post">
    <nav class="crumbs" aria-label="Migas de pan"><a href="/">Inicio</a> <span>/</span> <a href="/blog/">Blog</a></nav>
    <p class="eyebrow">{p['tag']} · {p['read']} de lectura</p>
    <h1>{p['title']}</h1>
    <p class="lead">{p['desc']}</p>
    <article class="post-body">{p['body']}</article>
    <aside class="post-case"><p class="eyebrow">Caso relacionado</p><a href="/casos/{case_slug}">{case_name} <span aria-hidden="true">→</span></a></aside>
    <div class="offer">
      <div>
        <h3>¿Lo hablamos?</h3>
        <p>Explícanos qué necesitas y te llamamos. Primera reunión de 30 minutos, gratis y sin compromiso.</p>
        <a href="/#contacto" class="btn btn-light">Hablemos <span aria-hidden="true">→</span></a>
      </div>
    </div>
    <nav class="more-cases" aria-label="Más artículos"><p class="eyebrow">Más artículos</p><ul>{others}</ul></nav>
  </main>
""" + FOOT


def index():
    url = f"{BASE}/blog/"
    desc = "Guías prácticas sobre automatización, software a medida y migración a la nube para empresas."
    schema = {"@context": "https://schema.org", "@graph": [
        {"@type": "Blog", "name": "Blog de llume", "url": url, "inLanguage": "es", "description": desc},
        crumbs(("Inicio", BASE + "/"), ("Blog", url))]}
    cards = "".join(f"""
      <a class="post-card" href="/blog/{p['slug']}">
        <p class="cx-tag">{p['tag']} · {p['read']}</p>
        <h2>{p['title']}</h2>
        <p>{p['desc']}</p>
        <span class="card-link">Leer artículo <span aria-hidden="true">→</span></span>
      </a>""" for p in POSTS)
    return head("Blog: guías de transformación digital para empresas", desc, url, schema) + f"""  <main class="wrap post">
    <nav class="crumbs" aria-label="Migas de pan"><a href="/">Inicio</a> <span>/</span> <span>Blog</span></nav>
    <p class="eyebrow">Blog</p>
    <h1>Guías prácticas para digitalizar tu empresa</h1>
    <p class="lead">{desc} Sin humo y con ejemplos reales.</p>
    <div class="post-list">{cards}
    </div>
  </main>
""" + FOOT


def main():
    out = PUBLIC / "blog"
    out.mkdir(exist_ok=True)
    (out / "index.html").write_text(index())
    for p in POSTS:
        (out / f"{p['slug']}.html").write_text(article(p))
    print("\n".join(["/blog/"] + [f"/blog/{p['slug']}" for p in POSTS]))


if __name__ == "__main__":
    main()
