/**
 * Pantalla de ingreso: elegir el nombre de la lista y escribir el PIN de 4 números.
 */
import { h, poner, aviso } from '../ui.js';
import { llamar, guardarSesion, ErrorApi } from '../api.js';
import { estado } from '../estado.js';
import { MODO_PRUEBA } from '../config.js';

const CLAVE_ULTIMO = 'voglia_ultimo_usuario';
const LARGO_PIN = 4;

export async function pantallaIngreso(app, alEntrar) {
  let usuarios;
  try {
    usuarios = await llamar('listarUsuariosLogin');
  } catch (e) {
    poner(app, h('div', { class: 'ingreso' }, encabezado(),
      h('p', { class: 'centro' }, e.message),
      h('button', { class: 'btn', onclick: () => pantallaIngreso(app, alEntrar) }, 'Reintentar')));
    return;
  }

  const ultimo = localStorage.getItem(CLAVE_ULTIMO);
  const elegido = usuarios.find(u => u.id_usuario === ultimo);
  if (elegido) pedirPin(app, elegido, usuarios, alEntrar);
  else elegirUsuario(app, usuarios, alEntrar);
}

function encabezado() {
  return h('div', { class: 'logo-ingreso' },
    h('img', { src: 'icons/logo-voglia.png', alt: 'Voglia', class: 'logo-marca' }),
    h('b', null, 'Mantenimiento'),
    h('span', { class: 'suave' }, MODO_PRUEBA ? 'Modo prueba (datos de ejemplo)' : 'Registro de fallas y reparaciones'));
}

function elegirUsuario(app, usuarios, alEntrar) {
  poner(app, h('div', { class: 'ingreso' },
    encabezado(),
    h('h2', null, '¿Quién sos?'),
    usuarios.length
      ? h('div', { class: 'opciones' }, usuarios.map(u =>
          h('button', { class: 'opcion', onclick: () => pedirPin(app, u, usuarios, alEntrar) }, u.nombre)))
      : h('p', { class: 'vacio' }, 'Todavía no hay usuarios. Juan los crea desde la planilla (Voglia > Crear usuario).')));
}

function pedirPin(app, usuario, usuarios, alEntrar) {
  let pin = '';
  let enviando = false;
  const puntos = h('div', { class: 'puntos-pin' });
  const error = h('div', { class: 'error-pin' });

  const dibujarPuntos = () => poner(puntos,
    Array.from({ length: LARGO_PIN }, (_, i) => h('span', { class: i < pin.length ? 'lleno' : '' })));

  async function enviar() {
    enviando = true;
    poner(error, 'Ingresando…');
    try {
      const r = await llamar('login', { id_usuario: usuario.id_usuario, pin });
      guardarSesion(r);
      localStorage.setItem(CLAVE_ULTIMO, usuario.id_usuario);
      estado.usuario = r.usuario;
      aviso('¡Hola, ' + r.usuario.nombre + '!', 'ok', 2);
      alEntrar();
    } catch (e) {
      pin = '';
      dibujarPuntos();
      poner(error, e instanceof ErrorApi ? e.message : 'No se pudo ingresar.');
      if (navigator.vibrate) navigator.vibrate(200);
    } finally {
      enviando = false;
    }
  }

  function tocar(tecla) {
    if (enviando) return;
    if (tecla === '⌫') pin = pin.slice(0, -1);
    else if (pin.length < LARGO_PIN) pin += tecla;
    if (tecla !== '⌫') poner(error);
    dibujarPuntos();
    if (pin.length === LARGO_PIN) enviar();
  }

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  dibujarPuntos();
  poner(app, h('div', { class: 'ingreso' },
    encabezado(),
    h('h2', { class: 'centro' }, usuario.nombre),
    h('p', { class: 'centro suave' }, 'Escribí tu PIN de 4 números'),
    puntos,
    error,
    h('div', { class: 'teclado' }, teclas.map(t =>
      h('button', { class: 'tecla' + (t === '' ? ' vacia' : ''), 'aria-label': t === '⌫' ? 'Borrar' : t, onclick: () => tocar(t) }, t))),
    h('div', { class: 'centro', style: { marginTop: '18px' } },
      h('button', { class: 'btn-link', onclick: () => { localStorage.removeItem(CLAVE_ULTIMO); elegirUsuario(app, usuarios, alEntrar); } },
        'No soy ' + usuario.nombre + ' · Elegir otro nombre'))));

  // También se puede escribir con el teclado de la compu
  const teclado = (ev) => {
    if (!app.contains(puntos)) { document.removeEventListener('keydown', teclado); return; }
    if (/^\d$/.test(ev.key)) tocar(ev.key);
    else if (ev.key === 'Backspace') tocar('⌫');
  };
  document.addEventListener('keydown', teclado);
}
