// Solo en desarrollo (LOPITA_RECARGA=1): recarga la página cuando cambia el código.
let actual = null;
async function comprobar() {
  try {
    const r = await fetch("/dev/recarga", { cache: "no-store" });
    const { version } = await r.json();
    if (actual && version !== actual) location.reload();
    actual = version;
  } catch { /* el servidor se está reiniciando */ }
}
comprobar();
setInterval(comprobar, 1500);
document.addEventListener("visibilitychange", () => { if (!document.hidden) comprobar(); });
