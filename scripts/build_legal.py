"""Generate the legal pages (legal notice, privacy, cookies) in Spanish, English and Portuguese.

When the company is set up, fill in OWNER below and run:

    python3 scripts/build_legal.py
"""
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"
UPDATED = {"es": "13 de octubre de 2026", "en": "13 October 2026", "pt": "13 de outubro de 2026"}

# Company details. Empty values are not shown.
OWNER = {
    "name": "llume",
    "tax_id": "",        # NIF / CIF
    "address": "",       # registered office
    "registry": "",      # e.g. Registro Mercantil de Asturias, tomo..., folio..., hoja...
    "email": "info@llume.net",
}

PAGES = {
    "es": {"notice": "aviso-legal", "privacy": "privacidad", "cookies": "cookies", "home": "/", "lang": "es", "back": "Volver a la web",
           "titles": ("Aviso legal", "Política de privacidad", "Política de cookies"), "updated": "Última actualización", "book": "Reserva 30 min"},
    "en": {"notice": "en/legal-notice", "privacy": "en/privacy", "cookies": "en/cookies", "home": "/en/", "lang": "en", "back": "Back to the website",
           "titles": ("Legal notice", "Privacy policy", "Cookie policy"), "updated": "Last updated", "book": "Book 30 min"},
    "pt": {"notice": "pt/aviso-legal", "privacy": "pt/privacidade", "cookies": "pt/cookies", "home": "/pt/", "lang": "pt-PT", "back": "Voltar ao site",
           "titles": ("Aviso legal", "Política de privacidade", "Política de cookies"), "updated": "Última atualização", "book": "Marque 30 min"},
}

LABELS = {
    "es": {"name": "Titular", "tax_id": "NIF", "address": "Domicilio", "registry": "Datos registrales", "email": "Correo electrónico"},
    "en": {"name": "Owner", "tax_id": "Tax ID", "address": "Registered office", "registry": "Registry details", "email": "Email"},
    "pt": {"name": "Titular", "tax_id": "NIF", "address": "Sede", "registry": "Dados de registo", "email": "E-mail"},
}


def owner_list(code, responsible=False):
    labels = dict(LABELS[code])
    if responsible:
        labels["name"] = {"es": "Responsable", "en": "Controller", "pt": "Responsável"}[code]
    items = []
    for k, label in labels.items():
        v = OWNER[k]
        if not v:
            continue
        if k == "email":
            v = f'<a href="mailto:{v}">{v}</a>'
        items.append(f"      <li><strong>{label}:</strong> {v}</li>")
    return "    <ul>\n" + "\n".join(items) + "\n    </ul>"


