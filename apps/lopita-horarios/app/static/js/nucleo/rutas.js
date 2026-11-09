// Rutas de la interfaz: la dirección (#/pantalla/arg/...) decide qué vista se pinta y qué se reinicia al llegar.
import { state } from './estado.js';
import { viewHorarios } from '../pantallas/horarios.js';
import { viewDetalle } from '../pantallas/cuadrante.js';
import { viewHistorial } from '../pantallas/historial.js';
import { viewAlertas } from '../pantallas/alertas.js';
import { viewCalendario } from '../pantallas/calendario.js';
import { closeMenu } from '../pantallas/dia.js';
import { viewEquipo } from '../pantallas/equipo.js';
import { viewFunciones } from '../pantallas/funciones.js';
import { viewTurnos } from '../pantallas/turnos.js';
import { viewDemanda } from '../pantallas/demanda.js';
import { viewAusencias } from '../pantallas/ausencias.js';
import { viewPreferencias } from '../pantallas/preferencias.js';
import { viewReglas } from '../pantallas/reglas.js';
import { viewAjustes } from '../pantallas/ajustes.js';
import { viewMiInicio, viewMisHoras, viewMisPrefs, viewMisVacaciones } from '../pantallas/portal.js';
import { viewSolicitudes } from '../pantallas/solicitudes.js';
import { viewWeb } from '../pantallas/web.js';
import { viewGuia } from '../pantallas/guia.js';
import { viewNovedades } from '../pantallas/novedades.js';
import { viewComentarios } from '../pantallas/comentarios.js';
import { viewInformes } from '../pantallas/informes.js';

const esTrabajadora = () => state.me && state.me.rol === 'empleado';

export function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || (esTrabajadora() ? 'inicio' : 'horarios')).split('/');
  return { name: parts[0], arg: parts[1], arg2: parts[2], arg3: parts[3] };
}

const VISTAS_TRABAJADORA = { inicio: viewMiInicio, horas: viewMisHoras, vacaciones: viewMisVacaciones, preferencias: viewMisPrefs, guia: viewGuia };
const VISTAS_ENCARGADO = (r) => ({
  horarios: r.arg ? (r.arg2 === 'historial' ? () => viewHistorial(Number(r.arg)) : () => viewDetalle(Number(r.arg))) : viewHorarios,
  calendario: viewCalendario, alertas: viewAlertas, solicitudes: viewSolicitudes, informes: viewInformes, equipo: viewEquipo, funciones: viewFunciones, turnos: viewTurnos, demanda: viewDemanda, ausencias: viewAusencias, preferencias: viewPreferencias, reglas: viewReglas, web: viewWeb, comentarios: viewComentarios, ajustes: viewAjustes, novedades: viewNovedades, guia: viewGuia })

// La vista de una ruta; una pantalla que no existe (o que no es de ese rol) cae en la de inicio.
export function vistaDe(r, trabajadora) {
  const vistas = trabajadora ? VISTAS_TRABAJADORA : VISTAS_ENCARGADO(r);
  const name = vistas[r.name] ? r.name : (trabajadora ? 'inicio' : 'horarios');
  return { name, vista: vistas[name] };
}

// Qué se reinicia al llegar a una pantalla: cada una arranca sin los datos de la visita anterior.
const AL_LLEGAR = {
  calendario: () => { state.cal.data = {}; state.cal.inf = {}; },
  web: () => { state.web.data = undefined; },
};

// Se llama en cada cambio de dirección, antes de pintar. Devuelve si hay que volver arriba del todo.
export function alNavegar() {
  closeMenu();
  state.historial = null;
  const r = route();
  if (AL_LLEGAR[r.name]) AL_LLEGAR[r.name]();
  return !(r.name === 'guia' && r.arg);
}
