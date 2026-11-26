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

  // 26/11/2026: primero la categoría (Eléctrica / Mecánica / Otra), después la falla de su lista o escrita a mano
  let categoria = '';
  let tipoFalla = '';
  let aMano = false;
  let prioridad = '';

  const ICONO_CAT = { 'Eléctrica': '⚡', 'Mecánica': '⚙️', 'Otra': '❓' };
  const categorias = datos.categorias_falla || ['Eléctrica', 'Mecánica', 'Otra'];
  const porCategoria = datos.fallas_por_categoria || { Otra: datos.tipos_falla || [] };
  const cajaCategorias = h('div', { class: 'opciones tres' });
  const cajaTipos = h('div', { class: 'opciones dos' });
  const textoTipo = h('input', { type: 'text', maxlength: 60, placeholder: 'Escribí qué falla es (ej. Se quemó un fusible)', oninput: (ev) => { tipoFalla = ev.target.value.trim(); } });
  const cajaPrioridad = h('div', { class: 'opciones' });
  const selector = selectorFotos({ texto: '📷 Sacar o agregar foto (opcional)' });
  const descripcion = h('textarea', { placeholder: 'Contá qué pasa: qué hace la máquina, desde cuándo, qué se probó…', maxlength: 2000 });

  const dibujarCategorias = () => poner(cajaCategorias, categorias.map(c =>
    h('button', { class: 'opcion' + (c === categoria ? ' elegida' : ''), onclick: () => { if (c !== categoria) { categoria = c; tipoFalla = ''; aMano = false; textoTipo.value = ''; } dibujarCategorias(); dibujarTipos(); } },
      h('div', { class: 'negrita' }, (ICONO_CAT[c] || '') + ' ' + c))));

  const dibujarTipos = () => {
    if (!categoria) return poner(cajaTipos, h('p', { class: 'suave chico' }, 'Elegí primero si es eléctrica, mecánica u otra.'));
    poner(cajaTipos,
      (porCategoria[categoria] || []).map(t =>
        h('button', { class: 'opcion' + (!aMano && t === tipoFalla ? ' elegida' : ''), onclick: () => { tipoFalla = t; aMano = false; dibujarTipos(); } }, t)),
      h('button', { class: 'opcion' + (aMano ? ' elegida' : ''), onclick: () => { aMano = true; tipoFalla = textoTipo.value.trim(); dibujarTipos(); setTimeout(() => textoTipo.focus(), 0); } }, '✏️ Escribir otra'),
      aMano ? h('div', { class: 'ancho-total' }, textoTipo) : null);
  };

  const dibujarPrioridad = () => poner(cajaPrioridad, datos.prioridades.map((p, i) =>
    h('button', { class: 'opcion prio-' + i + (p === prioridad ? ' elegida' : ''), onclick: () => { prioridad = p; dibujarPrioridad(); } },
      h('div', { class: 'negrita' }, ICONOS[i] + ' ' + p),
      h('div', { class: 'suave chico' }, AYUDA_PRIORIDAD[i]))));

  dibujarCategorias();
  dibujarTipos();
  dibujarPrioridad();

  async function enviar(boton) {
    if (!categoria) return aviso('Elegí si la falla es eléctrica, mecánica u otra.', 'error');
    if (!tipoFalla) return aviso(aMano ? 'Escribí qué falla es.' : 'Elegí la falla de la lista o tocá "Escribir otra".', 'error');
    if (!prioridad) return aviso('Elegí la prioridad.', 'error');
    if (!descripcion.value.trim()) return aviso('Escribí una descripción.', 'error');
    await conBoton(boton, async () => {
      const r = await cargar('cargarFalla', {
        id_maquina: idMaquina, categoria, tipo_falla: tipoFalla, prioridad, descripcion: descripcion.value.trim(),
        fotos: selector.fotos()
      });
      aviso(r.mensaje || 'Falla registrada.', 'ok', 6);
      invalidarDatos();
      marcarReciente(idMaquina);
      // El encargado y el electricista vuelven a su Inicio (ahí ve el seguimiento); los demás, a la máquina
      ir(es('encargado', 'electricista') ? 'inicio' : 'maquina/' + idMaquina);
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
    h('h2', null, 'Tipo de falla'), cajaCategorias,
    h('div', { style: { height: '8px' } }), cajaTipos,
    h('h2', null, 'Prioridad'), cajaPrioridad,
    h('h2', null, 'Descripción'), descripcion,
    h('h2', null, 'Fotos'), selector.elemento,
    h('div', { style: { height: '14px' } }),
    h('button', { class: 'btn btn-rojo', onclick: (ev) => enviar(ev.currentTarget) }, inc ? 'Agregar nota y avisar' : 'Enviar falla y avisar'),
    h('button', { class: 'btn btn-secundario', onclick: () => history.back() }, 'Cancelar'));
}