def content(code, kind):
    e = OWNER["email"]
    mail = f'<a href="mailto:{e}">{e}</a>'
    if code == "es":
        if kind == "notice":
            return f"""    <h2>1. Datos del titular</h2>
    <p>En cumplimiento de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de los datos del titular de este sitio web:</p>
{owner_list(code)}
    <h2>2. Objeto</h2>
    <p>Este sitio web informa sobre los servicios de consultoría tecnológica de llume: automatización de procesos, integración y migración a la nube, desarrollo de software a medida y videoanálisis. Su uso atribuye la condición de usuario e implica la aceptación de este aviso legal.</p>
    <h2>3. Condiciones de uso</h2>
    <p>El usuario se compromete a hacer un uso adecuado de los contenidos y a no emplearlos para actividades ilícitas o contrarias a la buena fe. llume podrá modificar en cualquier momento los contenidos y la configuración del sitio sin previo aviso.</p>
    <h2>4. Propiedad intelectual e industrial</h2>
    <p>Los textos, el diseño, el logotipo, el código fuente y demás elementos de este sitio son propiedad de llume o se usan con autorización de sus titulares. Los logotipos y capturas de clientes y colaboradores pertenecen a sus respectivos propietarios y se muestran únicamente para ilustrar los proyectos realizados. Los logotipos de herramientas de terceros (por ejemplo, Google, Microsoft, Salesforce o Stripe) son marcas de sus titulares y se muestran solo para indicar que nuestras soluciones pueden integrarse con ellas, sin que ello implique patrocinio ni asociación. Queda prohibida su reproducción, distribución o transformación sin autorización expresa.</p>
    <h2>5. Responsabilidad</h2>
    <p>llume no se hace responsable de los daños derivados de un uso indebido del sitio ni de las interrupciones técnicas ajenas a su control. Los enlaces a sitios de terceros se ofrecen a título informativo; llume no controla ni responde de sus contenidos.</p>
    <h2>6. Legislación aplicable</h2>
    <p>Este aviso legal se rige por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales de Oviedo, salvo que la normativa aplicable disponga otra cosa.</p>"""
        if kind == "privacy":
            return f"""    <p>En llume nos tomamos en serio tu privacidad. Esta política explica qué datos personales tratamos, para qué y qué derechos tienes, conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).</p>
    <h2>1. Responsable del tratamiento</h2>
{owner_list(code, True)}
    <h2>2. Qué datos tratamos y de dónde vienen</h2>
    <p>Esta web no guarda datos en sus propios servidores. El formulario de contacto abre tu programa de correo con un mensaje ya preparado, y solo recibimos los datos que decidas enviarnos: lo que necesitas, tu nombre y tu teléfono y, si quieres, tu empresa y tu email. Si nos escribes directamente por correo, tratamos los datos que incluyas en el mensaje.</p>
    <p>Nuestro proveedor de alojamiento procesa datos técnicos, como la dirección IP, para servir la web y protegerla frente a ataques. Para conocer las visitas usamos una analítica sin cookies que no te identifica.</p>
    <h2>3. Para qué los usamos</h2>
    <ul>
      <li>Atender tu consulta y llamarte para organizar la reunión que solicitas.</li>
      <li>Preparar y enviarte una propuesta, si nos la pides.</li>
      <li>Si llegamos a colaborar, gestionar la relación profesional y cumplir nuestras obligaciones legales, fiscales y contables.</li>
    </ul>
    <p>No tomamos decisiones automatizadas ni elaboramos perfiles con tus datos, no te enviaremos publicidad sin tu permiso y no vendemos ni cedemos tus datos con fines comerciales.</p>
    <h2>4. Base legal</h2>
    <ul>
      <li><strong>Tu consentimiento</strong> al enviarnos tu solicitud (artículo 6.1.a del RGPD). Puedes retirarlo cuando quieras.</li>
      <li><strong>La aplicación de medidas precontractuales</strong> a petición tuya, como preparar una propuesta (artículo 6.1.b).</li>
      <li><strong>El cumplimiento de obligaciones legales</strong>, si llegamos a trabajar juntos (artículo 6.1.c).</li>
    </ul>
    <h2>5. Cuánto tiempo los conservamos</h2>
    <p>Mientras mantengamos la conversación o la relación profesional y, después, durante los plazos que exija la ley para atender posibles responsabilidades. Si no llegamos a colaborar, eliminamos tus datos en un plazo máximo de un año desde el último contacto.</p>
    <h2>6. Quién más puede acceder</h2>
    <p>No cedemos tus datos a terceros salvo obligación legal. Algunos proveedores nos prestan servicios con acceso a ellos, como encargados del tratamiento y con contrato conforme al RGPD:</p>
    <ul>
      <li><strong>Google</strong> (Google Workspace): correo electrónico.</li>
      <li><strong>Cloudflare</strong>: alojamiento, seguridad y estadísticas de visitas sin cookies.</li>
    </ul>
    <h2>7. Transferencias internacionales</h2>
    <p>Estos proveedores pueden tratar datos fuera del Espacio Económico Europeo, principalmente en Estados Unidos. Lo hacen al amparo del Marco de Privacidad de Datos UE-EE. UU. y de las cláusulas contractuales tipo aprobadas por la Comisión Europea, que garantizan un nivel de protección adecuado.</p>
    <h2>8. Cómo los protegemos</h2>
    <p>Aplicamos medidas técnicas y organizativas adecuadas: conexión cifrada (HTTPS) en toda la web, acceso a los datos limitado a las personas que los necesitan y proveedores que cumplen estándares de seguridad reconocidos.</p>
    <h2>9. Tus derechos</h2>
    <p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad, y retirar tu consentimiento en cualquier momento, escribiendo a {mail} e indicando qué derecho quieres ejercer. Te responderemos en el plazo máximo de un mes.</p>
    <p>Si consideras que no hemos atendido bien tu solicitud, puedes presentar una reclamación ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>).</p>
    <h2>10. Menores de edad</h2>
    <p>Esta web está dirigida a empresas y profesionales. No recogemos de forma consciente datos de menores de 14 años.</p>
    <h2>11. Cambios en esta política</h2>
    <p>Podemos actualizar esta política para adaptarla a cambios legales o en nuestros servicios. Publicaremos siempre la versión vigente en esta página, con su fecha de actualización.</p>"""
        return """    <h2>Esta web no usa cookies de seguimiento</h2>
    <p>No instalamos cookies propias ni de terceros con fines analíticos, publicitarios o de personalización. Por eso no te mostramos ningún banner de cookies.</p>
    <p>Las fuentes tipográficas y las librerías que usa la web se sirven desde nuestro propio dominio, de modo que tu navegador no se conecta a servicios de terceros como Google Fonts al visitarnos. Para contar las visitas usamos la analítica de Cloudflare, que funciona sin cookies y sin identificarte.</p>
    <h2>Cookies técnicas del alojamiento</h2>
    <p>Nuestro proveedor de alojamiento, Cloudflare, puede usar cookies técnicas estrictamente necesarias para proteger la web frente a tráfico malicioso. Estas cookies están exentas de consentimiento según el artículo 22.2 de la LSSI-CE.</p>
    <table>
      <thead><tr><th>Cookie</th><th>Titular</th><th>Finalidad</th><th>Duración</th></tr></thead>
      <tbody><tr><td>__cf_bm</td><td>Cloudflare</td><td>Distinguir personas de bots</td><td>30 minutos</td></tr></tbody>
    </table>
    <h2>Cómo gestionar las cookies</h2>
    <p>Puedes bloquear o eliminar las cookies desde la configuración de tu navegador. Si cambiamos esta política, actualizaremos esta página.</p>"""
    if code == "en":
        if kind == "notice":
            return f"""    <h2>1. Owner of the website</h2>
    <p>In accordance with Spanish Law 34/2002 on Information Society Services and Electronic Commerce (LSSI-CE), the owner of this website is:</p>
{owner_list(code)}
    <h2>2. Purpose</h2>
    <p>This website provides information about llume's technology consultancy services: process automation, integration and cloud migration, custom software development and video analytics. Using it makes you a user and implies acceptance of this legal notice.</p>
    <h2>3. Terms of use</h2>
    <p>Users agree to make appropriate use of the content and not to use it for unlawful purposes or in bad faith. llume may change the content and configuration of the site at any time without notice.</p>
    <h2>4. Intellectual and industrial property</h2>
    <p>The texts, design, logo, source code and other elements of this site belong to llume or are used with their owners' permission. Client and partner logos and screenshots belong to their respective owners and are shown only to illustrate the projects carried out. Third-party tool logos (for example Google, Microsoft, Salesforce or Stripe) are trademarks of their owners and are shown only to indicate that our solutions can integrate with them, without implying sponsorship or association. Reproduction, distribution or modification without express permission is prohibited.</p>
    <h2>5. Liability</h2>
    <p>llume is not liable for damage resulting from misuse of the site or for technical interruptions beyond its control. Links to third-party sites are provided for information only; llume does not control and is not responsible for their content.</p>
    <h2>6. Governing law</h2>
    <p>This legal notice is governed by Spanish law. Any dispute shall be submitted to the courts of Oviedo, unless applicable law provides otherwise.</p>"""
        if kind == "privacy":
            return f"""    <p>At llume we take your privacy seriously. This policy explains what personal data we process, why, and what your rights are, under Regulation (EU) 2016/679 (GDPR) and Spanish Organic Law 3/2018 (LOPDGDD).</p>
    <h2>1. Data controller</h2>
{owner_list(code, True)}
    <h2>2. What data we process and where it comes from</h2>
    <p>This website does not store data on its own servers. The contact form opens your email app with a ready-made message, and we only receive the data you choose to send us: what you need, your name and phone number and, optionally, your company and email. If you email us directly, we process the data included in your message.</p>
    <p>Our hosting provider processes technical data, such as your IP address, to serve the website and protect it from attacks. We count visits with cookie-free analytics that do not identify you.</p>
    <h2>3. What we use it for</h2>
    <ul>
      <li>To handle your enquiry and call you to arrange the meeting you request.</li>
      <li>To prepare and send you a proposal, if you ask for one.</li>
      <li>If we end up working together, to manage the professional relationship and meet our legal, tax and accounting obligations.</li>
    </ul>
    <p>We do not make automated decisions or build profiles with your data, we will not send you advertising without your permission, and we do not sell or share your data for commercial purposes.</p>
    <h2>4. Legal basis</h2>
    <ul>
      <li><strong>Your consent</strong> when you send us your request (Article 6.1.a GDPR). You can withdraw it at any time.</li>
      <li><strong>Pre-contractual measures</strong> taken at your request, such as preparing a proposal (Article 6.1.b).</li>
      <li><strong>Compliance with legal obligations</strong>, if we work together (Article 6.1.c).</li>
    </ul>
    <h2>5. How long we keep it</h2>
    <p>For as long as the conversation or professional relationship lasts and, afterwards, for the periods required by law. If we do not end up working together, we delete your data within one year of the last contact.</p>
    <h2>6. Who else may access it</h2>
    <p>We do not share your data with third parties unless required by law. Some providers have access to it as data processors, under contracts that comply with the GDPR:</p>
    <ul>
      <li><strong>Google</strong> (Google Workspace): email.</li>
      <li><strong>Cloudflare</strong>: hosting, security and cookie-free visit statistics.</li>
    </ul>
    <h2>7. International transfers</h2>
    <p>These providers may process data outside the European Economic Area, mainly in the United States, under the EU-US Data Privacy Framework and the standard contractual clauses approved by the European Commission, which guarantee an adequate level of protection.</p>
    <h2>8. How we protect it</h2>
    <p>We apply appropriate technical and organisational measures: encrypted connections (HTTPS) across the whole site, access to data limited to those who need it, and providers that meet recognised security standards.</p>
    <h2>9. Your rights</h2>
    <p>You can exercise your rights of access, rectification, erasure, objection, restriction of processing and portability, and withdraw your consent at any time, by writing to {mail} and stating which right you wish to exercise. We will reply within one month.</p>
    <p>If you believe we have not handled your request properly, you can lodge a complaint with the Spanish Data Protection Agency (<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>) or with your local supervisory authority.</p>
    <h2>10. Minors</h2>
    <p>This website is aimed at companies and professionals. We do not knowingly collect data from children under 14.</p>
    <h2>11. Changes to this policy</h2>
    <p>We may update this policy to reflect legal changes or changes to our services. The current version will always be published on this page with its update date.</p>"""
        return """    <h2>This website does not use tracking cookies</h2>
    <p>We do not set our own or third-party cookies for analytics, advertising or personalisation, which is why we do not show you a cookie banner.</p>
    <p>The fonts and libraries used by the website are served from our own domain, so your browser does not connect to third-party services such as Google Fonts when you visit us. We count visits with Cloudflare's analytics, which works without cookies and without identifying you.</p>
    <h2>Technical cookies from our hosting provider</h2>
    <p>Our hosting provider, Cloudflare, may use strictly necessary technical cookies to protect the website from malicious traffic. These cookies are exempt from consent under Article 22.2 of the Spanish LSSI-CE.</p>
    <table>
      <thead><tr><th>Cookie</th><th>Owner</th><th>Purpose</th><th>Duration</th></tr></thead>
      <tbody><tr><td>__cf_bm</td><td>Cloudflare</td><td>Distinguish humans from bots</td><td>30 minutes</td></tr></tbody>
    </table>
    <h2>Managing cookies</h2>
    <p>You can block or delete cookies in your browser settings. If we change this policy, we will update this page.</p>"""
    # pt
    if kind == "notice":
        return f"""    <h2>1. Titular do site</h2>
    <p>Nos termos da Lei espanhola 34/2002, de Serviços da Sociedade da Informação e de Comércio Eletrónico (LSSI-CE), o titular deste site é:</p>
{owner_list(code)}
    <h2>2. Objeto</h2>
    <p>Este site informa sobre os serviços de consultoria tecnológica da llume: automação de processos, integração e migração para a cloud, desenvolvimento de software à medida e videoanálise. A sua utilização atribui a condição de utilizador e implica a aceitação deste aviso legal.</p>
    <h2>3. Condições de utilização</h2>
    <p>O utilizador compromete-se a fazer um uso adequado dos conteúdos e a não os utilizar para fins ilícitos ou contrários à boa-fé. A llume pode alterar a qualquer momento os conteúdos e a configuração do site sem aviso prévio.</p>
    <h2>4. Propriedade intelectual e industrial</h2>
    <p>Os textos, o design, o logótipo, o código-fonte e os demais elementos deste site são propriedade da llume ou são usados com autorização dos seus titulares. Os logótipos e capturas de clientes e parceiros pertencem aos respetivos proprietários e são mostrados apenas para ilustrar os projetos realizados. Os logótipos de ferramentas de terceiros (por exemplo, Google, Microsoft, Salesforce ou Stripe) são marcas dos seus titulares e são mostrados apenas para indicar que as nossas soluções se podem integrar com elas, sem que isso implique patrocínio ou associação. É proibida a sua reprodução, distribuição ou transformação sem autorização expressa.</p>
    <h2>5. Responsabilidade</h2>
    <p>A llume não se responsabiliza pelos danos resultantes de uma utilização indevida do site nem por interrupções técnicas alheias ao seu controlo. As ligações para sites de terceiros são meramente informativas; a llume não controla nem responde pelos seus conteúdos.</p>
    <h2>6. Legislação aplicável</h2>
    <p>Este aviso legal rege-se pela legislação espanhola. Para qualquer litígio, as partes submetem-se aos tribunais de Oviedo, salvo disposição legal em contrário.</p>"""
    if kind == "privacy":
        return f"""    <p>Na llume levamos a sua privacidade a sério. Esta política explica que dados pessoais tratamos, para quê e que direitos tem, nos termos do Regulamento (UE) 2016/679 (RGPD) e da Lei Orgânica espanhola 3/2018 (LOPDGDD).</p>
    <h2>1. Responsável pelo tratamento</h2>
{owner_list(code, True)}
    <h2>2. Que dados tratamos e de onde vêm</h2>
    <p>Este site não guarda dados nos seus próprios servidores. O formulário de contacto abre o seu programa de e-mail com uma mensagem já preparada, e só recebemos os dados que decidir enviar-nos: o que precisa, o seu nome e telefone e, se quiser, a sua empresa e e-mail. Se nos escrever diretamente por e-mail, tratamos os dados incluídos na mensagem.</p>
    <p>O nosso fornecedor de alojamento trata dados técnicos, como o endereço IP, para servir o site e protegê-lo contra ataques. Para contar as visitas usamos uma análise sem cookies que não o identifica.</p>
    <h2>3. Para que os usamos</h2>
    <ul>
      <li>Tratar o seu pedido e ligar-lhe para marcar a reunião que solicita.</li>
      <li>Preparar e enviar-lhe uma proposta, se a pedir.</li>
      <li>Se vierem a trabalhar connosco, gerir a relação profissional e cumprir as nossas obrigações legais, fiscais e contabilísticas.</li>
    </ul>
    <p>Não tomamos decisões automatizadas nem criamos perfis com os seus dados, não lhe enviaremos publicidade sem autorização e não vendemos nem cedemos os seus dados para fins comerciais.</p>
    <h2>4. Fundamento jurídico</h2>
    <ul>
      <li><strong>O seu consentimento</strong> ao enviar-nos o pedido (artigo 6.º, n.º 1, alínea a) do RGPD). Pode retirá-lo a qualquer momento.</li>
      <li><strong>Diligências pré-contratuais</strong> a seu pedido, como preparar uma proposta (alínea b).</li>
      <li><strong>O cumprimento de obrigações legais</strong>, se vierem a trabalhar connosco (alínea c).</li>
    </ul>
    <h2>5. Durante quanto tempo os conservamos</h2>
    <p>Enquanto durar a conversa ou a relação profissional e, depois, durante os prazos exigidos por lei. Se não vierem a trabalhar connosco, apagamos os seus dados no prazo máximo de um ano após o último contacto.</p>
    <h2>6. Quem mais pode aceder</h2>
    <p>Não cedemos os seus dados a terceiros, salvo obrigação legal. Alguns fornecedores têm acesso a eles como subcontratantes, com contrato conforme ao RGPD:</p>
    <ul>
      <li><strong>Google</strong> (Google Workspace): e-mail.</li>
      <li><strong>Cloudflare</strong>: alojamento, segurança e estatísticas de visitas sem cookies.</li>
    </ul>
    <h2>7. Transferências internacionais</h2>
    <p>Estes fornecedores podem tratar dados fora do Espaço Económico Europeu, sobretudo nos Estados Unidos, ao abrigo do Quadro de Privacidade de Dados UE-EUA e das cláusulas contratuais-tipo aprovadas pela Comissão Europeia, que garantem um nível de proteção adequado.</p>
    <h2>8. Como os protegemos</h2>
    <p>Aplicamos medidas técnicas e organizativas adequadas: ligação cifrada (HTTPS) em todo o site, acesso aos dados limitado a quem deles precisa e fornecedores que cumprem normas de segurança reconhecidas.</p>
    <h2>9. Os seus direitos</h2>
    <p>Pode exercer os direitos de acesso, retificação, apagamento, oposição, limitação do tratamento e portabilidade, e retirar o seu consentimento a qualquer momento, escrevendo para {mail} e indicando o direito que pretende exercer. Responderemos no prazo máximo de um mês.</p>
    <p>Se considerar que o seu pedido não foi bem tratado, pode apresentar reclamação junto da Agência Espanhola de Proteção de Dados (<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>) ou da Comissão Nacional de Proteção de Dados (<a href="https://www.cnpd.pt" rel="noopener">www.cnpd.pt</a>).</p>
    <h2>10. Menores</h2>
    <p>Este site destina-se a empresas e profissionais. Não recolhemos conscientemente dados de menores de 14 anos.</p>
    <h2>11. Alterações a esta política</h2>
    <p>Podemos atualizar esta política para a adaptar a alterações legais ou dos nossos serviços. Publicaremos sempre a versão em vigor nesta página, com a respetiva data de atualização.</p>"""
    return """    <h2>Este site não usa cookies de rastreio</h2>
    <p>Não instalamos cookies próprios nem de terceiros para fins analíticos, publicitários ou de personalização. Por isso não lhe mostramos nenhum aviso de cookies.</p>
    <p>As fontes tipográficas e as bibliotecas que o site usa são servidas a partir do nosso próprio domínio, pelo que o seu navegador não se liga a serviços de terceiros como o Google Fonts quando nos visita. Para contar as visitas usamos a análise da Cloudflare, que funciona sem cookies e sem o identificar.</p>
    <h2>Cookies técnicos do alojamento</h2>
    <p>O nosso fornecedor de alojamento, a Cloudflare, pode usar cookies técnicos estritamente necessários para proteger o site contra tráfego malicioso. Estes cookies estão isentos de consentimento nos termos do artigo 22.2 da LSSI-CE espanhola.</p>
    <table>
      <thead><tr><th>Cookie</th><th>Titular</th><th>Finalidade</th><th>Duração</th></tr></thead>
      <tbody><tr><td>__cf_bm</td><td>Cloudflare</td><td>Distinguir pessoas de bots</td><td>30 minutos</td></tr></tbody>
    </table>
    <h2>Como gerir os cookies</h2>
    <p>Pode bloquear ou apagar os cookies nas definições do seu navegador. Se alterarmos esta política, atualizaremos esta página.</p>"""


