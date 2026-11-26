/**
 * ============================================================
 *  Voglia Mantenimiento — api.js
 *  Comunicación con el backend (Apps Script).
 *
 *  - Un único endpoint: POST con Content-Type text/plain (evita
 *    el "preflight" de CORS que Apps Script no soporta).
 *  - Cuerpo: { accion, token, datos, id_cliente, momento }
 *  - Respuesta: { ok: true, datos } o { ok: false, codigo, error }
 *  - Las cargas (escrituras) llevan un id_cliente (UUID) y el
 *    momento real en el celular, para que un reintento no
 *    duplique nada. Las cargas de planta pasan por la cola sin
 *    señal (cola.js).
 *  - Las lecturas de las pantallas se guardan en el celular
 *    (sin pagos ni costos): sin señal se muestra lo último que
 *    se vio, ajustado con lo que espera en la cola.
 * ============================================================
 */
import { API_URL } from './config.js';
import { LECTURAS, guardar as guardarAlm, leer as leerAlm } from './almacen.js';
import { ACCIONES_COLA, encolar, cargasParaAjustar } from './cola.js';
import { ajustarConCola, fichaDesdeDatos } from './ajustes-cola.js';

const CLAVE_SESION = 'voglia_sesion';
const ESPERA_MAXIMA_MS = 45000;

/** Error con código del backend (SIN_SESION, VALIDACION, SIN_CONEXION, etc.) */
export class ErrorApi extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// ---------- Sesión guardada en el celular ----------

export function sesionGuardada() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null');
    if (s && s.token && new Date(s.vence).getTime() > Date.now()) return s;
  } catch (e) { /* sesión corrupta: se ignora */ }
  return null;
}

export function guardarSesion(s) {
  localStorage.setItem(CLAVE_SESION, JSON.stringify({ token: s.token, vence: s.vence, usuario: s.usuario }));
}

export function borrarSesion() {
  localStorage.removeItem(CLAVE_SESION);
}

// ---------- UUID para id_cliente ----------

export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Respaldo para navegadores viejos
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- Llamada al backend ----------

/**
 * Envía un pedido al backend y devuelve sus datos (sin cola ni datos guardados).
 * opciones.carga = true → agrega id_cliente y momento (escrituras).
 * opciones.id_cliente / opciones.momento → para reintentar una carga ya armada.
 * opciones.diferida = true → la carga venía de la cola (si se rechaza, queda en el Log).
 * Si falla, lanza ErrorApi.
 */
export async function llamarServidor(accion, datos = {}, opciones = {}) {
  const sesion = sesionGuardada();
  const pedido = { accion, datos, token: sesion ? sesion.token : '' };
  if (opciones.carga || opciones.id_cliente) {
    pedido.id_cliente = opciones.id_cliente || nuevoId();
    pedido.momento = opciones.momento || new Date().toISOString();
  }
  if (opciones.diferida) pedido.diferida = true;

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);
  let respuesta;
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(pedido),
      signal: control.signal,
      redirect: 'follow'
    });
    respuesta = await r.json();
  } catch (e) {
    avisarConexion(true, null); // la app se entera de que no hay señal
    throw new ErrorApi('SIN_CONEXION', navigator.onLine === false
      ? 'No hay conexión. Probá de nuevo cuando vuelva la señal.'
      : 'No se pudo conectar con el servidor. Probá de nuevo.');
  } finally {
    clearTimeout(temporizador);
  }

  if (!respuesta || respuesta.ok !== true) {
    const codigo = (respuesta && respuesta.codigo) || 'ERROR_INTERNO';
    const mensaje = (respuesta && respuesta.error) || 'Ocurrió un error. Probá de nuevo.';
    if (codigo === 'SIN_SESION') {
      borrarSesion();
      window.dispatchEvent(new CustomEvent('sesion-vencida', { detail: mensaje }));
    }
    throw new ErrorApi(codigo, mensaje);
  }
  avisarConexion(false);
  return respuesta.datos;
}

// ---------- Lecturas guardadas en el celular (para ver sin señal) ----------

