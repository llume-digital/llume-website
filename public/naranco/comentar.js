/* Nar&Co · comentarios sobre la demo (solo demo).
   Pestaña fija «Comentar» en el borde derecho de la web y del panel: abre un formulario corto que guarda el comentario
   en /naranco/api/comentarios (lo leen Mateo y Miguel desde la pestaña Comentarios del panel).
   Si el servidor no responde (vista previa o sin conexión), lo guarda en este navegador y lo reintenta más tarde.
   API para el panel: window.NCComentarios = { listar, crear, cambiar, pendientesLocales, abrir, PRIORIDADES, ESTADOS }. */
'use strict';
(() => {
  const API = new URL('api/comentarios', document.currentScript.src.replace(/[^/]*$/, '')).pathname;
  const K_COLA = 'naranco_comentarios_cola', K_AUTOR = 'naranco_comentarios_autor';
  const PRIORIDADES = { imprescindible: 'Imprescindible', me_gustaria: 'Me gustaría', mas_adelante: 'Idea para más adelante' };
  const ESTADOS = { nuevo: 'Nuevo', en_curso: 'En curso', hecho: 'Hecho', descartado: 'Descartado' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

  async function pedir(metodo, cuerpo, query = '') {
    const r = await fetch(API + query, {
      method: metodo, credentials: 'same-origin', headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }

  // ---- cola local (vista previa o sin conexión) ----
  const cola = () => leer(K_COLA, []);
  async function vaciarCola() {
    const l = cola(); if (!l.length) return 0;
    const quedan = []; let n = 0;
    for (const c of l) { try { await pedir('POST', c); n++; } catch { quedan.push(c); } }
    guardar(K_COLA, quedan);
    if (n) avisarCambio();
    return n;
  }

  async function listar() {
    await vaciarCola();
    const d = await pedir('GET');
    return d.comentarios || [];
  }
  async function crear(c) {
    try { const d = await pedir('POST', c); avisarCambio(); return { ok: true, comentario: d.comentario }; }
    catch { const l = cola(); l.push({ ...c, creado: new Date().toISOString() }); guardar(K_COLA, l); avisarCambio(); return { ok: false }; }
  }
  async function cambiar(id, cambios) { const d = await pedir('PATCH', cambios, '?id=' + encodeURIComponent(id)); avisarCambio(); return d.comentario; }
  const avisarCambio = () => window.dispatchEvent(new CustomEvent('nc-comentarios'));

  // ---- dónde está mirando: pestaña del panel o sección visible de la web ----
  function dondeActual() {
    if (document.body.dataset.donde) return 'Panel · ' + document.body.dataset.donde;
    const medio = innerHeight * 0.4;
    for (const s of document.querySelectorAll('main section')) {
      const r = s.getBoundingClientRect();
      if (r.top <= medio && r.bottom >= medio) {
        const h = s.querySelector('h1, h2'); const t = h ? h.textContent.trim().replace(/\s+/g, ' ') : s.id;
        return 'Web · ' + (t.length > 70 ? t.slice(0, 67) + '…' : t);
      }
    }
    return scrollY < 200 ? 'Web · Portada' : 'Web · General';
  }

  // ---- interfaz ----
  const dlg = document.createElement('dialog');
  dlg.className = 'nc-com';
  dlg.setAttribute('aria-labelledby', 'nc-com-t');
  dlg.innerHTML = `<form method="dialog" class="nc-com__f" novalidate>
      <div class="nc-com__cab"><h2 id="nc-com-t">¿Qué cambiarías?</h2><button type="button" class="nc-com__x" data-cerrar aria-label="Cerrar">×</button></div>
      <p class="nc-com__ayuda">Un cambio por comentario. Cuanto más concreto, mejor: qué ves, qué esperabas y, si puedes, un ejemplo.</p>
      <div class="campo"><label for="nc-com-donde">Dónde</label><input id="nc-com-donde" name="donde" maxlength="120" autocomplete="off"></div>
      <div class="campo"><label for="nc-com-texto">Tu comentario</label><textarea id="nc-com-texto" name="texto" rows="5" maxlength="4000" required placeholder="Ej.: en la portada pondría una foto de grupo en lugar de esta."></textarea></div>
      <fieldset class="nc-com__prio"><legend>Prioridad</legend>
        ${Object.entries(PRIORIDADES).map(([k, v], i) => `<label><input type="radio" name="prioridad" value="${k}"${i === 1 ? ' checked' : ''}> <span>${v}</span></label>`).join('')}
      </fieldset>
      <div class="campo"><label for="nc-com-autor">Quién escribe</label><select id="nc-com-autor" name="autor"><option>Mateo</option><option>Miguel</option></select></div>
      <p class="nc-com__err" role="alert" hidden></p>
      <div class="nc-com__acc"><button type="button" class="btn btn--borde" data-cerrar>Cancelar</button><button type="submit" class="btn btn--primario">Enviar comentario</button></div>
    </form>
    <div class="nc-com__ok" hidden tabindex="-1" role="status"><b>¡Anotado!</b><p class="nc-com__okd"></p>
      <div class="nc-com__acc"><button type="button" class="btn btn--borde" data-otro>Dejar otro</button><button type="button" class="btn btn--primario" data-cerrar>Seguir mirando</button></div></div>`;
  const pestaña = document.createElement('button');
  pestaña.type = 'button'; pestaña.className = 'nc-com-tab'; pestaña.textContent = 'Comentar';
  pestaña.setAttribute('aria-haspopup', 'dialog');
  pestaña.title = 'Deja un comentario sobre lo que estás viendo';

  const f = dlg.querySelector('form'), ok = dlg.querySelector('.nc-com__ok'), err = dlg.querySelector('.nc-com__err');
  function abrir(donde) {
    f.reset(); f.hidden = false; ok.hidden = true; err.hidden = true;
    f.elements.donde.value = donde || dondeActual();
    f.elements.autor.value = leer(K_AUTOR, 'Mateo');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    f.elements.texto.focus();
  }
  const cerrar = () => { if (dlg.open) dlg.close(); };
  pestaña.addEventListener('click', () => abrir());
  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-cerrar]') || e.target === dlg) cerrar();
    if (e.target.closest('[data-otro]')) abrir(f.elements.donde.value);
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const texto = f.elements.texto.value.trim();
    if (!texto) { err.textContent = 'Escribe qué cambiarías.'; err.hidden = false; f.elements.texto.focus(); return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    guardar(K_AUTOR, f.elements.autor.value);
    const r = await crear({ texto, donde: f.elements.donde.value.trim(), prioridad: f.elements.prioridad.value, autor: f.elements.autor.value, url: location.pathname + location.hash });
    btn.disabled = false; f.hidden = true; ok.hidden = false;
    ok.querySelector('.nc-com__okd').textContent = r.ok
      ? 'Lo verás en el panel, en la pestaña Comentarios. Lo revisaremos y te diremos qué hacemos con él.'
      : 'No hemos podido enviarlo ahora, así que se ha guardado en este navegador y se enviará solo en cuanto haya conexión.';
    ok.focus();
  });

  document.body.append(pestaña, dlg);
  vaciarCola().catch(() => { });
  window.NCComentarios = { listar, crear, cambiar, abrir, pendientesLocales: () => cola().length, PRIORIDADES, ESTADOS, esc };
})();