def page(code, kind):
    L = PAGES[code]
    title = L["titles"][("notice", "privacy", "cookies").index(kind)]
    alternates = "\n".join(f'  <link rel="alternate" hreflang="{k}" href="https://llumedigital.com/{v[kind]}">' for k, v in PAGES.items())
    return f"""<!doctype html>
<html lang="{L['lang']}" class="no-webgl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} · llume</title>
  <link rel="canonical" href="https://llumedigital.com/{L[kind]}">
{alternates}
  <meta name="theme-color" content="#07070a">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="nav scrolled" id="nav">
    <a href="{L['home']}" class="logo" aria-label="llume"><img src="/assets/mark.svg" alt="" width="20" height="24"><span>llume.</span></a>
    <a href="{L['home']}#contacto" class="btn btn-light btn-sm">{L['book']} <span aria-hidden="true">→</span></a>
  </header>
  <main class="wrap legal">
    <p class="eyebrow">Legal</p>
    <h1>{title}</h1>
    <p class="updated">{L['updated']}: {UPDATED[code]}</p>
{content(code, kind)}
  </main>
  <footer class="footer">
    <div class="wrap foot-bottom"><span>© 2026 llume</span><span><a href="/{L['notice']}">{L['titles'][0]}</a> · <a href="/{L['privacy']}">{L['titles'][1]}</a> · <a href="/{L['cookies']}">{L['titles'][2]}</a> · <a href="{L['home']}">{L['back']}</a></span></div>
  </footer>
  <script type="module" src="/ui.js"></script>
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "067b84e48590464ea55b033a36a010bc"}'></script>
</body>
</html>
"""


def main():
    for code, L in PAGES.items():
        for kind in ("notice", "privacy", "cookies"):
            out = PUBLIC / f"{L[kind]}.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(page(code, kind))
            print(f"/{L[kind]}")


if __name__ == "__main__":
    main()
