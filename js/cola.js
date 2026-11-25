/**
 * ============================================================
 *  Voglia Mantenimiento — cola.js
 *  Cola de cargas sin señal (decidido con Juan, CLAUDE.md 13.1).
 *
 *  - Las cargas de planta (fallas, reparaciones, repuestos, trabajos,
 *    preventivos, total diario) se guardan primero en el celular
 *    (IndexedDB) y se envían en el MISMO ORDEN en que se hicieron.
 *    Así se puede encadenar sin señal: empezar → pedir → cerrar.
 *  - Cada carga lleva su id_cliente (UUID) y la hora real en que se
 *    hizo: si se reintenta, el backend no la duplica.
 *  - Se reintenta sola: al volver la señal (evento "online"), al abrir
 *    la app, al volver a la app y cada 30 segundos mientras haya algo.
 *  - Si el backend la rechaza al enviarla (ej.: otro ya cerró esa
 *    reparación), queda en "Cargas con problema" con el motivo.
 *  - Lo del admin (máquinas, usuarios, precios, pagos…) no pasa por
 *    acá: necesita señal.
 * ============================================================
 */
import { llamarServidor, ErrorApi, nuevoId, sesionGuardada } from './api.js';
import { COLA, guardar, leer, todos, borrar } from './almacen.js';
import { estado } from './estado.js';

const nombreMaquina = (id) => {
  const m = estado.datos && estado.datos.maquinas ? estado.datos.maquinas.find(x => x.id_maquina === id) : null;
  return m ? m.nombre : 'máquina';
};

/** Acciones que pasan por la cola, con el texto que se muestra en "pendientes". */
export const ACCIONES_COLA = {
  cargarFalla: (d) => '⚠️ Falla · ' + nombreMaquina(d.id_maquina),
  iniciarReparacion: (d) => '🔧 Empezar reparación · ' + nombreMaquina(d.id_maquina),
  pedirRepuestos: (d) => '🛒 Pedido de repuestos · ' + nombreMaquina(d.id_maquina),
  cerrarReparacion: (d) => '✅ Cerrar reparación · ' + nombreMaquina(d.id_maquina),
  pedirTrabajo: (d) => '🛠️ Pedido de trabajo' + (d.id_maquina ? ' · ' + nombreMaquina(d.id_maquina) : d.lugar ? ' · ' + d.lugar : ''),
  empezarTrabajo: () => '🛠️ Empezar trabajo',
  pedirRepuestosTrabajo: () => '🛒 Repuestos para un trabajo',
  terminarTrabajo: () => '✅ Terminar trabajo',
  empezarPreventivo: () => '🔵 Empezar preventivo',
  terminarPreventivo: () => '✅ Terminar preventivo',
  posponerPreventivo: () => '📅 Posponer preventivo',
  cargarTotalDiario: () => '💰 Total del día'
};

export const MENSAJE_ENCOLADA = '📵 Sin señal: quedó guardado en el celular y se envía solo cuando vuelva la conexión.';
const MENSAJE_REINTENTO = 'No se pudo enviar ahora: quedó guardado en el celular y se reintenta solo.';
const MAX_INTENTOS_ERROR_INTERNO = 3;

const resultados = new Map(); // id_cliente → respuesta del backend (para devolverla a la pantalla)
const enPantalla = new Set(); // cargas cuya respuesta la persona está esperando en el formulario
let enCurso = null;

function usuarioActual() {
  const s = sesionGuardada();
  return s ? s.usuario : null;
}

function avisarCambio() {
  window.dispatchEvent(new CustomEvent('cola-cambio'));
}

/** Cargas de la cola del usuario actual (más vieja primero). */
export async function cargasDelUsuario() {
  const u = usuarioActual();
  if (!u) return [];
  return (await todos(COLA)).filter(x => x.id_usuario === u.id_usuario).sort((a, b) => a.creado - b.creado);
}

/** Solo las que todavía esperan ser enviadas. */
export async function pendientes() {
  return (await cargasDelUsuario()).filter(x => x.estado === 'pendiente');
}

/** Cantidades para la barra de aviso: { pendientes, problemas } */
export async function contar() {
  const lista = await cargasDelUsuario();
  return {
    pendientes: lista.filter(x => x.estado === 'pendiente').length,
    problemas: lista.filter(x => x.estado === 'error').length
  };
}

