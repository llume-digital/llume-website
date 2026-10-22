"""Generate the Training and FAQ pages in Spanish, English and Portuguese.

    python3 scripts/build_pages.py

Content lives in TRAINING and FAQ below.
"""
import html
import json
from pathlib import Path

SKIP = {'es': 'Saltar al contenido', 'en': 'Skip to content', 'pt': 'Saltar para o conteúdo'}

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

FAQ = {'es': {'eyebrow': 'Preguntas frecuentes',
        'h2': 'Antes de empezar,<br>conviene tenerlo claro.',
        'help': '<p class="faq-help-q">¿Tienes una pregunta concreta?</p>\n'
                '          <p>Cuéntanos el contexto y te orientamos sobre el siguiente paso.</p>\n'
                '          <div class="faq-help-actions"><a class="btn btn-light btn-sm" '
                'href="#contacto">Hablemos <span aria-hidden="true">→</span></a><a class="btn btn-ghost btn-sm" '
                'href="mailto:info@llumedigital.com">Escríbenos</a></div>',
        'items': [('¿En qué puede ayudar llume a mi empresa?',
                   'Analizamos tareas y procesos para proponer soluciones de automatización, integración de '
                   'herramientas, migración a la nube, aplicaciones a medida o visión artificial. La '
                   'recomendación depende del problema y de las herramientas que ya utilizas.'),
                  ('¿Cómo empezamos?',
                   'Puedes pedir una primera conversación de 30 minutos, gratuita y sin compromiso. Nos explicas '
                   'el reto y valoramos si podemos ayudarte. Si hay encaje, preparamos una propuesta con alcance, '
                   'entregables, calendario y precio antes de empezar.'),
                  ('¿Cuánto cuesta y cuánto tarda un proyecto?',
                   'Depende de su alcance, complejidad e integraciones. La propuesta concreta el precio y el '
                   'calendario; no damos un plazo o ahorro estándar que sirva para todos los proyectos.'),
                  ('¿Necesito conocimientos técnicos?',
                   'No. Empezamos por cómo trabaja tu equipo y explicamos las opciones en lenguaje claro. Si una '
                   'solución requiere cambios en tus sistemas, concretamos antes qué accesos y decisiones hacen '
                   'falta.'),
                  ('¿Qué recibimos al terminar?',
                   'Los entregables, documentación, formación y soporte se detallan en la propuesta. También '
                   'dejamos acordado qué incluye el mantenimiento y qué gastos recurrentes, como licencias o '
                   'alojamiento, dependen de terceros.'),
                  ('¿De quién es el código y qué pasa con las licencias?',
                   'La propuesta y el contrato deben especificar la titularidad y entrega del desarrollo, así '
                   'como las licencias de componentes o servicios de terceros. Lo dejamos claro antes de iniciar '
                   'el trabajo.'),
                  ('¿Cómo se gestionan nuestros datos?',
                   'Antes de acceder a datos del proyecto, acordamos qué información es necesaria, quién puede '
                   'acceder y qué servicios externos intervienen. Las condiciones aplicables y los canales para '
                   'ejercer derechos están en la Política de privacidad.'),
                  ('¿Ofrecéis formación para equipos?',
                   'Sí. Podemos preparar formación práctica sobre herramientas digitales e IA, adaptada a las '
                   'tareas y al nivel del equipo. El formato, contenido y duración se concretan en la '
                   'propuesta.')]},
 'en': {'eyebrow': 'Frequently asked questions',
        'h2': 'Before we start,<br>let’s make it clear.',
        'help': '<p class="faq-help-q">Have a specific question?</p>\n'
                '          <p>Tell us a little about the context and we’ll suggest a useful next step.</p>\n'
                '          <div class="faq-help-actions"><a class="btn btn-light btn-sm" href="#contacto">Let’s '
                'talk <span aria-hidden="true">→</span></a><a class="btn btn-ghost btn-sm" '
                'href="mailto:info@llumedigital.com">Email us</a></div>',
        'items': [('How can llume help my company?',
                   'We look at tasks and processes and may suggest automation, tool integration, cloud migration, '
                   'custom applications or computer vision. The right approach depends on the problem and the '
                   'tools you already use.'),
                  ('How do we get started?',
                   'You can request a free, no-obligation 30-minute introductory call. Tell us about the '
                   'challenge and we’ll assess whether we can help. If there is a fit, we’ll prepare a proposal '
                   'with scope, deliverables, timeline and price before work begins.'),
                  ('How much does a project cost and how long does it take?',
                   'It depends on scope, complexity and integrations. The proposal sets out the price and '
                   'timeline; we do not promise a standard schedule or saving for every project.'),
                  ('Do I need technical skills?',
                   'No. We start with how your team works and explain the options in plain language. If a '
                   'solution requires changes to your systems, we agree in advance what access and decisions are '
                   'needed.'),
                  ('What do we receive at the end?',
                   'Deliverables, documentation, training and support are described in the proposal. We also '
                   'clarify maintenance and any recurring costs, such as third-party licences or hosting.'),
                  ('Who owns the code, and what about licences?',
                   'The proposal and contract should set out ownership and handover of the work, along with '
                   'licences for third-party components or services. We clarify this before starting.'),
                  ('How do you handle our data?',
                   'Before accessing project data, we agree what information is needed, who can access it and '
                   'which external services are involved. Applicable terms and ways to exercise your rights are '
                   'described in the Privacy Policy.'),
                  ('Do you offer team training?',
                   'Yes. We can prepare practical training on digital tools and AI, tailored to your team’s tasks '
                   'and experience. Format, content and duration are agreed in the proposal.')]},
 'pt': {'eyebrow': 'Perguntas frequentes',
        'h2': 'Antes de começar,<br>vale a pena esclarecer.',
        'help': '<p class="faq-help-q">Tem uma pergunta concreta?</p>\n'
                '          <p>Conte-nos o contexto e ajudamos a definir o próximo passo.</p>\n'
                '          <div class="faq-help-actions"><a class="btn btn-light btn-sm" href="#contacto">Vamos '
                'falar <span aria-hidden="true">→</span></a><a class="btn btn-ghost btn-sm" '
                'href="mailto:info@llumedigital.com">Escreva-nos</a></div>',
        'items': [('Como pode a llume ajudar a minha empresa?',
                   'Analisamos tarefas e processos para propor soluções de automação, integração de ferramentas, '
                   'migração para a cloud, aplicações à medida ou visão artificial. A recomendação depende do '
                   'problema e das ferramentas que já utiliza.'),
                  ('Como começamos?',
                   'Pode pedir uma primeira conversa de 30 minutos, gratuita e sem compromisso. Explique-nos o '
                   'desafio e avaliamos se podemos ajudar. Se fizer sentido, preparamos uma proposta com âmbito, '
                   'entregáveis, calendário e preço antes de começar.'),
                  ('Quanto custa e quanto tempo demora um projeto?',
                   'Depende do âmbito, da complexidade e das integrações. A proposta especifica o preço e o '
                   'calendário; não prometemos um prazo ou uma poupança padrão para todos os projetos.'),
                  ('Preciso de conhecimentos técnicos?',
                   'Não. Começamos por perceber como trabalha a sua equipa e explicamos as opções com clareza. Se '
                   'a solução exigir alterações nos seus sistemas, combinamos previamente os acessos e as '
                   'decisões necessárias.'),
                  ('O que recebemos no final?',
                   'Os entregáveis, a documentação, a formação e o suporte ficam descritos na proposta. Também '
                   'clarificamos a manutenção e os custos recorrentes, como licenças ou alojamento de terceiros.'),
                  ('A quem pertence o código e como funcionam as licenças?',
                   'A proposta e o contrato devem definir a titularidade e a entrega do desenvolvimento, bem como '
                   'as licenças de componentes ou serviços de terceiros. Clarificamos tudo antes de começar.'),
                  ('Como tratam os nossos dados?',
                   'Antes de aceder aos dados do projeto, combinamos que informação é necessária, quem pode '
                   'aceder e que serviços externos são utilizados. As condições aplicáveis e os meios para '
                   'exercer os seus direitos estão na Política de privacidade.'),
                  ('Fazem formação para equipas?',
                   'Sim. Podemos preparar formação prática sobre ferramentas digitais e IA, adaptada às tarefas e '
                   'à experiência da equipa. O formato, o conteúdo e a duração são definidos na proposta.')]}}

