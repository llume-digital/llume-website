import { esc } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { head, toggle } from '../nucleo/pintado.js';
// ------------------------------------------------------------------ REGLAS
function numField(path, label, hint, val, step = 0.5, min = 0) {
  return `<label class="field">${label}${hint ? `<span class="hint">${hint}</span>` : ''}<input type="number" step="${step}" min="${min}" value="${val}" data-bind="${path}"></label>`;
}
function alertSettingsCard() {
  const a = state.draft.alertas;
  const cat = (state.me && state.me.alertas_catalogo) || [];
  const activas = cat.filter((c) => !a.desactivadas.includes(c.codigo)).length;
  return `<details class="card section"${state.reglasAlertasAbiertas ? ' open' : ''}><summary style="cursor:pointer"><h2 style="display:inline">Alertas</h2> <span class="small muted">· ${activas} de ${cat.length} activas</span></summary>
    <p class="small muted">Cuándo te avisa el sistema. El motor también intenta no pasarse de los umbrales de reparto y de días seguidos.</p>
    <div class="fields two">
      ${numField('alertas.reparto_horas_pct', 'Reparto de horas (puntos %)', 'Diferencia máxima entre quien más y quien menos cumple su contrato', a.reparto_horas_pct, 1)}
      ${numField('alertas.reparto_fines_semana', 'Fines de semana (diferencia)', 'Entre quien más y quien menos trabaja', a.reparto_fines_semana, 1)}
      ${numField('alertas.reparto_cierres', 'Cierres (diferencia)', 'Entre quien más y quien menos cierra', a.reparto_cierres, 1)}
      ${numField('alertas.preferencias_incumplidas_pct', 'Preferencias incumplidas (%)', 'Días fuera de su franja a partir de los cuales se avisa', a.preferencias_incumplidas_pct, 5)}
      ${numField('alertas.racha_dias_max', 'Días seguidos máximos', 'A partir de ahí se avisa', a.racha_dias_max, 1, 1)}
      ${numField('alertas.exceso_personal_horas_dia', 'Personal de más (horas-persona al día)', '', a.exceso_personal_horas_dia, 0.5)}
      ${numField('alertas.plantilla_sobra_pct', 'Plantilla sobrante (%)', 'Cuánto pueden superar los contratos a la demanda de una semana antes de avisar', a.plantilla_sobra_pct, 1)}
    </div>
    <h3 style="margin:18px 0 6px;font-size:var(--text-base)">Qué alertas recibir</h3>
    <div class="alertas-casillas">${cat.map((c) => `<label class="toggle"><input type="checkbox" data-act-change="toggleAlertCode" data-code="${esc(c.codigo)}" ${a.desactivadas.includes(c.codigo) ? '' : 'checked'}> ${esc(c.descripcion)}</label>`).join('')}</div>
    <p class="small muted" style="margin-bottom:0">Las reglas incumplidas, las ausencias que no se reflejan en el horario y los avisos de contexto no se pueden silenciar.</p>
  </details>`;
}

