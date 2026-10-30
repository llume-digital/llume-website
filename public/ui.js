/* Interface logic. Kept apart from main.js (3D) so the page works even without WebGL. */
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- nav ---------- */
const nav = document.getElementById("nav");
const onScrollNav = () => {
  nav?.classList.toggle("scrolled", scrollY > 20);
  document.documentElement.classList.toggle("deep", scrollY > innerHeight * 0.7);
};
addEventListener("scroll", onScrollNav, { passive: true });
onScrollNav();

const menuBtn = document.querySelector(".menu-btn");
const mobileNav = matchMedia("(max-width: 860px)");
const setMenu = (open, restoreFocus = false) => {
  nav?.classList.toggle("open", open);
  menuBtn?.setAttribute("aria-expanded", String(open));
  if (restoreFocus) menuBtn?.focus();
};
if (nav && menuBtn) {
  nav.classList.add("nav-enhanced");
  menuBtn.addEventListener("click", () => {
    const open = !nav.classList.contains("open");
    setMenu(open);
    if (open) nav.querySelector(".links a")?.focus();
  });
  nav.querySelectorAll(".links a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("open")) setMenu(false, true);
  });
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) setMenu(false);
  });
  nav.addEventListener("focusout", () => {
    queueMicrotask(() => { if (!nav.contains(document.activeElement)) setMenu(false); });
  });
  mobileNav.addEventListener("change", () => setMenu(false));
}

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => {
  if (!reduceMotion) el.classList.add("reveal-pending");
  io.observe(el);
});

/* ---------- hero: rotating phrase ---------- */
const rotator = document.querySelector(".rotator");
if (rotator && !reduceMotion) {
  const items = [...rotator.querySelectorAll("span")];
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    const prev = items[i];
    prev.classList.replace("on", "out");
    setTimeout(() => prev.classList.remove("out"), 600);
    i = (i + 1) % items.length;
    items[i].classList.add("on");
  }, 2600);
}

/* ---------- sectors: tabs ---------- */
const tabs = [...document.querySelectorAll(".sector-tab")];
function selectTab(tab, focus = false) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  });
  if (focus) tab.focus();
}
tabs.forEach((tab, idx) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (idx + step + tabs.length) % tabs.length;
    selectTab(tabs[next], true);
  });
});

/* ---------- figures: count up when visible ---------- */
const counters = document.querySelectorAll("[data-count]");
const countIO = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  countIO.unobserve(e.target);
  const el = e.target, to = +el.dataset.count;
  if (reduceMotion) return void (el.textContent = to);
  const t0 = performance.now(), dur = 1400;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), { threshold: 0.6 });
counters.forEach((c) => countIO.observe(c));

/* ---------- case studies: full case in a dialog ---------- */
const dialog = document.getElementById("case-dialog");
if (matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.querySelectorAll(".cx-preview").forEach((video) => {
    const card = video.closest(".cx");
    if (!card) return;
    let hovering = false;
    card.addEventListener("pointerenter", () => {
      hovering = true;
      video.currentTime = 0;
      video.play().then(() => {
        if (hovering) card.classList.add("is-previewing");
        else video.pause();
      }).catch(() => {});
    });
    card.addEventListener("pointerleave", () => {
      hovering = false;
      card.classList.remove("is-previewing");
      video.pause();
      video.currentTime = 0;
    });
  });
}
if (dialog) {
  const media = dialog.querySelector(".cd-media");
  const tag = dialog.querySelector(".cd-tag");
  const title = dialog.querySelector(".cd-title");
  const content = dialog.querySelector(".cd-content");

  const openCase = (card) => {
    media.replaceChildren(card.querySelector(".cx-media").cloneNode(true));
    media.querySelectorAll("img").forEach((img) => (img.loading = "eager"));
    // larger rendition in the dialog
    media.querySelectorAll("[data-lg]").forEach((el) => (el.sizes = el.dataset.lg));
    tag.textContent = card.querySelector(".cx-tag").textContent;
    title.textContent = card.querySelector("h3").textContent;
    content.replaceChildren(card.querySelector(".cx-detail").content.cloneNode(true));
    const page = dialog.querySelector(".cd-page");
    if (page) page.href = `${page.dataset.base}${card.dataset.case}`;
    dialog.showModal();
    dialog.querySelector(".cd-inner").scrollTop = 0;
    history.replaceState(null, "", `#caso-${card.dataset.case}`);
  };
  const closeCase = () => dialog.close();
  const caseById = (id) => document.querySelector(`.cx[data-case="${id}"]`);

  // Home shows three featured cases; the rest open on demand
  const more = document.querySelector(".cx-more");
  more?.addEventListener("click", () => {
    const open = document.querySelector(".cx-list").classList.toggle("expanded");
    more.setAttribute("aria-expanded", open);
    if (open) document.querySelectorAll(".cx-extra").forEach((el) => el.classList.add("in"));
  });

  dialog.addEventListener("close", () => {
    dialog.querySelectorAll("video").forEach((video) => video.pause());
    history.replaceState(null, "", location.pathname + location.search);
  });
  // The whole card opens the case; its button keeps it reachable by keyboard
  document.querySelectorAll(".cx").forEach((card) => card.addEventListener("click", () => openCase(card)));
  // "See case" links elsewhere on the page
  document.querySelectorAll("[data-open-case]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const card = caseById(btn.dataset.openCase);
      btn.closest("dialog")?.close();
      if (card) { e.preventDefault(); openCase(card); }
    })
  );
  dialog.querySelector(".cd-close").addEventListener("click", closeCase);
  dialog.querySelector(".cd-cta").addEventListener("click", closeCase);
  dialog.addEventListener("click", (e) => e.target === dialog && closeCase());

  // Direct link to a case: llumedigital.com/#caso-clevercar
  const fromHash = location.hash.match(/^#caso-(\w+)$/);
  if (fromHash && caseById(fromHash[1])) openCase(caseById(fromHash[1]));
}