TRAINING = {
    "es": {
        "title": "Formación en IA para empresas",
        "desc": "Formación práctica en inteligencia artificial para equipos en tres sesiones: conocemos tu empresa y hacemos dos talleres de 3 horas con ejercicios sobre vuestro trabajo real, con guía final.",
        "eyebrow": "Formación",
        "h1": "Que tu equipo le saque todo el partido a la IA.",
        "lead": "Una formación práctica en tres sesiones, pensada para tu empresa. Primero entendemos cómo trabajáis y después hacemos dos talleres con ejercicios sobre vuestras tareas reales. Vale para cualquier herramienta de IA.",
        "law": "Además, el Reglamento europeo de IA obliga a las empresas que usan IA a adoptar medidas para que su personal tenga un nivel suficiente de alfabetización en IA (artículo 4).",
        "sessions_h": "Cómo es la formación",
        "sessions": [
            ("Sesión 1", "Antes de formar", "Conocemos cómo trabajáis",
             "Hablamos con el equipo para entender a qué os dedicáis, qué herramientas usáis y qué tareas os quitan más tiempo. Con eso preparamos los ejercicios de los talleres.",
             ["Tareas y procesos del día a día", "Herramientas que ya usáis", "Nivel de partida del equipo", "Casos reales con los que practicar"]),
            ("Sesión 2", "Taller práctico · 3 h", "Trabajar con IA en el día a día",
             "Los fundamentos para usar la IA con criterio y sacarle partido desde el primer día.",
             ["Cómo funcionan los modelos y qué pueden hacer (y qué no)", "Elegir el modelo y el nivel de esfuerzo adecuados para cada tarea", "Pedir bien: instrucciones, contexto y ejemplos", "Gestionar conversaciones: bifurcar, rebobinar y retomar", "Revisar resultados y evitar errores", "Ejercicios con vuestros correos, documentos e informes"]),
            ("Sesión 3", "Taller práctico · 3 h", "De asistente a agente",
             "Llevar la IA más allá del chat: que conozca vuestra empresa, trabaje con vuestras herramientas y haga tareas por vosotros.",
             ["Archivos de instrucciones para agentes (AGENTS.md y similares): tu empresa explicada a la IA", "Habilidades reutilizables para cada puesto", "Conectar la IA con el correo, el calendario, los documentos y el CRM", "Automatizar tareas repetitivas y correos", "Crear documentos y pequeñas herramientas sin programar", "Seguridad y protección de datos"]),
        ],
        "guide_h": "Y al final, una guía para seguir por vuestra cuenta",
        "guide_p": "Un documento adaptado a tu empresa con todo lo trabajado en los talleres:",
        "guide": ["Las instrucciones y habilidades creadas para vuestros puestos", "Plantillas de peticiones para las tareas más habituales", "Qué modelo y nivel de esfuerzo usar para cada tipo de tarea", "Buenas prácticas y normas de uso para el equipo"],
        "tools": "Es independiente de la herramienta: trabajamos con ChatGPT, Claude, Gemini, Microsoft Copilot o la que uséis.",
        "mods": ["En persona, en tu empresa", "Online, en directo", "Para todo el equipo o por áreas"],
        "cta_h": "¿Formamos a tu equipo?",
        "cta_p": "Cuéntanos cuántas personas sois, qué hacéis y qué herramientas usáis, y te enviamos una propuesta.",
        "cta": "Pedir propuesta de formación",
    },
    "en": {
        "title": "AI training for companies",
        "desc": "Hands-on artificial intelligence training for teams in three sessions: we get to know your company and run two 3-hour workshops with exercises on your real work, plus a final guide.",
        "eyebrow": "Training",
        "h1": "Help your team get the most out of AI.",
        "lead": "Hands-on training in three sessions, designed around your company. First we understand how you work, then we run two workshops with exercises on your real tasks. It works with any AI tool.",
        "law": "What is more, the EU AI Act requires companies that use AI to take measures to ensure a sufficient level of AI literacy among their staff (Article 4).",
        "sessions_h": "How the training works",
        "sessions": [
            ("Session 1", "Before the training", "We get to know how you work",
             "We talk to your team to understand what you do, which tools you use and which tasks take up most of your time. We use that to prepare the workshop exercises.",
             ["Day-to-day tasks and processes", "Tools you already use", "Your team's starting level", "Real cases to practise with"]),
            ("Session 2", "Hands-on workshop · 3 h", "Working with AI every day",
             "The fundamentals to use AI wisely and get value from day one.",
             ["How models work and what they can (and can't) do", "Choosing the right model and effort level for each task", "Asking well: instructions, context and examples", "Managing conversations: branching, rewinding and resuming", "Checking results and avoiding errors", "Exercises with your own emails, documents and reports"]),
            ("Session 3", "Hands-on workshop · 3 h", "From assistant to agent",
             "Taking AI beyond chat: so it knows your company, works with your tools and does tasks for you.",
             ["Instruction files for agents (AGENTS.md and similar): your company explained to the AI", "Reusable skills for each role", "Connecting AI to email, calendar, documents and the CRM", "Automating repetitive tasks and emails", "Creating documents and small tools without coding", "Security and data protection"]),
        ],
        "guide_h": "And at the end, a guide to keep going on your own",
        "guide_p": "A document adapted to your company with everything covered in the workshops:",
        "guide": ["The instructions and skills created for your roles", "Prompt templates for your most common tasks", "Which model and effort level to use for each kind of task", "Good practice and usage rules for the team"],
        "tools": "It is tool-independent: we work with ChatGPT, Claude, Gemini, Microsoft Copilot or whichever you use.",
        "mods": ["In person, at your company", "Online, live", "For the whole team or by area"],
        "cta_h": "Shall we train your team?",
        "cta_p": "Tell us how many you are, what you do and which tools you use, and we'll send you a proposal.",
        "cta": "Request a training proposal",
    },
    "pt": {
        "title": "Formação em IA para empresas",
        "desc": "Formação prática em inteligência artificial para equipas em três sessões: conhecemos a sua empresa e fazemos dois workshops de 3 horas com exercícios sobre o vosso trabalho real, com guia final.",
        "eyebrow": "Formação",
        "h1": "Que a sua equipa tire todo o partido da IA.",
        "lead": "Uma formação prática em três sessões, pensada para a sua empresa. Primeiro percebemos como trabalham e depois fazemos dois workshops com exercícios sobre as vossas tarefas reais. Serve para qualquer ferramenta de IA.",
        "law": "Além disso, o Regulamento europeu da IA obriga as empresas que usam IA a adotar medidas para que o seu pessoal tenha um nível suficiente de literacia em IA (artigo 4.º).",
        "sessions_h": "Como é a formação",
        "sessions": [
            ("Sessão 1", "Antes da formação", "Conhecemos como trabalham",
             "Falamos com a equipa para perceber o que fazem, que ferramentas usam e que tarefas vos ocupam mais tempo. Com isso preparamos os exercícios dos workshops.",
             ["Tarefas e processos do dia a dia", "Ferramentas que já usam", "Nível de partida da equipa", "Casos reais para praticar"]),
            ("Sessão 2", "Workshop prático · 3 h", "Trabalhar com IA no dia a dia",
             "Os fundamentos para usar a IA com critério e tirar partido dela desde o primeiro dia.",
             ["Como funcionam os modelos e o que conseguem fazer (e o que não)", "Escolher o modelo e o nível de esforço adequados a cada tarefa", "Pedir bem: instruções, contexto e exemplos", "Gerir conversas: bifurcar, recuar e retomar", "Rever resultados e evitar erros", "Exercícios com os vossos e-mails, documentos e relatórios"]),
            ("Sessão 3", "Workshop prático · 3 h", "De assistente a agente",
             "Levar a IA além do chat: que conheça a vossa empresa, trabalhe com as vossas ferramentas e faça tarefas por vós.",
             ["Ficheiros de instruções para agentes (AGENTS.md e semelhantes): a sua empresa explicada à IA", "Competências reutilizáveis para cada função", "Ligar a IA ao e-mail, ao calendário, aos documentos e ao CRM", "Automatizar tarefas repetitivas e e-mails", "Criar documentos e pequenas ferramentas sem programar", "Segurança e proteção de dados"]),
        ],
        "guide_h": "E no fim, um guia para continuarem por vossa conta",
        "guide_p": "Um documento adaptado à sua empresa com tudo o que foi trabalhado nos workshops:",
        "guide": ["As instruções e competências criadas para as vossas funções", "Modelos de pedidos para as tarefas mais habituais", "Que modelo e nível de esforço usar para cada tipo de tarefa", "Boas práticas e regras de uso para a equipa"],
        "tools": "É independente da ferramenta: trabalhamos com ChatGPT, Claude, Gemini, Microsoft Copilot ou a que usarem.",
        "mods": ["Presencial, na sua empresa", "Online, em direto", "Para toda a equipa ou por áreas"],
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
  <a class="skip" href="#main-content">{SKIP[code]}</a>
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
    sessions = "".join(f"""
        <article class="session">
          <div class="session-top"><span class="session-n">{label}</span><span class="step-chip">{when}</span></div>
          <h3>{title}</h3>
          <p>{intro}</p>
          <ul class="card-list">{''.join(f'<li>{x}</li>' for x in items)}</ul>
        </article>""" for label, when, title, intro, items in T["sessions"])
    guide = "".join(f"<li>{x}</li>" for x in T["guide"])
    mods = "".join(f"<li>{m}</li>" for m in T["mods"])
    return head(code, T["title"], T["desc"], S["train"], schema) + f"""  <main id="main-content" tabindex="-1" class="wrap train-page">
    <p class="eyebrow">{T['eyebrow']}</p>
    <h1>{T['h1']}</h1>
    <p class="lead">{T['lead']}</p>
    <ul class="t-mods">{mods}</ul>

    <h2 class="page-h2">{T['sessions_h']}</h2>
    <div class="sessions">{sessions}
    </div>

    <div class="guide">
      <div>
        <h2 class="page-h2">{T['guide_h']}</h2>
        <p>{T['guide_p']}</p>
      </div>
      <ul class="card-list">{guide}</ul>
    </div>

    <p class="t-tools">{T['tools']}</p>
    <p class="law-note">{T['law']}</p>

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
    desc = {"es": "Qué soluciones ofrecemos, cómo empezamos, precios y plazos, entregables, titularidad del código y gestión de datos.",
            "en": "What we do, how to get started, project pricing and timelines, deliverables, ownership and data handling.",
            "pt": "O que fazemos, como começar, preços e prazos, entregáveis, titularidade do código e tratamento de dados."}[code]
    def txt(x):
        import re
        return html.unescape(re.sub(r"<[^>]+>", "", x)).strip()
    schema = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": txt(q), "acceptedAnswer": {"@type": "Answer", "text": txt(a)}} for q, a in F["items"]]}
    items = "".join(f'\n        <details name="faq"><summary>{q}</summary><p>{a}</p></details>' for q, a in F["items"])
    help_html = F["help"].replace(' href="#contacto"', f' href="{S["home"]}#contacto"')
    return head(code, title, desc, S["faq"], schema) + f"""  <main id="main-content" tabindex="-1" class="wrap section faq-section faq-page">
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


def check_balance(page, name):
    import re
    for tag in ("div", "section", "ul", "ol", "main", "details", "article"):
        opened, closed = len(re.findall(rf"<{tag}[\s>]", page)), page.count(f"</{tag}>")
        if opened != closed:
            raise SystemExit(f"{name}: <{tag}> abiertos {opened}, cerrados {closed}")


def main():
    for code, S in SITE.items():
        for slug, render in ((S["train"], training), (S["faq"], faq_page)):
            out = PUBLIC / f"{slug}.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            page = render(code)
            check_balance(page, slug)
            out.write_text(page)
            print(f"/{slug}")


if __name__ == "__main__":
    main()
