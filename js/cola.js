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
 *  - Con señal también: la carga se confirma AL INSTANTE en pantalla y se
 *    envía por detrás (así la app se siente instantánea).
 *  - Se reintenta sola: al volver la señal (evento "online"), al abrir
 *    la app, al volver a la app y cada 30 segundos mientras haya algo.
 *  - Si el backend la rechaza al enviarla (ej.: otro ya cerró esa
 *    reparación), queda en "Cargas con problema" con el motivo.
 *  - Lo del admin (máquinas, usuarios, precios, pagos…) no pasa por
 *    acá: necesita señal.
 * ============================================================
 */
import { llamarServidor, ErrorApi, nuevoId, sesionGuardada } from './api.js';
import { COLA, guardar, todos, borrar } from './almacen.js';
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
  cargarTotalDiario: () => '💰 Total del día',
  cargarTrabajoElectrico: (d) => '⚡ Trabajo eléctrico · ' + (d.id_maquina ? nombreMaquina(d.id_maquina) : (d.sector || '') + (d.lugar ? ' · ' + d.lugar : ''))
};

export const MENSAJE_ENCOLADA = '📵 Sin señal: quedó guardado en el celular y se envía solo cuando vuelva la conexión.';
const MENSAJE_LISTO = '✅ Listo. Se está enviando…';
const MAX_INTENTOS_ERROR_INTERNO = 3;
const GUARDAR_ENVIADAS_MS = 10 * 60000; // las enviadas se recuerdan 10 min (hasta que las pantallas se actualicen)
const DEMORA_FRANJA_MS = 8000;          // con señal, la franja "sin enviar" aparece recién si tarda más de esto

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

/**
 * Cargas que hay que sumar a unos datos traídos del servidor en "fechaDatos":
 * las que esperan y las que se enviaron después (todavía no figuraban en esos datos).
 */
export async function cargasParaAjustar(fechaDatos) {
  return (await cargasDelUsuario()).filter(x => x.estado === 'pendiente' || (x.estado === 'enviada' && x.enviada_en > fechaDatos));
}

/** Cantidades para la barra de aviso: { pendientes, problemas } */
export async function contar() {
  const lista = await cargasDelUsuario();
  const ahora = Date.now();
  return {
    // con señal, lo que se está enviando en el momento no se cuenta (tarda 1 o 2 segundos)
    pendientes: lista.filter(x => x.estado === 'pendiente' && (x.sin_conexion || navigator.onLine === false || ahora - x.creado > DEMORA_FRANJA_MS)).length,
    problemas: lista.filter(x => x.estado === 'error').length
  };
}

/** Descarta una carga con problema (la decide quien la cargó). */
export async function descartar(idCliente) {
  await borrar(COLA, idCliente);
  avisarCambio();
}

/**
 * Guarda la carga y responde AL INSTANTE (decidido con Juan: que la app se sienta instantánea).
 * Se envía por detrás, en orden. Cuando llega, la app muestra la respuesta del sistema
 * ("carga-enviada"); si el sistema la rechaza, queda en "Cargas con problema" ("carga-rechazada").
 * Devuelve { encolada: true, mensaje }.
 */
export async function encolar(accion, datos) {
  const u = usuarioActual();
  if (!u) throw new ErrorApi('SIN_SESION', 'Ingresá de nuevo.');
  const item = {
    id_cliente: nuevoId(), accion, datos, momento: new Date().toISOString(),
    id_usuario: u.id_usuario, estado: 'pendiente', creado: Date.now(), intentos: 0,
    descripcion: (ACCIONES_COLA[accion] || (() => accion))(datos || {}), codigo: '', error: ''
  };
  const sinSenal = navigator.onLine === false || (await pendientes()).some(x => x.sin_conexion);
  item.guardada_sin_senal = sinSenal; // al llegar se avisa junto con las demás guardadas
  await guardar(COLA, item);
  avisarCambio();
  procesar(); // por detrás: no se espera
  return { encolada: true, mensaje: sinSenal ? MENSAJE_ENCOLADA : MENSAJE_LISTO };
}

/** Envía en orden todo lo pendiente (una sola vez a la vez). */
export function procesar() {
  if (!enCurso) enCurso = procesarAhora().finally(() => { enCurso = null; });
  return enCurso;
}

async function procesarAhora() {
  // Se olvidan las enviadas hace rato (las pantallas ya se actualizaron con el servidor)
  for (const x of await cargasDelUsuario()) {
    if (x.estado === 'enviada' && Date.now() - x.enviada_en > GUARDAR_ENVIADAS_MS) await borrar(COLA, x.id_cliente);
  }
  let total = 0, guardadas = 0;
  for (;;) {
    const lista = await pendientes();
    if (!lista.length) break;
    const it = lista[0];
    try {
      // "diferida": se envía por detrás; si el sistema la rechaza, queda en el Log
      const r = await llamarServidor(it.accion, it.datos, { id_cliente: it.id_cliente, momento: it.momento, diferida: true });
      const habiaQuedadoGuardada = it.intentos > 0 || it.guardada_sin_senal;
      it.estado = 'enviada';
      it.enviada_en = Date.now();
      it.datos = { id_maquina: (it.datos || {}).id_maquina, id_trabajo: (it.datos || {}).id_trabajo, id_tarea: (it.datos || {}).id_tarea,
        prioridad: (it.datos || {}).prioridad, tipo_falla: (it.datos || {}).tipo_falla, descripcion: (it.datos || {}).descripcion,
        nueva_fecha: (it.datos || {}).nueva_fecha, lugar: (it.datos || {}).lugar, items: (it.datos || {}).items,
        sector: (it.datos || {}).sector, categoria: (it.datos || {}).categoria }; // sin fotos ni valores: ya no hacen falta
      await guardar(COLA, it);
      total++;
      if (habiaQuedadoGuardada) guardadas++;
      else window.dispatchEvent(new CustomEvent('carga-enviada', { detail: { mensaje: r && r.mensaje ? r.mensaje : '' } }));
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
      // Rechazada por el sistema: queda en "Cargas con problema" y se sigue con la próxima
      it.estado = 'error';
      it.codigo = codigo;
      it.error = (e && e.message) || 'No se pudo cargar.';
      it.fecha_error = Date.now();
      await guardar(COLA, it);
      window.dispatchEvent(new CustomEvent('carga-rechazada', { detail: { descripcion: it.descripcion, error: it.error } }));
      avisarCambio();
    }
  }
  if (total) window.dispatchEvent(new CustomEvent('cola-enviada', { detail: { total, guardadas } }));
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