/** Pantallas que se pueden ver sin señal (lo último que se vio). */
const LECTURAS_GUARDABLES = new Set([
  'datosIniciales', 'inicio', 'misTareas', 'listarMaquinas', 'detalleMaquina', 'historialMaquina',
  'listarFallas', 'listarTrabajos', 'detalleTrabajo', 'listarPreventivos', 'detallePreventivo', 'listarStock',
  'misTrabajosElectricos'
]);
/** Pagos y costos nunca se guardan en el celular (decidido con Juan). */
const CLAVES_PRIVADAS = /costo|precio|monto|pago|mano_obra|proveedor|valor/i; // valor: trabajos del electricista

function sinPrivados(x) {
  if (Array.isArray(x)) return x.map(sinPrivados);
  if (x && typeof x === 'object') {
    const r = {};
    Object.keys(x).forEach((k) => { if (!CLAVES_PRIVADAS.test(k)) r[k] = sinPrivados(x[k]); });
    return r;
  }
  return x;
}

const claveLectura = (accion, datos) => {
  const s = sesionGuardada();
  return (s ? s.usuario.id_usuario : '-') + '|' + accion + '|' + JSON.stringify(datos || {});
};

/** Avisa a la app si se está mostrando información guardada (sin conexión). */
function avisarConexion(sinConexion, desde) {
  window.dispatchEvent(new CustomEvent('conexion', { detail: { sinConexion, desde: desde || null } }));
}

/**
 * Cargas de la cola que todavía no figuran en unos datos traídos en "fechaDatos"
 * (las que esperan y las enviadas después de esa fecha). Vacío si algo falla: nunca bloquea una pantalla.
 */
async function colaPara(fechaDatos) {
  try { return await cargasParaAjustar(fechaDatos); } catch (e) { return []; }
}

// ---------- Pantallas al instante ----------
// Si hay datos guardados, la pantalla se dibuja YA con ellos y por detrás se piden al
// servidor; si llegan distintos, se avisa ("datos-nuevos") y la app redibuja sola.
const FRESCOS_MS = 15000;     // datos de hace menos de 15 s no se vuelven a pedir
const enMemoria = new Map();  // clave → { fecha, datos } completos (con costos para el admin; solo en memoria)
const enCamino = new Map();   // clave → pedido al servidor en curso

async function datosGuardados(clave) {
  if (enMemoria.has(clave)) return enMemoria.get(clave);
  return leerAlm(LECTURAS, clave).catch(() => null);
}

/** Pide al servidor, guarda (en memoria completo; en el celular sin pagos ni costos) y devuelve. */
function traerYGuardar(accion, datos, clave) {
  if (enCamino.has(clave)) return enCamino.get(clave);
  const fecha = Date.now();
  avisarActualizando(+1);
  const p = llamarServidor(accion, datos).then((r) => {
    enMemoria.set(clave, { fecha, datos: r });
    guardarAlm(LECTURAS, { clave, fecha, datos: sinPrivados(r) }).catch(() => {});
    if (accion === 'inicio') precargarDetalles(r);
    return { fecha, datos: r };
  }).finally(() => { enCamino.delete(clave); avisarActualizando(-1); });
  enCamino.set(clave, p);
  return p;
}

let actualizando = 0;
function avisarActualizando(delta) {
  actualizando = Math.max(0, actualizando + delta);
  window.dispatchEvent(new CustomEvent('actualizando', { detail: actualizando > 0 }));
}

/**
 * Llama a una acción del backend y devuelve sus datos.
 * Lecturas de pantallas: al instante con lo guardado (y se actualizan por detrás);
 * la primera vez, o con opciones.fresco, espera al servidor. Sin señal, lo guardado.
 * Siempre se suma lo que todavía no llegó a la planilla desde la cola.
 */
