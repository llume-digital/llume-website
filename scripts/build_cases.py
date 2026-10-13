"""Generate one page per case study from the cases in each home page.

The home pages (public/index.html, public/en/index.html, public/pt/index.html)
are the source of truth: edit a case there and run

    python3 scripts/build_cases.py

to regenerate public/casos/*.html, public/en/cases/*.html and public/pt/casos/*.html.
"""
import html
import re
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"

LANGS = {
    "es": {
        "src": "index.html", "out": "casos", "home": "/", "html_lang": "es", "og": "es_ES",
        "eyebrow": "Caso de éxito", "problem": "El problema", "solution": "La solución",
        "cta_title": "¿Tienes un reto parecido?", "cta_text": "Explícanos qué necesitas y te llamamos. Primera reunión de 30 minutos, gratis y sin compromiso.",
        "cta": "Hablemos", "back": "Volver a la web", "more": "Otros casos", "book": "Reserva 30 min",
        "legal": ("/aviso-legal", "Aviso legal", "/privacidad", "Privacidad"),
    },
    "en": {
        "src": "en/index.html", "out": "en/cases", "home": "/en/", "html_lang": "en", "og": "en_GB",
        "eyebrow": "Case study", "problem": "The problem", "solution": "The solution",
        "cta_title": "Facing a similar challenge?", "cta_text": "Tell us what you need and we'll call you. Free 30-minute first meeting, no strings attached.",
        "cta": "Let's talk", "back": "Back to the website", "more": "More case studies", "book": "Book 30 min",
        "legal": ("/en/legal-notice", "Legal notice", "/en/privacy", "Privacy"),
    },
    "pt": {
        "src": "pt/index.html", "out": "pt/casos", "home": "/pt/", "html_lang": "pt-PT", "og": "pt_PT",
        "eyebrow": "Caso de sucesso", "problem": "O problema", "solution": "A solução",
        "cta_title": "Tem um desafio parecido?", "cta_text": "Explique-nos o que precisa e nós ligamos-lhe. Primeira reunião de 30 minutos, gratuita e sem compromisso.",
        "cta": "Vamos falar", "back": "Voltar ao site", "more": "Outros casos", "book": "Marque 30 min",
        "legal": ("/pt/aviso-legal", "Aviso legal", "/pt/privacidade", "Privacidade"),
    },
}

ARTICLE = re.compile(r'<article class="cx reveal" id="caso-(\w+)" data-case="\w+">(.*?)</article>', re.S)


def between(text, start, end):
    i = text.index(start) + len(start)
    return text[i:text.index(end, i)]


def text_of(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def parse(page):
    cases = []
    for slug, body in ARTICLE.findall(page):
        media = body[:body.index('<div class="cx-body">')].strip()
        tag = between(body, '<p class="cx-tag">', "</p>")
        title = between(body, "<h3>", "</h3>")
        ps = re.findall(r"<div><h4>.*?</h4><p>(.*?)</p></div>", between(body, '<div class="cx-ps">', '<button class="cx-open"'), re.S)
        detail = between(body, '<template class="cx-detail">', "</template>")
        cases.append({"slug": slug, "media": media.replace(' loading="lazy"', ""), "tag": tag, "title": title,
                      "problem": ps[0], "solution": ps[1], "detail": detail})
    return cases


def render(c, cases, L, code):
    url = f"https://llumedigital.com/{L['out']}/{c['slug']}"
    alternates = "\n".join(
        f'  <link rel="alternate" hreflang="{k}" href="https://llumedigital.com/{v["out"]}/{c["slug"]}">' for k, v in LANGS.items())
    more = "".join(f'<li><a href="/{L["out"]}/{o["slug"]}">{o["title"]}</a></li>' for o in cases if o["slug"] != c["slug"])
    desc = text_of(c["solution"])
    return f"""<!doctype html>
<html lang="{L['html_lang']}" class="no-webgl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{text_of(c['title'])} · llume</title>
  <meta name="description" content="{html.escape(desc)}">
  <link rel="canonical" href="{url}">
{alternates}
  <meta property="og:type" content="article">
  <meta property="og:locale" content="{L['og']}">
  <meta property="og:site_name" content="llume">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{html.escape(text_of(c['title']))}">
  <meta property="og:description" content="{html.escape(desc)}">
  <meta property="og:image" content="https://llumedigital.com/assets/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#07070a">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="nav scrolled" id="nav">
    <a href="{L['home']}" class="logo" aria-label="llume"><img src="/assets/mark.svg" alt="" width="20" height="24"><span>llume.</span></a>
    <a href="{L['home']}#contacto" class="btn btn-light btn-sm">{L['book']} <span aria-hidden="true">→</span></a>
  </header>
  <main class="wrap case-page">
    <p class="eyebrow">{L['eyebrow']} · {c['tag']}</p>
    <h1>{c['title']}</h1>
    {c['media']}
    <div class="cx-ps">
      <div><h4>{L['problem']}</h4><p>{c['problem']}</p></div>
      <div><h4>{L['solution']}</h4><p>{c['solution']}</p></div>
    </div>
    <div class="cd-content">{c['detail']}</div>
    <div class="offer">
      <div>
        <h3>{L['cta_title']}</h3>
        <p>{L['cta_text']}</p>
        <a href="{L['home']}#contacto" class="btn btn-light">{L['cta']} <span aria-hidden="true">→</span></a>
      </div>
    </div>
    <nav class="more-cases" aria-label="{L['more']}">
      <p class="eyebrow">{L['more']}</p>
      <ul>{more}</ul>
    </nav>
  </main>
  <footer class="footer">
    <div class="wrap foot-bottom"><span>© 2026 llume · Oviedo, Asturias</span><span><a href="{L['home']}">{L['back']}</a> · <a href="{L['legal'][0]}">{L['legal'][1]}</a> · <a href="{L['legal'][2]}">{L['legal'][3]}</a></span></div>
  </footer>
  <script type="module" src="/ui.js"></script>
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{{"token": "067b84e48590464ea55b033a36a010bc"}}'></script>
</body>
</html>
"""


def main():
    written = []
    for code, L in LANGS.items():
        cases = parse((PUBLIC / L["src"]).read_text())
        out = PUBLIC / L["out"]
        out.mkdir(parents=True, exist_ok=True)
        for c in cases:
            (out / f"{c['slug']}.html").write_text(render(c, cases, L, code))
            written.append(f"/{L['out']}/{c['slug']}")
    print("\n".join(written))


if __name__ == "__main__":
    main()
