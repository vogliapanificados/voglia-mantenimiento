/**
 * ============================================================
 *  Voglia Mantenimiento — ui.js
 *  Herramientas para dibujar pantallas, avisos, ventanas y
 *  formatos argentinos (fecha, hora, pesos, duraciones).
 *
 *  Todo el texto se inserta con textContent (nunca innerHTML con
 *  datos), así nada de lo que se escriba en la app puede "romper"
 *  la pantalla ni ejecutar código.
 * ============================================================
 */

const ZONA = 'America/Argentina/Buenos_Aires';

// ---------- Crear elementos ----------

/**
 * h('div', { class: 'x', onclick: fn }, 'texto', otroElemento, [lista])
 * Atributos especiales: class, style (objeto), on<evento>, dataset (objeto).
 */
export function h(tag, props, ...hijos) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const hijo of hijos) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    if (Array.isArray(hijo)) agregar(el, hijo);
    else if (hijo instanceof Node) el.appendChild(hijo);
    else el.appendChild(document.createTextNode(String(hijo)));
  }
}

/** Reemplaza el contenido de un elemento. */
export function poner(el, ...hijos) {
  el.replaceChildren();
  agregar(el, hijos);
  return el;
}

export const cargando = () => h('div', { class: 'cargando-pantalla' }, h('div', { class: 'spinner' }));
export const vacio = (texto) => h('div', { class: 'vacio' }, texto);

/** Fila "etiqueta ........ valor" */
export const dato = (etiqueta, valor) => (valor === '' || valor === null || valor === undefined)
  ? null : h('div', { class: 'dato' }, h('span', null, etiqueta), h('span', null, valor));

// ---------- Avisos cortos (toast) ----------

export function aviso(texto, tipo = '', segundos = 4) {
  const caja = document.getElementById('avisos');
  const el = h('div', { class: 'aviso ' + tipo }, texto);
  caja.appendChild(el);
  setTimeout(() => el.remove(), segundos * 1000);
}

export const avisoError = (e) => aviso(e && e.message ? e.message : String(e), 'error', 6);

// ---------- Ventana (modal) ----------

/** Abre una ventana con el contenido que arma fn(cerrar). Devuelve cerrar(). */
export function abrirModal(fn) {
  const modal = document.getElementById('modal');
  const cerrar = () => { modal.classList.add('oculto'); modal.replaceChildren(); };
  const caja = h('div', { class: 'modal-caja' });
  poner(modal, caja);
  poner(caja, fn(cerrar));
  modal.classList.remove('oculto');
  modal.onclick = (ev) => { if (ev.target === modal) cerrar(); };
  return cerrar;
}

/** Pregunta Sí / No. Devuelve una promesa con true o false. */
export function confirmar({ titulo, texto, si = 'Sí, confirmar', no = 'Cancelar', claseSi = 'btn' }) {
  return new Promise((resolver) => {
    abrirModal((cerrar) => [
      h('h2', null, titulo),
      texto ? (texto instanceof Node ? texto : h('p', null, texto)) : null,
      h('div', { style: { height: '12px' } }),
      h('button', { class: claseSi, onclick: () => { cerrar(); resolver(true); } }, si),
      h('button', { class: 'btn btn-secundario', onclick: () => { cerrar(); resolver(false); } }, no)
    ]);
  });
}

/**
 * Ejecuta una acción mostrando "cargando" en el botón y evitando
 * que se toque dos veces. Si falla, muestra el error.
 */
export async function conBoton(boton, fn) {
  if (boton.disabled) return;
  const contenido = Array.from(boton.childNodes);
  boton.disabled = true;
  poner(boton, h('div', { class: 'spinner' }));
  try {
    return await fn();
  } catch (e) {
    avisoError(e);
    return undefined;
  } finally {
    if (boton.isConnected) { poner(boton, contenido); boton.disabled = false; }
  }
}

// ---------- Formatos argentinos ----------

const fmtFecha = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });

const aFecha = (v) => (v instanceof Date ? v : (v ? new Date(v) : null));
const valida = (d) => d && !isNaN(d.getTime());

/** 18/11/2026 */
export function fecha(v) {
  const d = aFecha(v);
  return valida(d) ? fmtFecha.format(d) : '';
}

/** 18/11/2026 09:30 */
export function fechaHora(v) {
  const d = aFecha(v);
  return valida(d) ? fmtFecha.format(d) + ' ' + fmtHora.format(d) : '';
}

/** 2 h 15 min / 1 d 3 h / 25 min */
export function duracion(minutos) {
  minutos = Math.max(0, Math.round(minutos || 0));
  if (minutos < 60) return minutos + ' min';
  const d = Math.floor(minutos / 1440), hs = Math.floor((minutos % 1440) / 60), m = minutos % 60;
  if (d) return d + ' d' + (hs ? ' ' + hs + ' h' : '');
  return hs + ' h' + (m ? ' ' + m + ' min' : '');
}

/** "hace 2 h 15 min" desde una fecha */
export function hace(v) {
  const d = aFecha(v);
  if (!valida(d)) return '';
  const min = (Date.now() - d.getTime()) / 60000;
  return min < 1 ? 'recién' : 'hace ' + duracion(min);
}

/** $ 45.000 */
export function pesos(n) {
  const v = Number(n) || 0;
  return '$ ' + v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

/** Convierte "45.000" o "45000,50" a número. */
export function leerMonto(texto) {
  const limpio = String(texto || '').replace(/[^\d,]/g, '').replace(',', '.');
  return limpio ? Number(limpio) : NaN;
}

/** Fecha de hoy en Argentina como aaaa-mm-dd (para los input date). */
export function hoyISO(desplazamientoDias = 0) {
  const d = new Date(Date.now() + desplazamientoDias * 86400000);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p; // en-CA da aaaa-mm-dd
}

// ---------- Estados y prioridades ----------

export const ESTADOS = ['Funcionando normalmente', 'En falla', 'En reparación', 'En mantenimiento'];
export const PRIORIDADES = ['Máquina parada', 'Funciona con problemas', 'Leve'];
const ICONO_PRIORIDAD = ['🔴', '🟠', '⚪'];

export function claseEstado(estado) {
  if (estado === 'En falla') return 'est-falla';
  if (estado === 'En reparación') return 'est-reparacion';
  if (estado === 'En mantenimiento') return 'est-mant';
  return 'est-ok';
}

export function iconoEstado(estado) {
  if (estado === 'En falla') return '🔴';
  if (estado === 'En reparación') return '🟡';
  if (estado === 'En mantenimiento') return '🔵';
  return '🟢';
}

export const rangoPrioridad = (p) => { const i = PRIORIDADES.indexOf(p); return i < 0 ? 3 : i; };

export function etiquetaPrioridad(p) {
  const i = rangoPrioridad(p);
  return h('span', { class: 'etiqueta prio-' + Math.min(i, 2) }, (ICONO_PRIORIDAD[i] || '') + ' ' + p);
}

export function etiquetaEstado(estado) {
  return h('span', { class: 'etiqueta ' + claseEstado(estado) }, estado);
}

export const ROLES = { admin: 'Administrador', encargado: 'Encargado', mecanico: 'Mecánico' };

/** Quita tildes y pasa a minúsculas (para buscar). */
export const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Marca "⏳ sin enviar": lo cargado sin señal que todavía no llegó a la planilla. */
export const chipPendiente = () => h('span', { class: 'chip-pendiente', title: 'Guardado en el celular: se está enviando' }, navigator.onLine === false ? '⏳ sin enviar' : '⏳ enviando');
