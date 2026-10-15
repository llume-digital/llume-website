"""Generate the Training and FAQ pages in Spanish, English and Portuguese.

    python3 scripts/build_pages.py

Content lives in TRAINING and FAQ below.
"""
import html
import json
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"
BASE = "https://llumedigital.com"
BEACON = """  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "067b84e48590464ea55b033a36a010bc"}'></script>"""

SITE = {
    "es": {"lang": "es", "home": "/", "talk": "Hablemos", "back": "Volver a la web", "train": "formacion", "faq": "preguntas",
           "legal": ("/aviso-legal", "Aviso legal", "/privacidad", "Privacidad"), "og": "es_ES"},
    "en": {"lang": "en", "home": "/en/", "talk": "Let\'s talk", "back": "Back to the website", "train": "en/training", "faq": "en/faq",
           "legal": ("/en/legal-notice", "Legal notice", "/en/privacy", "Privacy"), "og": "en_GB"},
    "pt": {"lang": "pt-PT", "home": "/pt/", "talk": "Vamos falar", "back": "Voltar ao site", "train": "pt/formacao", "faq": "pt/perguntas",
           "legal": ("/pt/aviso-legal", "Aviso legal", "/pt/privacidade", "Privacidade"), "og": "pt_PT"},
}

FAQ = {
 "es": {
  "eyebrow": "Preguntas frecuentes",
  "h2": "Lo que nos<br>suelen preguntar.",
  "help": "<p class=\"faq-help-q\">¿No encuentras tu respuesta?</p>\n          <p>Escríbenos y te contestamos personalmente, sin respuestas automáticas.</p>\n          <div class=\"faq-help-actions\"><a class=\"btn btn-light btn-sm\" href=\"#contacto\">Hablemos <span aria-hidden=\"true\">→</span></a><a class=\"btn btn-ghost btn-sm\" href=\"mailto:info@llume.net\">Escríbenos</a>",
  "items": [
   [
    "¿Cuánto cuesta un proyecto?",
    "Depende del alcance. Tras la primera reunión te enviamos una propuesta por escrito con precio, plazos y entregables. Si no encaja, no pasa nada."
   ],
   [
    "¿Cuánto se tarda?",
    "Una automatización concreta puede estar funcionando en pocas semanas; una plataforma completa, en unos meses. Trabajamos con entregas cada dos semanas para que veas avances desde el principio."
   ],
   [
    "¿De quién es el código?",
    "Tuyo. Todo lo que desarrollamos para ti es de tu propiedad e incluye su documentación, para que puedas seguir con nosotros o con quien quieras."
   ],
   [
    "¿Trabajáis con empresas pequeñas?",
    "Sí, es con quien más trabajamos: pymes, autónomos y asociaciones. Adaptamos el alcance a tu tamaño y empezamos por lo que más impacto tiene."
   ],
   [
    "¿Dónde trabajáis?",
    "Estamos en Oviedo y trabajamos con clientes de España y Portugal, en remoto o en persona cuando hace falta."
   ],
   [
    "¿Qué pasa cuando termina el proyecto?",
    "Formamos a tu equipo y te entregamos la documentación. Después puedes contratar mantenimiento, seguir evolucionando la solución con nosotros o continuar por tu cuenta."
   ],
   [
    "¿Hay ayudas para financiar el proyecto?",
    "A veces sí. Cada cierto tiempo se abren ayudas públicas a la digitalización para pymes y autónomos. Te ayudamos a comprobar si hay alguna abierta que encaje con tu proyecto."
   ],
   [
    "¿Hacéis formación en IA para empresas?",
    "Sí. Formamos a equipos completos o por áreas, en persona u online, para usar la IA y las herramientas digitales en su trabajo diario: asistentes, automatizaciones y conexión con el correo, los documentos y el CRM. Preparamos una propuesta según tu equipo."
   ],
   [
    "¿Cómo tratáis nuestros datos?",
    "Con confidencialidad y conforme al RGPD. Accedemos solo a la información necesaria y, si lo necesitas, firmamos un acuerdo de confidencialidad antes de empezar."
   ]
  ]
 },
 "en": {
  "eyebrow": "FAQ",
  "h2": "What people<br>usually ask us.",
  "help": "<p class=\"faq-help-q\">Can't find your answer?</p>\n          <p>Write to us and a real person will reply, no automated answers.</p>\n          <div class=\"faq-help-actions\"><a class=\"btn btn-light btn-sm\" href=\"#contacto\">Let's talk <span aria-hidden=\"true\">→</span></a><a class=\"btn btn-ghost btn-sm\" href=\"mailto:info@llume.net\">Email us</a>",
  "items": [
   [
    "How much does a project cost?",
    "It depends on the scope. After the first call we send you a written proposal with price, timeline and deliverables. If it doesn't fit, no problem."
   ],
   [
    "How long does it take?",
    "A specific automation can be up and running in a few weeks; a complete platform, in a few months. We deliver every two weeks so you see progress from the start."
   ],
   [
    "Who owns the code?",
    "You do. Everything we build for you is your property and comes with its documentation, so you can continue with us or with anyone you choose."
   ],
   [
    "Do you work with small companies?",
    "Yes, they are who we work with most: SMEs, the self-employed and associations. We adapt the scope to your size and start with what has the most impact."
   ],
   [
    "Where do you work?",
    "We are based in Oviedo, Spain, and work with clients in Spain and Portugal, remotely or in person when needed."
   ],
   [
    "What happens when the project ends?",
    "We train your team and hand over the documentation. Then you can hire maintenance, keep evolving the solution with us or carry on by yourself."
   ],
   [
    "Are there grants to fund the project?",
    "Sometimes, yes. Public digitalisation grants for SMEs and the self-employed open from time to time. We help you check whether there is one open that fits your project."
   ],
   [
    "Do you offer AI training for companies?",
    "Yes. We train whole teams or specific areas, in person or online, to use AI and digital tools in their daily work: assistants, automations and connecting them with email, documents and the CRM. We prepare a proposal based on your team."
   ],
   [
    "How do you handle our data?",
    "Confidentially and in line with the GDPR. We only access the information we need and, if you wish, we sign a non-disclosure agreement before starting."
   ]
  ]
 },
 "pt": {
  "eyebrow": "Perguntas frequentes",
  "h2": "O que nos<br>costumam perguntar.",
  "help": "<p class=\"faq-help-q\">Não encontra a sua resposta?</p>\n          <p>Escreva-nos e responde-lhe uma pessoa, sem respostas automáticas.</p>\n          <div class=\"faq-help-actions\"><a class=\"btn btn-light btn-sm\" href=\"#contacto\">Vamos falar <span aria-hidden=\"true\">→</span></a><a class=\"btn btn-ghost btn-sm\" href=\"mailto:info@llume.net\">Escreva-nos</a>",
  "items": [
   [
    "Quanto custa um projeto?",
    "Depende do âmbito. Depois da primeira reunião enviamos uma proposta por escrito com preço, prazos e entregáveis. Se não encaixar, não há problema."
   ],
   [
    "Quanto tempo demora?",
    "Uma automação concreta pode estar a funcionar em poucas semanas; uma plataforma completa, em alguns meses. Fazemos entregas a cada duas semanas para que veja avanços desde o início."
   ],
   [
    "De quem é o código?",
    "Seu. Tudo o que desenvolvemos para si é sua propriedade e inclui a respetiva documentação, para que possa continuar connosco ou com quem quiser."
   ],
   [
    "Trabalham com empresas pequenas?",
    "Sim, é com quem mais trabalhamos: PME, trabalhadores independentes e associações. Adaptamos o âmbito à sua dimensão e começamos pelo que tem mais impacto."
   ],
   [
    "Onde trabalham?",
    "Estamos em Oviedo e trabalhamos com clientes em Espanha e Portugal, à distância ou presencialmente quando é necessário."
   ],
   [
    "O que acontece quando o projeto termina?",
    "Formamos a sua equipa e entregamos a documentação. Depois pode contratar manutenção, continuar a evoluir a solução connosco ou seguir por conta própria."
   ],
   [
    "Há apoios para financiar o projeto?",
    "Às vezes, sim. De tempos a tempos abrem apoios públicos à digitalização para PME. Ajudamo-lo a verificar se há algum aberto que se enquadre no seu projeto."
   ],
   [
    "Fazem formação em IA para empresas?",
    "Sim. Formamos equipas completas ou por áreas, presencialmente ou online, para usar a IA e as ferramentas digitais no trabalho diário: assistentes, automações e ligação ao e-mail, aos documentos e ao CRM. Preparamos uma proposta conforme a sua equipa."
   ],
   [
    "Como tratam os nossos dados?",
    "Com confidencialidade e em conformidade com o RGPD. Acedemos apenas à informação necessária e, se quiser, assinamos um acordo de confidencialidade antes de começar."
   ]
  ]
 }
}