/* ---------- contact form: opens a ready-to-send email ---------- */
const form = document.getElementById("contact-form");
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const d = new FormData(form), f = form.dataset;
  const who = `${d.get("nombre")}${d.get("empresa") ? " (" + d.get("empresa") + ")" : ""}`;
  const body = `${d.get("mensaje")}\n\n${f.lName}: ${d.get("nombre")}\n${f.lPhone}: ${d.get("telefono")}\n${f.lCompany}: ${d.get("empresa") || "-"}\n${f.lEmail}: ${d.get("email") || "-"}`;
  location.href = `mailto:${f.to}?subject=${encodeURIComponent(`${f.subject}: ${who}`)}&body=${encodeURIComponent(body)}`;
  let status = form.querySelector(".form-status");
  if (!status) {
    status = document.createElement("p");
    status.className = "form-status";
    status.setAttribute("role", "status");
    form.append(status);
  }
  const messages = {
    es: "Se ha solicitado abrir tu correo. Envía el mensaje desde tu aplicación de correo. Si no se abre, escríbenos a ",
    en: "Your email app has been requested to open. Send the message from your email app. If it does not open, write to ",
    pt: "Foi solicitada a abertura do teu email. Envia a mensagem na tua aplicação de email. Se não abrir, escreve para ",
  };
  const fallback = document.createElement("a");
  fallback.href = `mailto:${f.to}`;
  fallback.textContent = f.to;
  status.replaceChildren(messages[document.documentElement.lang.split("-")[0]] || messages.es, fallback, ".");
});

