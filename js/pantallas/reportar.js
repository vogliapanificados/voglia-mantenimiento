/**
 * Reportar una falla: primero se elige la máquina (buscador, las últimas usadas
 * primero y el resto agrupado por sector) y después se completa la falla.
 */
import { h, poner, vacio, claseEstado, iconoEstado, normalizar } from '../ui.js';
import { recargarDatos } from '../estado.js';
import { ir } from '../app.js';

const CLAVE_RECIENTES = 'voglia_recientes';
const MAX_RECIENTES = 6;

/** Guarda una máquina como "usada hace poco" en este celular. */
export function marcarReciente(idMaquina) {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]').filter(x => x !== idMaquina);
    lista.unshift(idMaquina);
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista.slice(0, MAX_RECIENTES)));
  } catch (e) { /* sin lugar en el celular: no pasa nada */ }
}

function recientes() {
  try { return JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]'); } catch (e) { return []; }
}

export async function pantallaReportar(cont) {
  return elegirMaquina(cont, {
    pregunta: '¿En qué máquina es la falla?',
    destino: (m) => 'falla/' + m.id_maquina,
    nota: (m) => m.incidente ? 'Ya tiene una falla abierta: lo que cargues se suma como nota.' : ''
  });
}

/**
 * Lista de máquinas para elegir una (buscador, las últimas usadas primero y el resto por sector).
 * opciones: { pregunta, destino(m) → ruta, nota(m) → texto debajo, arriba: elementos antes del buscador }
 */
export async function elegirMaquina(cont, { pregunta, destino, nota = () => '', arriba = null }) {
  const datos = await recargarDatos();
  const maquinas = datos.maquinas.filter(m => m.activa === 'SI');
  const ordenSector = (s) => { const i = datos.sectores.findIndex(x => x.sector === s); return i < 0 ? 999 : i; };
  const lista = h('div');
  let texto = '';

  const boton = (m) => h('button', { class: 'tarjeta tarjeta-tocable maquina ' + claseEstado(m.estado), onclick: () => ir(destino(m)) },
    h('div', { class: 'fila' },
      h('span', { class: 'negrita crece' }, m.nombre),
      m.estado !== 'Funcionando normalmente' ? h('span', { class: 'etiqueta etiqueta-estado' }, iconoEstado(m.estado) + ' ' + m.estado) : null),
    nota(m) ? h('div', { class: 'maquina-detalle' }, nota(m)) : null);

  function dibujar() {
    const t = normalizar(texto.trim());
    if (t) {
      const encontradas = maquinas.filter(m => normalizar(m.nombre + ' ' + m.tipo + ' ' + m.marca + ' ' + m.sector).includes(t))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
      return poner(lista, encontradas.length ? encontradas.map(boton) : vacio('No hay máquinas con ese nombre.'));
    }
    const ultimas = recientes().map(id => maquinas.find(m => m.id_maquina === id)).filter(Boolean);
    const sectores = [...new Set(maquinas.map(m => m.sector || 'Sin sector'))].sort((a, b) => ordenSector(a) - ordenSector(b));
    poner(lista,
      ultimas.length ? [h('h2', null, 'Usadas hace poco'), ultimas.map(boton)] : null,
      sectores.map(s => [
        h('h2', null, s),
        maquinas.filter(m => (m.sector || 'Sin sector') === s)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true })).map(boton)
      ]));
  }

  const buscador = h('input', { type: 'search', placeholder: '🔍 Buscar la máquina…', oninput: (ev) => { texto = ev.target.value; dibujar(); } });
  dibujar();
  poner(cont,
    arriba,
    h('p', { class: 'suave' }, pregunta),
    h('div', { class: 'buscador' }, buscador),
    lista);
}
