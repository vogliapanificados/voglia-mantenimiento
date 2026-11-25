/**
 * ============================================================
 *  Voglia Mantenimiento — app.js
 *  Arranque, navegación entre pantallas (#/ruta) y menú.
 *
 *  Organización (aprobada por Juan):
 *   🏠 Inicio (distinto por rol) · 🏭 Planta · 📋 Registro
 *   · 💰 Mi día (mecánico) · 📊 Indicadores (admin) · ⚙️ Más (admin)
 *   · 👤 Yo (encargado y mecánico). Mismo orden para todos.
 * ============================================================
 */
import { h, poner, cargando, aviso } from './ui.js';
import { estado, es, iniciarDesdeSesion, invalidarDatos } from './estado.js';
import { MODO_PRUEBA } from './config.js';
import { iniciarCola, contar } from './cola.js';
import { cartelInstalar } from './instalar.js';
import { pantallaPendientes } from './pantallas/pendientes.js';

import { pantallaIngreso } from './pantallas/ingreso.js';
import { pantallaInicio } from './pantallas/inicio.js';
import { pantallaReportar } from './pantallas/reportar.js';
import { pantallaRegistro } from './pantallas/registro.js';
import { pantallaMaquinas, pantallaMaquina } from './pantallas/maquinas.js';
import { pantallaPlanta } from './pantallas/planta.js';
import { pantallaFalla } from './pantallas/falla.js';
import { pantallaPedido, pantallaCierre, pantallaCierreExterna } from './pantallas/reparacion.js';
import { pantallaHistorial } from './pantallas/historial.js';
import { pantallaTotal } from './pantallas/total.js';
import { pantallaCuenta } from './pantallas/cuenta.js';
import { pantallaIndicadores } from './pantallas/indicadores.js';
import { pantallaTrabajo, pantallaPedirTrabajo, pantallaPedidoTrabajo, pantallaTerminarTrabajo } from './pantallas/trabajos.js';
import { pantallaPreventivo, pantallaTerminarPreventivo, pantallaPlanPreventivo } from './pantallas/preventivo.js';
import { pantallaRepuestos } from './pantallas/repuestos.js';
import {
  pantallaAdmin, pantallaPagos, pantallaUsuarios, pantallaAdminMaquinas, pantallaListas,
  pantallaServices, pantallaProveedores, pantallaAvisos
} from './pantallas/admin.js';

const TODOS = ['admin', 'encargado', 'mecanico'];
const ADMIN = ['admin'];
const ADMIN_MEC = ['admin', 'mecanico'];
const PIDEN = ['admin', 'encargado'];

/**
 * Rutas: patrón → pantalla.
 *  roles: quién puede entrar (el backend igual controla cada acción)
 *  menu: qué ícono del menú inferior queda marcado
 *  volver: a dónde lleva la flecha "‹". 'atras' = a la pantalla de la que vino
 *          (sin volver a un formulario ya enviado).
 *  form: es un formulario (al volver "atrás" se saltea).
 */
