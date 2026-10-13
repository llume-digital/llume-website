/* ---------- case studies: open the full case in a dialog ---------- */
const dialog = document.getElementById("case-dialog");
const media = dialog.querySelector(".cd-media");
const tag = dialog.querySelector(".cd-tag");
const title = dialog.querySelector(".cd-title");
const content = dialog.querySelector(".cd-content");

function openCase(card) {
  media.replaceChildren(card.querySelector(".cx-media").cloneNode(true));
  media.querySelectorAll("img").forEach((img) => (img.loading = "eager"));
  tag.textContent = card.querySelector(".cx-tag").textContent;
  title.textContent = card.querySelector("h3").textContent;
  content.replaceChildren(card.querySelector(".cx-detail").content.cloneNode(true));
  dialog.showModal();
  dialog.querySelector(".cd-inner").scrollTop = 0;
  history.replaceState(null, "", `#caso-${card.dataset.case}`);
}

function closeCase() {
  dialog.close();
}

dialog.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));

// The whole card opens the case; the button keeps it reachable by keyboard
document.querySelectorAll(".cx").forEach((card) => card.addEventListener("click", () => openCase(card)));

// "Ver caso" links in the solutions section
document.querySelectorAll(".card-link[data-case]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const card = document.querySelector(`.cx[data-case="${btn.dataset.case}"]`);
    if (card) openCase(card);
  })
);

dialog.querySelector(".cd-close").addEventListener("click", closeCase);
dialog.querySelector(".cd-cta").addEventListener("click", closeCase);
// Click on the backdrop closes it
dialog.addEventListener("click", (e) => e.target === dialog && closeCase());

// Direct link to a case (llumedigital.com/#caso-corradi)
const fromHash = location.hash.match(/^#caso-(\w+)$/);
if (fromHash) {
  const card = document.querySelector(`.cx[data-case="${fromHash[1]}"]`);
  if (card) openCase(card);
}
