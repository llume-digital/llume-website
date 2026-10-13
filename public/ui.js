/* Interface logic. Kept apart from main.js (3D) so the page works even without WebGL. */
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- nav ---------- */
const nav = document.getElementById("nav");
const onScrollNav = () => {
  nav.classList.toggle("scrolled", scrollY > 20);
  document.documentElement.classList.toggle("deep", scrollY > innerHeight * 0.7);
};
addEventListener("scroll", onScrollNav, { passive: true });
onScrollNav();

const menuBtn = document.querySelector(".menu-btn");
menuBtn?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open);
});
nav.querySelectorAll(".links a").forEach((a) => a.addEventListener("click", () => {
  nav.classList.remove("open");
  menuBtn?.setAttribute("aria-expanded", "false");
}));

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- hero: rotating phrase ---------- */
const rotator = document.querySelector(".rotator");
if (rotator && !reduceMotion) {
  const items = [...rotator.querySelectorAll("span")];
  let i = 0;
  setInterval(() => {
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
    if (!step) return;
    e.preventDefault();
    selectTab(tabs[(idx + step + tabs.length) % tabs.length], true);
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
if (dialog) {
  const media = dialog.querySelector(".cd-media");
  const tag = dialog.querySelector(".cd-tag");
  const title = dialog.querySelector(".cd-title");
  const content = dialog.querySelector(".cd-content");

  const openCase = (card) => {
    media.replaceChildren(card.querySelector(".cx-media").cloneNode(true));
    media.querySelectorAll("img").forEach((img) => (img.loading = "eager"));
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

  dialog.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));
  // The whole card opens the case; its button keeps it reachable by keyboard
  document.querySelectorAll(".cx").forEach((card) => card.addEventListener("click", () => openCase(card)));
  // "See case" links elsewhere on the page
  document.querySelectorAll("[data-open-case]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const card = caseById(btn.dataset.openCase);
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
  form.querySelector("button[type=submit]").textContent = f.sent;
});

/* ---------- footer year ---------- */
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

/* ---------- calculator: cost of repetitive tasks ---------- */
const calc = document.getElementById("calc");
if (calc) {
  const fmt = new Intl.NumberFormat(calc.dataset.locale, { maximumFractionDigits: 0 });
  const money = new Intl.NumberFormat(calc.dataset.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const WEEKS = 46; // working weeks per year
  const update = () => {
    const v = Object.fromEntries([...calc.querySelectorAll("input")].map((i) => [i.name, +i.value]));
    calc.querySelectorAll("output").forEach((o) => (o.textContent = fmt.format(v[o.dataset.for]) + (o.dataset.suffix || "")));
    const hoursYear = v.people * v.hours * WEEKS;
    const out = {
      hoursYear: fmt.format(hoursYear),
      costYear: money.format(hoursYear * v.rate),
      savedHours: fmt.format(hoursYear * v.share / 100),
      savedCost: money.format(hoursYear * v.rate * v.share / 100),
    };
    calc.querySelectorAll("[data-out]").forEach((el) => (el.textContent = out[el.dataset.out]));
  };
  calc.addEventListener("input", update);
  update();
}

/* ---------- mobile: fixed call-to-action, hidden on the hero and at the contact form ---------- */
const sticky = document.querySelector(".sticky-cta");
const contact = document.getElementById("contacto");
if (sticky && contact) {
  const onScrollCta = () => {
    const pastHero = scrollY > innerHeight * 0.8;
    const atContact = contact.getBoundingClientRect().top < innerHeight;
    sticky.classList.toggle("show", pastHero && !atContact);
  };
  addEventListener("scroll", onScrollCta, { passive: true });
  onScrollCta();
}

/* ---------- 3D background: loaded once the page is idle so text appears first ---------- */
if (document.getElementById("bg")) {
  const start3D = () => import("/main.js").catch(() => document.documentElement.classList.add("no-webgl"));
  if ("requestIdleCallback" in window) requestIdleCallback(start3D, { timeout: 1500 });
  else setTimeout(start3D, 600);
}
