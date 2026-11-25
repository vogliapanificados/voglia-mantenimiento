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
import { ACCIONES_COLA, encolar, pendientes } from './cola.js';
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
  'listarFallas', 'listarTrabajos', 'detalleTrabajo', 'listarPreventivos', 'detallePreventivo', 'listarStock'
]);
/** Pagos y costos nunca se guardan en el celular (decidido con Juan). */
const CLAVES_PRIVADAS = /costo|precio|monto|pago|mano_obra|proveedor/i;

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

/** Lo que espera en la cola del usuario (vacío si algo falla: nunca bloquea una pantalla). */
async function colaActual() {
  try { return await pendientes(); } catch (e) { return []; }
}

/**
 * Llama a una acción del backend y devuelve sus datos.
 * Las lecturas de pantallas se guardan; sin señal se devuelve lo guardado.
 * En los dos casos se suma lo que todavía espera en la cola.
 */
export async function llamar(accion, datos = {}, opciones = {}) {
  if (opciones.carga || !LECTURAS_GUARDABLES.has(accion)) return llamarServidor(accion, datos, opciones);
  const clave = claveLectura(accion, datos);
  let resultado;
  try {
    resultado = await llamarServidor(accion, datos);
    guardarAlm(LECTURAS, { clave, fecha: Date.now(), datos: sinPrivados(resultado) }).catch(() => {});
    if (accion === 'inicio') precargarDetalles(resultado);
  } catch (e) {
    if (e.codigo !== 'SIN_CONEXION') throw e;
    const guardada = await leerAlm(LECTURAS, clave).catch(() => null);
    if (guardada) {
      resultado = guardada.datos;
      avisarConexion(true, guardada.fecha);
    } else if (accion === 'detalleMaquina') {
      // Ficha nunca abierta con señal: se arma con la lista de máquinas guardada
      const ini = await leerAlm(LECTURAS, claveLectura('datosIniciales', {})).catch(() => null);
      resultado = ini ? fichaDesdeDatos(datos.id_maquina, ini.datos) : null;
      if (!resultado) throw e;
      avisarConexion(true, ini.fecha);
    } else {
      throw new ErrorApi('SIN_CONEXION', 'Sin conexión, y esta pantalla todavía no se había abierto con señal en este celular.');
    }
  }
  return ajustarConCola(accion, datos, resultado, await colaActual());
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
  return llamarServidor(accion, datos, { carga: true });
}