// Second way to send the same request: WhatsApp with the message ready
const waSend = form?.querySelector("[data-wa-send]");
if (form && waSend) {
  waSend.hidden = false;
  waSend.addEventListener("click", () => {
    if (!form.reportValidity()) return;
    const d = new FormData(form), f = form.dataset;
    const text = `${f.waHi}\n\n${d.get("mensaje")}\n\n${f.lName}: ${d.get("nombre")}\n${f.lPhone}: ${d.get("telefono")}${d.get("empresa") ? `\n${f.lCompany}: ${d.get("empresa")}` : ""}${d.get("email") ? `\n${f.lEmail}: ${d.get("email")}` : ""}`;
    window.open(`https://wa.me/${f.wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  });
}

/* ---------- footer year ---------- */
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

/* ---------- calculator: cost of repetitive tasks ---------- */
const calc = document.getElementById("calc");
if (calc) {
  // useGrouping "always": Spanish and Portuguese skip the separator in 4-digit numbers ("8625 €" next to "17.250 €")
  const fmt = new Intl.NumberFormat(calc.dataset.locale, { maximumFractionDigits: 0, useGrouping: "always" });
  const money = new Intl.NumberFormat(calc.dataset.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
  let out = {};
  const WEEKS = 46; // working weeks per year
  const update = () => {
    const v = Object.fromEntries([...calc.querySelectorAll("input")].map((i) => [i.name, +i.value]));
    calc.querySelectorAll("output").forEach((o) => (o.textContent = (o.dataset.prefix || "") + fmt.format(v[o.dataset.for]) + (o.dataset.suffix || "")));
    const hoursYear = v.people * v.hours * WEEKS;
    out = {
      hoursYear: fmt.format(hoursYear),
      costYear: money.format(hoursYear * v.rate),
      savedHours: fmt.format(hoursYear * v.share / 100),
      savedCost: money.format(hoursYear * v.rate * v.share / 100),
    };
    calc.querySelectorAll("[data-out]").forEach((el) => (el.textContent = out[el.dataset.out]));
  };
  calc.addEventListener("input", update);
  update();

  // "I want that time back" carries the estimate into the contact form
  const msg = document.querySelector('#contact-form textarea[name="mensaje"]');
  let prefilled = "";
  calc.querySelector("[data-calc-cta]")?.addEventListener("click", () => {
    if (!msg || !calc.dataset.msg || (msg.value.trim() && msg.value !== prefilled)) return;
    prefilled = calc.dataset.msg.replace(/\{(\w+)\}/g, (_, k) => ({ hours: out.hoursYear, cost: out.costYear, saved: out.savedHours, savedCost: out.savedCost })[k] ?? "");
    msg.value = prefilled;
  });
}

/* ---------- mobile: fixed call-to-action, hidden on the hero and at the contact form ---------- */
const sticky = document.querySelector(".sticky-cta");
const contact = document.getElementById("contacto");
if (sticky && contact) {
  const onScrollCta = () => {
    const pastHero = scrollY > innerHeight * 0.8;
    const atContact = contact.getBoundingClientRect().top < innerHeight;
    const visible = pastHero && !atContact;
    sticky.classList.toggle("show", visible);
    sticky.inert = !visible;
  };
  addEventListener("scroll", onScrollCta, { passive: true });
  addEventListener("resize", onScrollCta, { passive: true });
  onScrollCta();
}

/* ---------- 3D background: loaded once the page is idle so text appears first ---------- */
const connection = navigator.connection;
const lightExperience = reduceMotion || mobileNav.matches || matchMedia("(pointer: coarse)").matches
  || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "");
if (document.getElementById("bg") && lightExperience) document.documentElement.classList.add("no-webgl");
if (document.getElementById("bg") && !lightExperience) {
  const start3D = () => import("/main.js").catch(() => document.documentElement.classList.add("no-webgl"));
  if ("requestIdleCallback" in window) requestIdleCallback(start3D, { timeout: 1500 });
  else setTimeout(start3D, 600);
}

/* ---------- language menu ---------- */
const langBtn = document.querySelector(".lang-btn");
const langList = document.querySelector(".lang-list");
if (langBtn && langList) {
  const setLang = (open) => { langList.hidden = !open; langBtn.setAttribute("aria-expanded", open); };
  langBtn.addEventListener("click", (e) => { e.stopPropagation(); setLang(langList.hidden); });
  document.addEventListener("click", (e) => { if (!langList.contains(e.target)) setLang(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !langList.hidden) { setLang(false); langBtn.focus(); }
  });
  langBtn.closest(".lang-menu")?.addEventListener("focusout", (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setLang(false);
  });
}

/* ---------- simple dialogs (e.g. computer vision examples) ---------- */
document.querySelectorAll("[data-dialog]").forEach((btn) => {
  const dlg = document.getElementById(btn.dataset.dialog);
  if (!dlg) return;
  btn.addEventListener("click", () => dlg.showModal());
  dlg.addEventListener("close", () => dlg.querySelectorAll("video").forEach((video) => video.pause()));
  dlg.querySelector(".cd-close")?.addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
  dlg.querySelectorAll('a[href^="#"]:not([data-open-case])').forEach((a) => a.addEventListener("click", () => dlg.close()));
});

/* ---------- testimonial excerpts from the same attributed quote ---------- */
const quote = document.querySelector(".quote-rotating");
if (quote && !reduceMotion) {
  const excerpts = [quote.textContent, ...[...quote.parentElement.querySelectorAll(".quote-source")].map((el) => el.textContent)];
  let index = 0;
  setInterval(() => {
    if (document.hidden) return;
    quote.classList.add("is-fading");
    setTimeout(() => {
      index = (index + 1) % excerpts.length;
      quote.textContent = excerpts[index];
      quote.classList.remove("is-fading");
    }, 550);
  }, 6500);
}

/* ---------- solution cards: light that follows the cursor ---------- */
document.querySelectorAll(".sol").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});