export async function llamar(accion, datos = {}, opciones = {}) {
  if (opciones.carga || !LECTURAS_GUARDABLES.has(accion)) return llamarServidor(accion, datos, opciones);
  const clave = claveLectura(accion, datos);
  let guardada = opciones.fresco ? null : await datosGuardados(clave);
  // Después de un cambio que no pasa por la cola (cosas del admin, editar un trabajo),
  // lo guardado de antes no sirve: se espera al servidor.
  if (guardada && guardada.fecha < frescoDesde && navigator.onLine !== false) guardada = null;

  if (guardada) {
    if (navigator.onLine === false) {
      avisarConexion(true, guardada.fecha); // sin señal: se muestra de cuándo son los datos
    } else if (Date.now() - guardada.fecha > FRESCOS_MS || guardada.fecha < viejasDesde) {
      const mostrado = JSON.stringify(guardada.datos);
      traerYGuardar(accion, datos, clave).then((r) => {
        avisarConexion(false);
        if (JSON.stringify(r.datos) !== mostrado) window.dispatchEvent(new CustomEvent('datos-nuevos', { detail: { accion } }));
      }).catch((e) => {
        if (e.codigo === 'SIN_CONEXION') avisarConexion(true, guardada.fecha);
      });
    }
    return ajustarConCola(accion, datos, guardada.datos, await colaPara(guardada.fecha));
  }

  try {
    const r = await traerYGuardar(accion, datos, clave);
    return ajustarConCola(accion, datos, r.datos, await colaPara(r.fecha));
  } catch (e) {
    if (e.codigo !== 'SIN_CONEXION') throw e;
    if (accion === 'detalleMaquina') {
      // Ficha nunca abierta con señal: se arma con la lista de máquinas guardada
      const ini = await datosGuardados(claveLectura('datosIniciales', {}));
      const ficha = ini ? fichaDesdeDatos(datos.id_maquina, ini.datos) : null;
      if (!ficha) throw e;
      avisarConexion(true, ini.fecha);
      return ajustarConCola(accion, datos, ficha, await colaPara(ini.fecha));
    }
    throw new ErrorApi('SIN_CONEXION', 'Sin conexión, y esta pantalla todavía no se había abierto con señal en este celular.');
  }
}

/** Al cerrar sesión: olvida lo guardado en memoria. */
export function olvidarLecturas() {
  enMemoria.clear();
}

/** Después de que llega una carga a la planilla: lo guardado hasta ahora se vuelve a pedir. */
let viejasDesde = 0;
export function marcarLecturasViejas() {
  viejasDesde = Date.now();
}

/**
 * Con señal, guarda de a poco las fichas de lo que el mecánico (o Juan) tiene para hacer,
 * para poder abrirlas sin señal. Como mucho una vez cada 15 minutos.
 */
let ultimaPrecarga = 0;
function precargarDetalles(inicio) {
  if (!inicio || !inicio.tareas || Date.now() - ultimaPrecarga < 15 * 60000) return;
  ultimaPrecarga = Date.now();
  const pedidos = [];
  (inicio.tareas.tareas || []).concat(inicio.tareas.proximos || []).slice(0, 15).forEach((t) => {
    if (t.tipo === 'falla') pedidos.push(['detalleMaquina', { id_maquina: t.id_maquina }]);
    if (t.tipo === 'trabajo') pedidos.push(['detalleTrabajo', { id_trabajo: t.id_trabajo }]);
    if (t.tipo === 'preventivo') pedidos.push(['detallePreventivo', { id_tarea: t.id_tarea }]);
  });
  (async () => {
    for (const [accion, datos] of pedidos) {
      try {
        const r = await llamarServidor(accion, datos);
        await guardarAlm(LECTURAS, { clave: claveLectura(accion, datos), fecha: Date.now(), datos: sinPrivados(r) });
      } catch (e) {
        if (e.codigo === 'SIN_CONEXION') return;
      }
    }
  })();
}

/**
 * Cargas (escrituras que no se deben duplicar).
 * Las de planta pasan por la cola: sin señal quedan guardadas y devuelven
 * { encolada: true, mensaje }. Las demás (cosas del admin) necesitan señal.
 */
export function cargar(accion, datos) {
  if (ACCIONES_COLA[accion]) return encolar(accion, datos);
  return llamarServidor(accion, datos, { carga: true }).then((r) => {
    frescoDesde = Date.now(); // lo que se lea después tiene que incluir este cambio
    return r;
  });
}
let frescoDesde = 0;
