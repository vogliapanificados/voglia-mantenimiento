/**
 * Registro: todo lo que pasó, en un solo lugar, con pestañas:
 *  Fallas · Trabajos · Preventivos (admin y mecánico) · Stock (mecánico; el admin lo tiene en Más) · Services (solo admin).
 * Cada pestaña reutiliza su pantalla de lista.
 */
import { h, poner } from '../ui.js';
import { es } from '../estado.js';
import { ir } from '../app.js';
import { pantallaFallas } from './fallas.js';
import { pantallaTrabajos } from './trabajos.js';
import { pantallaVisitas } from './admin.js';
import { pantallaPreventivos } from './preventivo.js';
import { pantallaStockMecanico } from './repuestos.js';

const CLAVE_PESTANA = 'voglia_registro_pestana';

function pestanas() {
  const lista = [
    { clave: 'fallas', texto: '⚠️ Fallas', fn: pantallaFallas },
    { clave: 'trabajos', texto: '🛠️ Trabajos', fn: pantallaTrabajos }
  ];
  if (es('admin', 'mecanico')) lista.push({ clave: 'preventivos', texto: '🔵 Preventivos', fn: pantallaPreventivos });
  if (es('mecanico')) lista.push({ clave: 'stock', texto: '📦 Stock', fn: pantallaStockMecanico });
  if (es('admin')) lista.push({ clave: 'services', texto: '🧾 Services', fn: pantallaVisitas });
  return lista;
}

export async function pantallaRegistro(cont, [pedida]) {
  const lista = pestanas();
  let clave = pedida || sessionStorage.getItem(CLAVE_PESTANA) || 'fallas';
  if (!lista.some(p => p.clave === clave)) clave = 'fallas';
  sessionStorage.setItem(CLAVE_PESTANA, clave);
  const actual = lista.find(p => p.clave === clave);

  const contenido = h('div');
  await actual.fn(contenido, []);
  poner(cont,
    h('div', { class: 'pestanas' }, lista.map(p =>
      h('button', { class: 'pestana' + (p.clave === clave ? ' elegida' : ''), onclick: () => ir('registro/' + p.clave) }, p.texto))),
    contenido);
}