TRAINING = {
    "es": {
        "title": "Formación en IA para empresas",
        "desc": "Formación práctica en inteligencia artificial para equipos: productividad, asistentes conectados, automatización sin código, Claude Code y uso seguro. En persona u online.",
        "eyebrow": "Formación",
        "h1": "Que tu equipo le saque todo el partido a la IA.",
        "lead": "No se trata de enseñar a chatear con una herramienta. Formamos a tu equipo para trabajar con IA de verdad: conectada a vuestros datos, con habilidades propias para cada puesto y automatizando lo repetitivo. Con casos de tu empresa, en persona u online.",
        "law": "Además, el Reglamento europeo de IA obliga a las empresas que usan IA a adoptar medidas para que su personal tenga un nivel suficiente de alfabetización en IA (artículo 4).",
        "why_h": "Cómo es nuestra formación",
        "why": [("Con tus casos reales", "Antes de empezar analizamos tareas reales de tu equipo y practicamos con ellas, no con ejemplos de manual."),
                ("Práctica desde el minuto uno", "Cada sesión termina con algo funcionando: una plantilla, una habilidad, una automatización."),
                ("Para cualquier nivel", "Desde quien nunca ha usado IA hasta equipos técnicos que quieren trabajar con agentes.")],
        "tracks_h": "Programas",
        "for": "Para",
        "tracks": [
            ("IA para dirección", "gerencia y mandos", "Dónde aporta valor la IA en tu empresa y dónde no, cómo priorizar y cómo organizar su adopción.",
             ["Mapa de oportunidades por área", "Casos reales, costes y límites", "Plan de adopción y reglas de uso"]),
            ("Productividad con IA para todo el equipo", "cualquier puesto", "Usar asistentes de IA a diario y con criterio para escribir, resumir, analizar y preparar trabajo.",
             ["Cómo pedirle las cosas para que funcione", "Correos, documentos e informes", "Hojas de cálculo y análisis de datos", "Revisar resultados y evitar errores"]),
            ("Tu asistente con superpoderes", "equipos que quieren ir más allá del chat", "Convertir la IA en una herramienta de trabajo conectada con tu empresa.",
             ["Proyectos con el contexto de tu empresa", "Habilidades (skills) reutilizables para cada puesto", "Artefactos: documentos, páginas y pequeñas herramientas", "Conectores con correo, calendario, documentos y CRM"]),
            ("Automatización sin código con IA", "administración, operaciones y atención al cliente", "Quitar trabajo repetitivo combinando IA y automatización, sin programar.",
             ["Correos y respuestas automáticas", "Leer documentos y extraer datos", "Informes que se preparan solos", "Flujos con Make, n8n o Zapier"]),
            ("Claude Code para equipos", "equipos técnicos y perfiles con curiosidad", "Trabajar con agentes que programan contigo: de la idea a una herramienta funcionando.",
             ["Scripts, webs y herramientas internas", "Trabajar con repositorios y revisar código", "Automatizar tareas con agentes", "Buenas prácticas, seguridad y calidad"]),
            ("IA segura y responsable", "toda la empresa", "Usar la IA sin poner en riesgo datos, clientes ni reputación.",
             ["Protección de datos y RGPD", "Qué exige el Reglamento europeo de IA", "Política de uso interna", "Errores, sesgos y fugas de información"]),
        ],
        "how_h": "Cómo funciona",
        "how": [("Antes", "Hablamos con tu equipo, vemos qué herramientas usáis y elegimos las tareas con las que practicar."),
                ("Durante", "Sesiones prácticas en tu empresa o en directo online, con ejercicios sobre vuestro trabajo real."),
                ("Después", "Materiales, grabaciones y un periodo para resolver dudas mientras lo aplicáis.")],
        "formats_h": "Formatos",
        "formats": [("Taller de introducción", "Media jornada para todo el equipo: qué puede hacer la IA en su día a día y primeros usos prácticos."),
                    ("Programa por niveles", "Varias sesiones, de lo básico a lo avanzado, combinando los programas que necesitéis."),
                    ("A medida por departamento", "Cada área practica con sus propios procesos y documentos."),
                    ("Acompañamiento posterior", "Sesiones de seguimiento para resolver dudas y llevar lo aprendido a más tareas.")],
        "get_h": "Qué se lleva tu equipo",
        "get": ["Una guía de uso de la IA adaptada a tu empresa", "Biblioteca de instrucciones y habilidades para cada puesto", "Plantillas y automatizaciones listas para usar", "Grabaciones y materiales de las sesiones", "Certificado de asistencia"],
        "tools": "Trabajamos con herramientas como Claude, Claude Code, ChatGPT, Microsoft Copilot, Gemini, Make o n8n, y nos adaptamos a las que ya uséis.",
        "cta_h": "¿Formamos a tu equipo?",
        "cta_p": "Cuéntanos cuántas personas sois, qué hacéis y qué herramientas usáis, y te enviamos una propuesta.",
        "cta": "Pedir propuesta de formación",
    },
    "en": {
        "title": "AI training for companies",
        "desc": "Hands-on artificial intelligence training for teams: productivity, connected assistants, no-code automation, Claude Code and safe use. In person or online.",
        "eyebrow": "Training",
        "h1": "Help your team get the most out of AI.",
        "lead": "This is not about learning to chat with a tool. We train your team to really work with AI: connected to your data, with skills built for each role and automating the repetitive work. With your own company's cases, in person or online.",
        "law": "What is more, the EU AI Act requires companies that use AI to take measures to ensure a sufficient level of AI literacy among their staff (Article 4).",
        "why_h": "What our training is like",
        "why": [("With your real cases", "Before we start, we look at your team's real tasks and practise with them, not with textbook examples."),
                ("Hands-on from minute one", "Every session ends with something working: a template, a skill, an automation."),
                ("For every level", "From people who have never used AI to technical teams that want to work with agents.")],
        "tracks_h": "Programmes",
        "for": "For",
        "tracks": [
            ("AI for leadership", "management and team leads", "Where AI adds value in your company and where it doesn't, how to prioritise and how to organise its adoption.",
             ["Opportunity map by area", "Real cases, costs and limits", "Adoption plan and usage rules"]),
            ("AI productivity for the whole team", "any role", "Using AI assistants every day, wisely, to write, summarise, analyse and prepare work.",
             ["How to ask so it works", "Emails, documents and reports", "Spreadsheets and data analysis", "Checking results and avoiding errors"]),
            ("Your assistant with superpowers", "teams that want to go beyond chat", "Turning AI into a work tool connected to your company.",
             ["Projects with your company's context", "Reusable skills for each role", "Artifacts: documents, pages and small tools", "Connectors to email, calendar, documents and CRM"]),
            ("No-code automation with AI", "admin, operations and customer service", "Removing repetitive work by combining AI and automation, without coding.",
             ["Automatic emails and replies", "Reading documents and extracting data", "Reports that prepare themselves", "Workflows with Make, n8n or Zapier"]),
            ("Claude Code for teams", "technical teams and curious profiles", "Working with agents that code alongside you: from idea to a working tool.",
             ["Scripts, websites and internal tools", "Working with repositories and reviewing code", "Automating tasks with agents", "Good practice, security and quality"]),
            ("Safe and responsible AI", "the whole company", "Using AI without putting data, customers or reputation at risk.",
             ["Data protection and GDPR", "What the EU AI Act requires", "Internal usage policy", "Errors, bias and data leaks"]),
        ],
        "how_h": "How it works",
        "how": [("Before", "We talk to your team, look at the tools you use and choose the tasks to practise with."),
                ("During", "Hands-on sessions at your company or live online, with exercises on your real work."),
                ("After", "Materials, recordings and a period to answer questions while you put it into practice.")],
        "formats_h": "Formats",
        "formats": [("Introductory workshop", "Half a day for the whole team: what AI can do in their day-to-day and first practical uses."),
                    ("Programme by levels", "Several sessions, from basic to advanced, combining the programmes you need."),
                    ("Tailored by department", "Each area practises with its own processes and documents."),
                    ("Follow-up support", "Follow-up sessions to answer questions and extend what was learned to more tasks.")],
        "get_h": "What your team takes away",
        "get": ["An AI usage guide adapted to your company", "A library of instructions and skills for each role", "Ready-to-use templates and automations", "Session recordings and materials", "Certificate of attendance"],
        "tools": "We work with tools such as Claude, Claude Code, ChatGPT, Microsoft Copilot, Gemini, Make or n8n, and adapt to the ones you already use.",
        "cta_h": "Shall we train your team?",
        "cta_p": "Tell us how many you are, what you do and which tools you use, and we'll send you a proposal.",
        "cta": "Request a training proposal",
    },
    "pt": {
        "title": "Formação em IA para empresas",
        "desc": "Formação prática em inteligência artificial para equipas: produtividade, assistentes ligados aos seus dados, automação sem código, Claude Code e uso seguro. Presencial ou online.",
        "eyebrow": "Formação",
        "h1": "Que a sua equipa tire todo o partido da IA.",
        "lead": "Não se trata de aprender a conversar com uma ferramenta. Formamos a sua equipa para trabalhar a sério com IA: ligada aos vossos dados, com competências próprias para cada função e a automatizar o repetitivo. Com casos da sua empresa, presencial ou online.",
        "law": "Além disso, o Regulamento europeu da IA obriga as empresas que usam IA a adotar medidas para que o seu pessoal tenha um nível suficiente de literacia em IA (artigo 4.º).",
        "why_h": "Como é a nossa formação",
        "why": [("Com os seus casos reais", "Antes de começar analisamos tarefas reais da sua equipa e praticamos com elas, não com exemplos de manual."),
                ("Prática desde o primeiro minuto", "Cada sessão termina com algo a funcionar: um modelo, uma competência, uma automação."),
                ("Para qualquer nível", "Desde quem nunca usou IA até equipas técnicas que querem trabalhar com agentes.")],
        "tracks_h": "Programas",
        "for": "Para",
        "tracks": [
            ("IA para a direção", "gestão e chefias", "Onde a IA acrescenta valor na sua empresa e onde não, como priorizar e como organizar a adoção.",
             ["Mapa de oportunidades por área", "Casos reais, custos e limites", "Plano de adoção e regras de uso"]),
            ("Produtividade com IA para toda a equipa", "qualquer função", "Usar assistentes de IA todos os dias e com critério para escrever, resumir, analisar e preparar trabalho.",
             ["Como pedir para que funcione", "E-mails, documentos e relatórios", "Folhas de cálculo e análise de dados", "Rever resultados e evitar erros"]),
            ("O seu assistente com superpoderes", "equipas que querem ir além do chat", "Transformar a IA numa ferramenta de trabalho ligada à sua empresa.",
             ["Projetos com o contexto da sua empresa", "Competências (skills) reutilizáveis para cada função", "Artefactos: documentos, páginas e pequenas ferramentas", "Conectores com e-mail, calendário, documentos e CRM"]),
            ("Automação sem código com IA", "administração, operações e apoio ao cliente", "Eliminar trabalho repetitivo combinando IA e automação, sem programar.",
             ["E-mails e respostas automáticas", "Ler documentos e extrair dados", "Relatórios que se preparam sozinhos", "Fluxos com Make, n8n ou Zapier"]),
            ("Claude Code para equipas", "equipas técnicas e perfis curiosos", "Trabalhar com agentes que programam consigo: da ideia a uma ferramenta a funcionar.",
             ["Scripts, sites e ferramentas internas", "Trabalhar com repositórios e rever código", "Automatizar tarefas com agentes", "Boas práticas, segurança e qualidade"]),
            ("IA segura e responsável", "toda a empresa", "Usar a IA sem pôr em risco dados, clientes nem reputação.",
             ["Proteção de dados e RGPD", "O que exige o Regulamento europeu da IA", "Política de uso interna", "Erros, enviesamentos e fugas de informação"]),
        ],
        "how_h": "Como funciona",
        "how": [("Antes", "Falamos com a sua equipa, vemos que ferramentas usam e escolhemos as tarefas para praticar."),
                ("Durante", "Sessões práticas na sua empresa ou em direto online, com exercícios sobre o vosso trabalho real."),
                ("Depois", "Materiais, gravações e um período para tirar dúvidas enquanto aplicam o que aprenderam.")],
        "formats_h": "Formatos",
        "formats": [("Workshop de introdução", "Meio dia para toda a equipa: o que a IA pode fazer no dia a dia e primeiros usos práticos."),
                    ("Programa por níveis", "Várias sessões, do básico ao avançado, combinando os programas de que precisarem."),
                    ("À medida por departamento", "Cada área pratica com os seus próprios processos e documentos."),
                    ("Acompanhamento posterior", "Sessões de acompanhamento para tirar dúvidas e levar o que aprenderam a mais tarefas.")],
        "get_h": "O que a sua equipa leva",
        "get": ["Um guia de uso da IA adaptado à sua empresa", "Biblioteca de instruções e competências para cada função", "Modelos e automações prontos a usar", "Gravações e materiais das sessões", "Certificado de presença"],
        "tools": "Trabalhamos com ferramentas como Claude, Claude Code, ChatGPT, Microsoft Copilot, Gemini, Make ou n8n, e adaptamo-nos às que já usam.",
        "cta_h": "Formamos a sua equipa?",
        "cta_p": "Diga-nos quantas pessoas são, o que fazem e que ferramentas usam, e enviamos uma proposta.",
        "cta": "Pedir proposta de formação",
    },
}