export function viewReglas() {
  const r = state.draft.reglas, w = state.draft.pesos;
  return `${head('Reglas', 'Lo que un horario debe cumplir. Revisa estos valores con la gestoría y el convenio de hostelería de Asturias.')}
  <div class="card"><h2>Descansos y jornada</h2><div class="fields two">
    ${numField('reglas.descanso_minimo_horas', 'Descanso entre jornadas (h)', 'Mínimo entre el fin de un turno y el siguiente', r.descanso_minimo_horas)}
    ${numField('reglas.dias_libres_por_semana', 'Días libres por semana', 'Mínimo por semana natural', r.dias_libres_por_semana)}
    ${numField('reglas.max_horas_dia', 'Máximo de horas al día', '', r.max_horas_dia)}
  </div></div>
  <div class="card section"><h2>Bolsa de horas</h2><div class="fields two">
    ${numField('reglas.margen_semanal_horas', 'Margen semanal (h)', 'Cuánto puede variar una semana respecto al contrato', r.margen_semanal_horas)}
    ${numField('reglas.margen_periodo_horas', 'Tolerancia del periodo (h)', 'Diferencia que no cuenta como extra ni como falta', r.margen_periodo_horas)}
    ${numField('reglas.max_horas_extra_semana', 'Horas extra máximas por semana', 'Solo se usan si no hay otra forma de cubrir', r.max_horas_extra_semana)}
    ${numField('reglas.max_saldo_horas', 'Saldo máximo que se arrastra (h)', '', r.max_saldo_horas)}
  </div>
  <div class="stack" style="gap:10px;margin-top:14px">${toggle('reglas.arrastrar_saldo', r.arrastrar_saldo, 'Compensar en cada periodo las horas de más o de menos del anterior')}</div></div>
  <div class="card section"><h2>Cobertura</h2>
    <div class="stack" style="gap:10px">${toggle('reglas.encargado_siempre', r.encargado_siempre, 'Intentar que siempre haya un encargado en el local')}</div>
    <div class="fields two" style="margin-top:14px"><label class="field">Precisión de la cobertura<select data-bind="reglas.resolucion_minutos" data-type="int">${[15, 30, 60].map((v) => `<option value="${v}" ${r.resolucion_minutos === v ? 'selected' : ''}>${v} minutos</option>`).join('')}</select></label></div>
  </div>
  ${alertSettingsCard()}
  <details class="card section"><summary style="cursor:pointer"><h2 style="display:inline">Ajuste fino del motor</h2> <span class="small muted">· para usuarios avanzados</span></summary>
    <p class="small muted">Cuánto penaliza el motor cada cosa. Cubrir la demanda debe ser siempre lo más importante.</p>
    <div class="fields two">
      ${numField('pesos.falta_cobertura', 'Falta de cobertura', '', w.falta_cobertura, 1, 1)}
      ${numField('pesos.falta_encargado', 'Falta de encargado', '', w.falta_encargado, 1, 1)}
      ${numField('pesos.falta_funcion', 'Falta de alguien con una función', 'Por cada tramo sin nadie en caja, sin quien prepare pinchos (o la función que sea)', w.falta_funcion ?? 800, 1, 0)}
      ${numField('pesos.exceso_funcion', 'Gente de más en un rol', 'Por cada tramo con más gente en un rol de la que permite su regla (p. ej. dos en lava)', w.exceso_funcion ?? 400, 1, 0)}
      ${numField('pesos.horas_extra', 'Horas extra', '', w.horas_extra, 1, 0)}
      ${numField('pesos.horas_por_debajo_contrato', 'Horas por debajo del contrato', '', w.horas_por_debajo_contrato, 1, 0)}
      ${numField('pesos.uso_comodin', 'Cada minuto de un comodín', 'Menos que las horas extra: el comodín cubre los huecos antes de que alguien haga horas de más', w.uso_comodin, 1, 0)}
      ${numField('pesos.exceso_cobertura', 'Personal de más', '', w.exceso_cobertura, 1, 0)}
      ${numField('pesos.preferencia', 'Preferencias', '', w.preferencia, 1, 0)}
      ${numField('pesos.reparto_desigual', 'Reparto desigual de fines de semana y cierres', '', w.reparto_desigual, 1, 0)}
      ${numField('pesos.reparto_turnos', 'Fines de semana o cierres por encima del umbral de alertas', 'Por cada uno de diferencia entre personas', w.reparto_turnos, 1, 0)}
      ${numField('pesos.reparto_horas', 'Reparto de horas por encima del umbral de alertas', 'Por cada milésima de diferencia en el % de contrato', w.reparto_horas, 1, 0)}
      ${numField('pesos.racha_larga', 'Rachas de días seguidos', 'Por cada día por encima del aviso de rachas', w.racha_larga, 1, 0)}
      ${numField('pesos.critica', 'Alertas críticas (el horario no vale)', 'Cada media hora sin nadie y cada día sin quien abra o cierre; muy por encima de todo lo demás', w.critica, 1, 0)}
      ${numField('pesos.saldo_desbordado', 'Saldo de horas que no se podría arrastrar', '', w.saldo_desbordado, 1, 0)}
      ${numField('pesos.cambio_turno', 'Cada casilla que cambia al solucionar problemas', 'Cuanto mayor, menos cambios propone el solucionador', w.cambio_turno, 1, 0)}
    </div>
  </details>`;
}

