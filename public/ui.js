/* Interface logic. Kept apart from main.js (3D) so the page works even without WebGL. */
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- nav ---------- */
const nav = document.getElementById("nav");
const onScrollNav = () => nav.classList.toggle("scrolled", scrollY > 20);
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
  const body = `${f.lName}: ${d.get("nombre")}\n${f.lCompany}: ${d.get("empresa") || "-"}\n${f.lEmail}: ${d.get("email")}\n\n${d.get("mensaje")}`;
  location.href = `mailto:${f.to}?subject=${encodeURIComponent(`${f.subject}: ${who}`)}&body=${encodeURIComponent(body)}`;
  form.querySelector("button[type=submit]").textContent = f.sent;
});

/* ---------- footer year ---------- */
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