def head(code, title, desc, slug, schema):
    S = SITE[code]
    url = f"{BASE}/{slug}"
    alternates = "\n".join(f'  <link rel="alternate" hreflang="{k}" href="{BASE}/{v[slug_key(slug)]}">' for k, v in SITE.items())
    return f"""<!doctype html>
<html lang="{S['lang']}" class="no-webgl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} · llume</title>
  <meta name="description" content="{html.escape(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{url}">
{alternates}
  <meta property="og:type" content="website">
  <meta property="og:locale" content="{S['og']}">
  <meta property="og:site_name" content="llume">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{html.escape(title)} · llume">
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
    <a href="{S['home']}" class="logo" aria-label="llume"><img src="/assets/mark.svg" alt="" width="20" height="24"><span>llume.</span></a>
    <a href="{S['home']}#contacto" class="btn btn-light btn-sm">{S['talk']} <span aria-hidden="true">→</span></a>
  </header>
"""


def slug_key(slug):
    return "train" if any(slug == v["train"] for v in SITE.values()) else "faq"


def foot(code):
    S = SITE[code]
    l = S["legal"]
    return f"""  <footer class="footer">
    <div class="wrap foot-bottom"><span>© 2026 llume</span><span><a href="{S['home']}">{S['back']}</a> · <a href="{l[0]}">{l[1]}</a> · <a href="{l[2]}">{l[3]}</a></span></div>
  </footer>
  <script type="module" src="/ui.js"></script>
{BEACON}
</body>
</html>
"""


