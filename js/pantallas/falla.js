/**
 * Cargar una falla (todos los roles). Si la máquina ya tiene una falla abierta,
 * el backend la agrega como nota y, si la prioridad es más alta, la sube.
 */
import { h, poner, aviso, conBoton, claseEstado, etiquetaPrioridad } from '../ui.js';
import { cargar } from '../api.js';
import { datosAlDia, maquinaPorId, invalidarDatos, es } from '../estado.js';
import { marcarReciente } from './reportar.js';
import { ir, ponerTitulo } from '../app.js';
import { selectorFotos } from '../fotos.js';

const ICONOS = ['🔴', '🟠', '⚪'];
const AYUDA_PRIORIDAD = ['No se puede usar', 'Anda, pero con problemas', 'Se puede seguir usando'];

export async function pantallaFalla(cont, [idMaquina]) {
  const datos = await datosAlDia();
  const m = maquinaPorId(idMaquina);
  if (!m) throw new Error('No se encontró la máquina.');
  ponerTitulo(m.incidente ? 'Agregar a la falla' : 'Cargar falla');

  let tipoFalla = '';
  let prioridad = '';

  const cajaTipos = h('div', { class: 'opciones dos' });
  const cajaPrioridad = h('div', { class: 'opciones' });
  const selector = selectorFotos({ texto: '📷 Sacar o agregar foto (opcional)' });
  const descripcion = h('textarea', { placeholder: 'Contá qué pasa: qué hace la máquina, desde cuándo, qué se probó…', maxlength: 2000 });

  const dibujarTipos = () => poner(cajaTipos, datos.tipos_falla.map(t =>
    h('button', { class: 'opcion' + (t === tipoFalla ? ' elegida' : ''), onclick: () => { tipoFalla = t; dibujarTipos(); } }, t)));

  const dibujarPrioridad = () => poner(cajaPrioridad, datos.prioridades.map((p, i) =>
    h('button', { class: 'opcion prio-' + i + (p === prioridad ? ' elegida' : ''), onclick: () => { prioridad = p; dibujarPrioridad(); } },
      h('div', { class: 'negrita' }, ICONOS[i] + ' ' + p),
      h('div', { class: 'suave chico' }, AYUDA_PRIORIDAD[i]))));

  dibujarTipos();
  dibujarPrioridad();

  async function enviar(boton) {
    if (!tipoFalla) return aviso('Elegí el tipo de falla.', 'error');
    if (!prioridad) return aviso('Elegí la prioridad.', 'error');
    if (!descripcion.value.trim()) return aviso('Escribí una descripción.', 'error');
    await conBoton(boton, async () => {
      const r = await cargar('cargarFalla', {
        id_maquina: idMaquina, tipo_falla: tipoFalla, prioridad, descripcion: descripcion.value.trim(),
        fotos: selector.fotos()
      });
      aviso(r.mensaje || 'Falla registrada.', 'ok', 6);
      invalidarDatos();
      marcarReciente(idMaquina);
      // El encargado vuelve a su Inicio (ahí ve el seguimiento); los demás, a la máquina
      ir(es('encargado') ? 'inicio' : 'maquina/' + idMaquina);
    });
  }

  const inc = m.incidente;
  poner(cont,
    h('div', { class: 'tarjeta maquina ' + claseEstado(m.estado) },
      h('div', { class: 'maquina-nombre' }, m.nombre),
      h('div', { class: 'maquina-detalle' }, m.estado)),
    inc ? h('div', { class: 'tarjeta', style: { background: 'var(--amarillo-claro)' } },
      h('p', { class: 'negrita' }, 'Esta máquina ya tiene una falla abierta'),
      h('p', null, 'Lo que cargues se agrega como nota a esa falla. Si elegís una prioridad más alta que la actual (',
        etiquetaPrioridad(inc.prioridad), '), la falla sube de prioridad.')) : null,
    h('h2', null, 'Tipo de falla'), cajaTipos,
    h('h2', null, 'Prioridad'), cajaPrioridad,
    h('h2', null, 'Descripción'), descripcion,
    h('h2', null, 'Fotos'), selector.elemento,
    h('div', { style: { height: '14px' } }),
    h('button', { class: 'btn btn-rojo', onclick: (ev) => enviar(ev.currentTarget) }, inc ? 'Agregar nota y avisar' : 'Enviar falla y avisar'),
    h('button', { class: 'btn btn-secundario', onclick: () => history.back() }, 'Cancelar'));
}