const RUTAS = [
  { patron: /^inicio$/, titulo: 'Inicio', fn: pantallaInicio, roles: TODOS, menu: 'inicio' },
  { patron: /^reportar$/, titulo: 'Reportar una falla', fn: pantallaReportar, roles: TODOS, menu: 'inicio', volver: 'atras', form: true },

  { patron: /^planta$/, titulo: 'Planta', fn: pantallaPlanta, roles: TODOS, menu: 'planta' },
  { patron: /^maquinas$/, titulo: 'Máquinas', fn: pantallaMaquinas, roles: TODOS, menu: 'planta', volver: 'planta' },
  { patron: /^maquina\/([\w-]+)$/, titulo: 'Máquina', fn: pantallaMaquina, roles: TODOS, menu: 'planta', volver: 'atras' },
  { patron: /^historial\/([\w-]+)$/, titulo: 'Historial', fn: pantallaHistorial, roles: TODOS, menu: 'planta', volver: 'atras' },
  { patron: /^falla\/([\w-]+)$/, titulo: 'Cargar falla', fn: pantallaFalla, roles: TODOS, menu: 'inicio', volver: 'atras', form: true },
  { patron: /^pedido\/([\w-]+)$/, titulo: 'Pedir repuestos', fn: pantallaPedido, roles: ADMIN_MEC, menu: 'inicio', volver: 'atras', form: true },
  { patron: /^cierre\/([\w-]+)$/, titulo: 'Cerrar reparación', fn: pantallaCierre, roles: ADMIN_MEC, menu: 'inicio', volver: 'atras', form: true },
  { patron: /^cierre-externa\/([\w-]+)$/, titulo: 'Visita del service', fn: pantallaCierreExterna, roles: ADMIN, menu: 'inicio', volver: 'atras', form: true },

  { patron: /^registro$/, titulo: 'Registro', fn: pantallaRegistro, roles: TODOS, menu: 'registro' },
  { patron: /^preventivo\/([\w-]+)$/, titulo: 'Preventivo', fn: pantallaPreventivo, roles: ADMIN_MEC, menu: 'registro', volver: 'atras' },
  { patron: /^terminar-preventivo\/([\w-]+)$/, titulo: 'Terminar preventivo', fn: pantallaTerminarPreventivo, roles: ADMIN_MEC, menu: 'inicio', volver: 'atras', form: true },
  { patron: /^registro\/(fallas|trabajos|preventivos|stock|services)$/, titulo: 'Registro', fn: pantallaRegistro, roles: TODOS, menu: 'registro' },
  { patron: /^trabajo\/([\w-]+)$/, titulo: 'Trabajo', fn: pantallaTrabajo, roles: TODOS, menu: 'registro', volver: 'atras' },
  { patron: /^pedir-trabajo$/, titulo: 'Pedir un trabajo', fn: pantallaPedirTrabajo, roles: PIDEN, menu: 'inicio', volver: 'atras', form: true },
  { patron: /^pedir-trabajo\/([\w-]+)$/, titulo: 'Pedir un trabajo', fn: pantallaPedirTrabajo, roles: PIDEN, menu: 'inicio', volver: 'atras', form: true },
  { patron: /^pedido-trabajo\/([\w-]+)$/, titulo: 'Pedir repuestos', fn: pantallaPedidoTrabajo, roles: ADMIN_MEC, menu: 'inicio', volver: 'atras', form: true },
  { patron: /^terminar-trabajo\/([\w-]+)$/, titulo: 'Terminar trabajo', fn: pantallaTerminarTrabajo, roles: ADMIN_MEC, menu: 'inicio', volver: 'atras', form: true },

  { patron: /^total$/, titulo: 'Mi día', fn: pantallaTotal, roles: ['mecanico'], menu: 'total' },
  { patron: /^tablero$/, titulo: 'Indicadores', fn: pantallaIndicadores, roles: ADMIN, menu: 'tablero' },
  { patron: /^cuenta$/, titulo: 'Mi cuenta', fn: pantallaCuenta, roles: TODOS, menu: 'cuenta', volverAdmin: 'mas' },
  { patron: /^pendientes$/, titulo: 'Cargas guardadas', fn: pantallaPendientes, roles: TODOS, menu: 'inicio', volver: 'atras' },

  { patron: /^mas$/, titulo: 'Más', fn: pantallaAdmin, roles: ADMIN, menu: 'mas' },
  { patron: /^admin\/pagos$/, titulo: 'Pagos al mecánico', fn: pantallaPagos, roles: ADMIN, menu: 'mas', volver: 'atras' },
  { patron: /^admin\/usuarios$/, titulo: 'Usuarios', fn: pantallaUsuarios, roles: ADMIN, menu: 'mas', volver: 'mas' },
  { patron: /^admin\/maquinas$/, titulo: 'Máquinas (alta y baja)', fn: pantallaAdminMaquinas, roles: ADMIN, menu: 'mas', volver: 'mas' },
  { patron: /^admin\/preventivo$/, titulo: 'Plan preventivo', fn: pantallaPlanPreventivo, roles: ADMIN, menu: 'mas', volver: 'atras' },
  { patron: /^admin\/repuestos$/, titulo: 'Repuestos y stock', fn: pantallaRepuestos, roles: ADMIN, menu: 'mas', volver: 'mas' },
  { patron: /^admin\/repuestos\/(pedidos|stock|usados|catalogo|sugeridos)$/, titulo: 'Repuestos y stock', fn: pantallaRepuestos, roles: ADMIN, menu: 'mas', volver: 'mas' },
  { patron: /^admin\/listas$/, titulo: 'Listas', fn: pantallaListas, roles: ADMIN, menu: 'mas', volver: 'mas' },
  { patron: /^admin\/services$/, titulo: 'Services técnicos', fn: pantallaServices, roles: ADMIN, menu: 'mas', volver: 'mas' },
  { patron: /^admin\/proveedores$/, titulo: 'Proveedores', fn: pantallaProveedores, roles: ADMIN, menu: 'mas', volver: 'mas' },
  { patron: /^admin\/avisos$/, titulo: 'Avisos automáticos', fn: pantallaAvisos, roles: ADMIN, menu: 'mas', volver: 'mas' }
];

/** Direcciones viejas → nuevas (por si quedó algún enlace guardado). */
const REDIRECCIONES = {
  'tareas': 'inicio', 'fallas': 'registro/fallas', 'trabajos': 'registro/trabajos',
  'admin': 'mas', 'admin/visitas': 'registro/services'
};

