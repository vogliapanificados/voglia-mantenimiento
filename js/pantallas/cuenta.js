/**
 * Mi cuenta: datos del usuario, cambiar mi PIN y cerrar sesión.
 */
import { h, poner, aviso, conBoton, confirmar, dato, ROLES } from '../ui.js';
import { llamar, cargar, borrarSesion, olvidarLecturas } from '../api.js';
import { estado } from '../estado.js';
import { salir } from '../app.js';
import { contar } from '../cola.js';
import { LECTURAS, vaciar } from '../almacen.js';
import { instruccionesInstalacion } from '../instalar.js';

const campoPin = (placeholder) => h('input', {
  type: 'password', inputmode: 'numeric', maxlength: 4, autocomplete: 'off', placeholder,
  style: { letterSpacing: '6px', fontSize: '22px', textAlign: 'center' },
  oninput: (ev) => { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 4); }
});

export async function pantallaCuenta(cont) {
  const u = estado.usuario;
  const actual = campoPin('PIN actual');
  const nuevo = campoPin('PIN nuevo');
  const repetir = campoPin('Repetí el PIN nuevo');

  async function cambiarPin(boton) {
    if (actual.value.length !== 4) return aviso('Escribí tu PIN actual (4 números).', 'error');
    if (nuevo.value.length !== 4) return aviso('El PIN nuevo tiene que tener 4 números.', 'error');
    if (nuevo.value !== repetir.value) return aviso('Los dos PIN nuevos no coinciden.', 'error');
    await conBoton(boton, async () => {
      const r = await cargar('cambiarMiPin', { pin_actual: actual.value, pin_nuevo: nuevo.value });
      actual.value = nuevo.value = repetir.value = '';
      aviso(r.mensaje || 'PIN cambiado.', 'ok', 6);
    });
  }

  async function cerrarSesion(boton) {
    const { pendientes } = await contar();
    const ok = await confirmar({
      titulo: 'Cerrar sesión',
      texto: (pendientes ? '⚠️ Tenés ' + pendientes + ' carga(s) sin enviar: quedan guardadas en el celular y se envían cuando vuelvas a entrar. ' : '') +
        'Para volver a entrar vas a necesitar tu PIN.',
      si: 'Cerrar sesión', claseSi: 'btn btn-rojo'
    });
    if (!ok) return;
    await conBoton(boton, async () => {
      try { await llamar('logout'); } catch (e) { /* aunque falle, se cierra en el celular */ }
      try { olvidarLecturas(); await vaciar(LECTURAS); } catch (e) { /* lo guardado para ver sin señal se borra al salir */ }
      borrarSesion();
      salir();
    });
  }

  poner(cont,
    h('div', { class: 'tarjeta' },
      dato('Nombre', u.nombre),
      dato('Rol', ROLES[u.rol] || u.rol)),

    h('h2', null, 'Cambiar mi PIN'),
    h('div', { class: 'tarjeta' },
      h('p', { class: 'suave chico' }, 'Si Juan te dio un PIN provisorio (por ejemplo 1111), cambialo por uno que solo sepas vos.'),
      h('label', { class: 'campo' }, h('span', null, 'PIN actual'), actual),
      h('label', { class: 'campo' }, h('span', null, 'PIN nuevo'), nuevo),
      h('label', { class: 'campo' }, h('span', null, 'Repetí el PIN nuevo'), repetir),
      h('button', { class: 'btn', onclick: (ev) => cambiarPin(ev.currentTarget) }, 'Cambiar PIN')),

    h('h2', null, 'Instalar la app'),
    h('div', { class: 'tarjeta' }, instruccionesInstalacion()),

    h('div', { style: { height: '10px' } }),
    h('button', { class: 'btn btn-peligro', onclick: (ev) => cerrarSesion(ev.currentTarget) }, 'Cerrar sesión'));
}