def training(code):
    T, S = TRAINING[code], SITE[code]
    schema = {"@context": "https://schema.org", "@type": "Service", "name": T["title"], "description": T["desc"],
              "provider": {"@type": "Organization", "name": "llume", "url": BASE + S["home"]},
              "areaServed": ["ES", "PT"], "serviceType": T["title"]}
    why = "".join(f'<div class="mini"><h3>{h}</h3><p>{p}</p></div>' for h, p in T["why"])
    tracks = "".join(f"""
        <article class="track-card">
          <span class="track-n">{i + 1:02d}</span>
          <h3>{n}</h3>
          <p class="track-for">{T['for']} {who}</p>
          <p>{d}</p>
          <ul class="card-list">{''.join(f'<li>{x}</li>' for x in items)}</ul>
        </article>""" for i, (n, who, d, items) in enumerate(T["tracks"]))
    how = "".join(f'<li><span class="step-chip">{k}</span><p>{p}</p></li>' for k, p in T["how"])
    fmts = "".join(f'<div class="t-fmt"><h4>{h}</h4><p>{p}</p></div>' for h, p in T["formats"])
    get = "".join(f"<li>{x}</li>" for x in T["get"])
    return head(code, T["title"], T["desc"], S["train"], schema) + f"""  <main class="wrap train-page">
    <p class="eyebrow">{T['eyebrow']}</p>
    <h1>{T['h1']}</h1>
    <p class="lead">{T['lead']}</p>
    <p class="law-note">{T['law']}</p>
    <div class="cta-row"><a href="{S['home']}#contacto" class="btn btn-light">{T['cta']} <span aria-hidden="true">→</span></a></div>

    <h2 class="page-h2">{T['why_h']}</h2>
    <div class="grid-3-why">{why}</div>

    <h2 class="page-h2">{T['tracks_h']}</h2>
    <div class="track-grid">{tracks}
    </div>
    <p class="t-tools">{T['tools']}</p>

    <div class="train-split">
      <div>
        <h2 class="page-h2">{T['how_h']}</h2>
        <ol class="how-list">{how}</ol>
        <h2 class="page-h2">{T['get_h']}</h2>
        <ul class="card-list get-list">{get}</ul>
      </div>
      <div>
        <h2 class="page-h2">{T['formats_h']}</h2>
        <div class="t-fmts">{fmts}</div>
      </div>
    </div>

    <div class="offer">
      <div>
        <h3>{T['cta_h']}</h3>
        <p>{T['cta_p']}</p>
        <a href="{S['home']}#contacto" class="btn btn-light">{T['cta']} <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </main>
""" + foot(code)