/** Pantalla de inicio (la misma ruta para todos: cada rol ve su Inicio). */
export function rutaInicio() {
  return 'inicio';
}

/** Menú inferior: mismo orden para todos; cada rol ve lo suyo. */
function itemsMenu() {
  const items = [
    { clave: 'inicio', icono: '🏠', texto: 'Inicio' },
    { clave: 'planta', icono: '🏭', texto: 'Planta' },
    { clave: 'registro', icono: '📋', texto: 'Registro' }
  ];
  if (es('mecanico')) items.push({ clave: 'total', icono: '💰', texto: 'Mi día' });
  if (es('admin')) {
    items.push({ clave: 'tablero', icono: '📊', texto: 'Indicadores' });
    items.push({ clave: 'mas', icono: '⚙️', texto: 'Más' });
  } else {
    items.push({ clave: 'cuenta', icono: '👤', texto: 'Yo' });
  }
  return items;
}

// ---------- Navegación ----------

const app = document.getElementById('app');
const barra = document.getElementById('barra');
const titulo = document.getElementById('titulo');
const btnVolver = document.getElementById('btn-volver');
const menu = document.getElementById('menu');

// Pantallas visitadas (para que "‹" vuelva a la anterior sin pasar por formularios ya enviados)
const pila = [];
let rutaVolver = null;

function anotarEnPila(ruta) {
  if (pila[pila.length - 1] === ruta) return;
  if (pila[pila.length - 2] === ruta) { pila.pop(); return; } // el usuario volvió con el botón del celular
  pila.push(ruta);
  if (pila.length > 40) pila.shift();
}

function esFormulario(ruta) {
  const def = RUTAS.find(r => r.patron.test(ruta));
  return !!(def && def.form);
}

/** Pantalla anterior a la actual que no sea un formulario. */
function pantallaAnterior() {
  for (let i = pila.length - 2; i >= 0; i--) {
    if (!esFormulario(pila[i]) && pila[i] !== pila[pila.length - 1]) return { ruta: pila[i], indice: i };
  }
  return null;
}

btnVolver.addEventListener('click', () => {
  if (!rutaVolver) return;
  if (rutaVolver === 'atras') {
    const ant = pantallaAnterior();
    if (ant) { pila.length = ant.indice; ir(ant.ruta); } else ir(rutaInicio());
    return;
  }
  ir(rutaVolver);
});

/** Navega a una ruta (sin el "#/"). */
export function ir(ruta) {
  const destino = '#/' + ruta;
  if (location.hash === destino) mostrar();
  else location.hash = destino;
}

/** Cambia el título de la barra (lo usan las pantallas cuando ya cargaron el nombre). */
export function ponerTitulo(texto) {
  titulo.textContent = texto;
  document.title = texto + ' · Voglia Mantenimiento';
}

let turno = 0; // evita que una pantalla vieja dibuje encima de una nueva

