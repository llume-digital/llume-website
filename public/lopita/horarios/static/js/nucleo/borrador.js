import { clone } from './util.js';
import { confirmar, deshacer, state } from './estado.js';
import { markDirty } from './enlace.js';
import { renderView } from './pintado.js';

// Salir de lo que se está editando sin perder cambios: pregunta solo si hay algo sin guardar.
export const confirmLeave = async () => !state.dirty || confirmar({ titulo: '¿Descartar los cambios sin guardar?', verbo: 'Descartar cambios', peligro: true });

// Para borrar algo del borrador: sin preguntar, con «Deshacer» (el borrador no se guarda hasta pulsar Guardar).
export function conDeshacer(msg) {
  const antes = clone(state.draft), sucio = state.dirty;
  return () => deshacer(msg, () => { state.draft = antes; state.dirty = sucio; if (sucio) markDirty(); renderView(); });
}