def faq_page(code):
    F, S = FAQ[code], SITE[code]
    title = {"es": "Preguntas frecuentes", "en": "Frequently asked questions", "pt": "Perguntas frequentes"}[code]
    desc = {"es": "Respuestas a lo que más nos preguntan: precio, plazos, propiedad del código, tamaño de empresa, formación y datos.",
            "en": "Answers to what we get asked most: price, timelines, code ownership, company size, training and data.",
            "pt": "Respostas ao que mais nos perguntam: preço, prazos, propriedade do código, dimensão da empresa, formação e dados."}[code]
    def txt(x):
        import re
        return html.unescape(re.sub(r"<[^>]+>", "", x)).strip()
    schema = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": txt(q), "acceptedAnswer": {"@type": "Answer", "text": txt(a)}} for q, a in F["items"]]}
    items = "".join(f'\n        <details name="faq"><summary>{q}</summary><p>{a}</p></details>' for q, a in F["items"])
    help_html = F["help"].replace(' href="#contacto"', f' href="{S["home"]}#contacto"')
    return head(code, title, desc, S["faq"], schema) + f"""  <main class="wrap section faq-section faq-page">
    <div class="faq-intro">
      <p class="eyebrow">{F['eyebrow']}</p>
      <h1>{F['h2']}</h1>
      <div class="faq-help">
        {help_html}
      </div>
    </div>
    <div class="faq">{items}
    </div>
  </main>
""" + foot(code)


def main():
    for code, S in SITE.items():
        for slug, render in ((S["train"], training), (S["faq"], faq_page)):
            out = PUBLIC / f"{slug}.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(render(code))
            print(f"/{slug}")


if __name__ == "__main__":
    main()