async function mostrar() {
  const miTurno = ++turno;
  document.getElementById('modal').classList.add('oculto');

  // Sin sesión → pantalla de ingreso
  if (!estado.usuario) {
    barra.classList.add('oculto');
    menu.classList.add('oculto');
    app.classList.add('sin-menu');
    pila.length = 0;
    poner(app, cargando());
    await pantallaIngreso(app, () => { location.hash = '#/' + rutaInicio(); mostrar(); });
    return;
  }

  let ruta = location.hash.replace(/^#\/?/, '') || rutaInicio();
  if (REDIRECCIONES[ruta]) { location.replace('#/' + REDIRECCIONES[ruta]); return; }
  let def = null, params = [];
  for (const r of RUTAS) {
    const m = ruta.match(r.patron);
    if (m) { def = r; params = m.slice(1); break; }
  }
  if (!def || !es(...def.roles)) { ir(rutaInicio()); return; }
  anotarEnPila(ruta);

  // Barra superior y menú
  barra.classList.remove('oculto');
  ponerTitulo(def.titulo);
  rutaVolver = def.volver || (es('admin') && def.volverAdmin) || null;
  btnVolver.classList.toggle('oculto', !rutaVolver);
  dibujarMenu(es('admin') && def.menu === 'cuenta' ? 'mas' : def.menu);
  app.classList.remove('sin-menu');
  window.scrollTo(0, 0);

  poner(app, cargando());
  try {
    const contenedor = h('div');
    await def.fn(contenedor, params);
    if (ruta === 'inicio') { const c = cartelInstalar(); if (c) contenedor.prepend(c); }
    if (miTurno === turno) poner(app, contenedor);
  } catch (e) {
    if (miTurno !== turno) return;
    if (e && e.codigo === 'SIN_SESION') return; // lo maneja el evento sesion-vencida
    poner(app,
      h('div', { class: 'vacio' },
        h('p', null, e && e.message ? e.message : 'No se pudo cargar la pantalla.'),
        h('button', { class: 'btn', onclick: () => mostrar() }, 'Reintentar'),
        h('button', { class: 'btn btn-secundario', onclick: () => ir(rutaInicio()) }, 'Ir al inicio')));
  }
}

function dibujarMenu(activo) {
  menu.classList.remove('oculto');
  poner(menu, itemsMenu().map(it =>
    h('a', { href: '#/' + it.clave, class: it.clave === activo ? 'activo' : '' },
      h('span', { class: 'icono' }, it.icono), h('span', null, it.texto))));
}

// ---------- Sesión vencida o cerrada ----------

window.addEventListener('sesion-vencida', (ev) => {
  estado.usuario = null;
  estado.datos = null;
  aviso(ev.detail || 'Tu sesión venció. Ingresá de nuevo.', 'error', 6);
  mostrar();
});

export function salir() {
  estado.usuario = null;
  estado.datos = null;
  location.hash = '#/inicio';
  mostrar();
}

// ---------- Franja de estado: sin conexión / cargas sin enviar / con problema ----------

const franja = document.getElementById('franja');
let mostrandoGuardado = null; // fecha de los datos guardados que se están viendo (o null)

async function dibujarFranja() {
  if (!estado.usuario) { franja.classList.add('oculto'); return; }
  let n = { pendientes: 0, problemas: 0 };
  try { n = await contar(); } catch (e) { /* sin almacenamiento: no se muestra nada */ }
  const sinRed = navigator.onLine === false || !!mostrandoGuardado;
  const partes = [];
  if (sinRed) {
    const hora = mostrandoGuardado ? new Date(mostrandoGuardado).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '';
    partes.push(h('span', { class: 'franja-item' }, '📵 Sin conexión' + (hora ? ' · datos del ' + hora : '')));
  }
  if (n.pendientes) partes.push(h('a', { href: '#/pendientes', class: 'franja-item' }, '⏳ ' + n.pendientes + (n.pendientes === 1 ? ' carga sin enviar' : ' cargas sin enviar')));
  if (n.problemas) partes.push(h('a', { href: '#/pendientes', class: 'franja-item franja-problema' }, '⚠️ ' + n.problemas + (n.problemas === 1 ? ' carga con problema' : ' cargas con problema')));
  franja.classList.toggle('oculto', !partes.length);
  franja.classList.toggle('franja-roja', !!n.problemas);
  poner(franja, partes);
}

window.addEventListener('conexion', (ev) => {
  mostrandoGuardado = ev.detail.sinConexion ? ev.detail.desde || Date.now() : null;
  dibujarFranja();
});
window.addEventListener('cola-cambio', dibujarFranja);
window.addEventListener('online', dibujarFranja);
window.addEventListener('offline', dibujarFranja);
// Cuando la cola termina de enviar, se actualiza lo que se está viendo
window.addEventListener('cola-enviada', (ev) => {
  invalidarDatos();
  aviso('✅ Se enviaron ' + ev.detail + (ev.detail === 1 ? ' carga guardada.' : ' cargas guardadas.'), 'ok', 5);
  if (!document.querySelector('#modal:not(.oculto)') && !esFormulario(location.hash.replace(/^#\/?/, ''))) mostrar();
});

// ---------- Service worker (abre la app sin señal) ----------

if ('serviceWorker' in navigator && !MODO_PRUEBA) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('No se pudo registrar el service worker', e));
  });
  // Cuando hay una versión nueva de la app, se recarga una sola vez para usarla
  // (si la persona está completando un formulario, espera a que salga de él)
  let versionNueva = false;
  const recargarSiSePuede = () => {
    if (versionNueva && !esFormulario(location.hash.replace(/^#\/?/, ''))) { versionNueva = false; location.reload(); }
  };
  const habiaVersion = !!navigator.serviceWorker.controller; // la primera instalación no recarga
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersion) return;
    versionNueva = true;
    recargarSiSePuede();
  });
  window.addEventListener('hashchange', recargarSiSePuede);
}

// ---------- Arranque ----------

window.addEventListener('hashchange', mostrar);
window.addEventListener('hashchange', dibujarFranja);
// Al volver a la app (por ejemplo, después de usar otra), el Inicio se actualiza solo
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado.usuario && (location.hash === '#/inicio' || location.hash === '')) mostrar();
});
iniciarDesdeSesion();
if (MODO_PRUEBA) console.info('Voglia Mantenimiento: modo prueba (backend simulado en /api)');
iniciarCola();
mostrar();
dibujarFranja();
