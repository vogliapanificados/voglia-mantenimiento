/**
 * ============================================================
 *  Voglia Mantenimiento — instalar.js
 *  Botón "Instalar app" y las instrucciones para cada celular:
 *   - Android (Chrome): el navegador ofrece instalar → botón propio.
 *   - iPhone (Safari): no hay botón automático → instrucciones
 *     (Compartir ⬆️ → "Agregar a inicio").
 * ============================================================
 */
import { h } from './ui.js';

let pedidoInstalacion = null; // evento de Chrome guardado para usarlo con el botón

export const esIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const yaInstalada = () => (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
  navigator.standalone === true;
export const sePuedeInstalar = () => !!pedidoInstalacion;

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault(); // la app muestra su propio botón
  pedidoInstalacion = ev;
  window.dispatchEvent(new CustomEvent('instalable'));
});
window.addEventListener('appinstalled', () => {
  pedidoInstalacion = null;
  window.dispatchEvent(new CustomEvent('instalable'));
});

/** Abre el cartel de instalación de Chrome. Devuelve true si la instaló. */
export async function instalar() {
  if (!pedidoInstalacion) return false;
  pedidoInstalacion.prompt();
  const r = await pedidoInstalacion.userChoice;
  pedidoInstalacion = null;
  window.dispatchEvent(new CustomEvent('instalable'));
  return r && r.outcome === 'accepted';
}

/** Instrucciones para instalarla a mano (se muestran en "Mi cuenta"). */
export function instruccionesInstalacion() {
  if (yaInstalada()) return h('p', { class: 'suave' }, '✅ La app ya está instalada en este celular.');
  return h('div', null,
    sePuedeInstalar()
      ? h('button', { class: 'btn', onclick: () => instalar() }, '📲 Instalar la app en este celular')
      : null,
    h('details', { class: 'instrucciones', open: esIPhone() || !sePuedeInstalar() },
      h('summary', null, esIPhone() ? 'Cómo instalarla en iPhone' : 'Cómo instalarla a mano'),
      esIPhone()
        ? h('ol', null,
          h('li', null, 'Abrí esta página en Safari (no en otro navegador).'),
          h('li', null, 'Tocá el botón Compartir ⬆️ (abajo, en el medio).'),
          h('li', null, 'Bajá y tocá "Agregar a inicio".'),
          h('li', null, 'Tocá "Agregar". Queda el ícono de Voglia en la pantalla.'))
        : h('ol', null,
          h('li', null, 'Abrí esta página en Chrome.'),
          h('li', null, 'Tocá los tres puntitos ⋮ (arriba a la derecha).'),
          h('li', null, 'Tocá "Instalar app" o "Agregar a pantalla principal".'),
          h('li', null, 'Confirmá. Queda el ícono de Voglia en la pantalla.'))));
}

/** Cartel en el Inicio para invitar a instalarla (se puede cerrar). */
export function cartelInstalar() {
  if (yaInstalada() || localStorage.getItem('voglia_no_instalar') === '1') return null;
  if (!sePuedeInstalar() && !esIPhone()) return null;
  const cartel = h('div', { class: 'tarjeta cartel-instalar' },
    h('div', { class: 'fila' },
      h('img', { src: 'icons/icono-192.png', alt: '', width: 40, height: 40 }),
      h('div', { class: 'crece' },
        h('div', { class: 'negrita' }, 'Instalá la app en el celular'),
        h('div', { class: 'suave' }, esIPhone() ? 'Safari → Compartir ⬆️ → "Agregar a inicio".' : 'Se abre con un toque y funciona sin señal.'))),
    h('div', { class: 'fila-botones' },
      sePuedeInstalar() ? h('button', { class: 'btn', onclick: async () => { if (await instalar()) cartel.remove(); } }, '📲 Instalar') : null,
      h('button', { class: 'btn btn-secundario', onclick: () => { localStorage.setItem('voglia_no_instalar', '1'); cartel.remove(); } }, 'Ahora no')));
  return cartel;
}