/** Descarta una carga con problema (la decide quien la cargó). */
export async function descartar(idCliente) {
  await borrar(COLA, idCliente);
  avisarCambio();
}

/**
 * Guarda la carga y trata de enviarla.
 *  - Si se envió: devuelve la respuesta del backend (como antes).
 *  - Si el backend la rechazó en el momento: la saca de la cola y lanza el error
 *    (la persona sigue en el formulario y la corrige).
 *  - Si no hay señal: devuelve { encolada: true, mensaje }.
 */
export async function encolar(accion, datos) {
  const u = usuarioActual();
  if (!u) throw new ErrorApi('SIN_SESION', 'Ingresá de nuevo.');
  const item = {
    id_cliente: nuevoId(), accion, datos, momento: new Date().toISOString(),
    id_usuario: u.id_usuario, estado: 'pendiente', creado: Date.now(), intentos: 0,
    descripcion: (ACCIONES_COLA[accion] || (() => accion))(datos || {}), codigo: '', error: ''
  };
  await guardar(COLA, item);
  avisarCambio();
  enPantalla.add(item.id_cliente);
  try { await procesar(); } finally { enPantalla.delete(item.id_cliente); }

  const despues = await leer(COLA, item.id_cliente);
  if (!despues) {
    const r = resultados.get(item.id_cliente) || {};
    resultados.delete(item.id_cliente);
    return r;
  }
  if (despues.estado === 'error' && despues.rechazo_inmediato) {
    await borrar(COLA, item.id_cliente);
    avisarCambio();
    throw new ErrorApi(despues.codigo, despues.error);
  }
  // intentos === 0: ni se intentó, porque espera detrás de otras que esperan señal
  const sinSenal = navigator.onLine === false || despues.sin_conexion || despues.intentos === 0;
  return { encolada: true, mensaje: sinSenal ? MENSAJE_ENCOLADA : MENSAJE_REINTENTO };
}

/** Envía en orden todo lo pendiente (una sola vez a la vez). */
export function procesar() {
  if (!enCurso) enCurso = procesarAhora().finally(() => { enCurso = null; });
  return enCurso;
}

async function procesarAhora() {
  let enviadas = 0;
  for (;;) {
    const lista = await pendientes();
    if (!lista.length) break;
    const it = lista[0];
    // ¿La persona está esperando esta respuesta en pantalla? Si no, es una carga guardada (diferida)
    const enPrimerPlano = enPantalla.has(it.id_cliente);
    try {
      const r = await llamarServidor(it.accion, it.datos, { id_cliente: it.id_cliente, momento: it.momento, diferida: !enPrimerPlano });
      resultados.set(it.id_cliente, r);
      await borrar(COLA, it.id_cliente);
      if (!enPrimerPlano) enviadas++; // solo las que habían quedado guardadas
      avisarCambio();
    } catch (e) {
      const codigo = (e && e.codigo) || 'ERROR_INTERNO';
      const reintentar = codigo === 'SIN_CONEXION' || codigo === 'OCUPADO' || codigo === 'SIN_SESION' ||
        (codigo === 'ERROR_INTERNO' && it.intentos < MAX_INTENTOS_ERROR_INTERNO);
      if (reintentar) {
        it.intentos++;
        it.sin_conexion = codigo === 'SIN_CONEXION';
        await guardar(COLA, it);
        break; // se sigue después (respetando el orden)
      }
      // Rechazada por el backend: queda en "Cargas con problema" y se sigue con la próxima
      it.rechazo_inmediato = enPrimerPlano;
      it.estado = 'error';
      it.codigo = codigo;
      it.error = (e && e.message) || 'No se pudo cargar.';
      it.fecha_error = Date.now();
      await guardar(COLA, it);
      avisarCambio();
    }
  }
  if (enviadas) window.dispatchEvent(new CustomEvent('cola-enviada', { detail: enviadas }));
}

/** Reintentos automáticos (se llama una vez al arrancar la app). */
export function iniciarCola() {
  window.addEventListener('online', () => procesar());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') procesar(); });
  setInterval(async () => {
    if ((await pendientes()).length) procesar();
  }, 30000);
  procesar();
}
