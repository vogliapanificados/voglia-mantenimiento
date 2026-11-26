/**
 * Historial de fallas de una máquina (lo ven todos los roles; nunca trae pagos).
 */
import { h, poner, vacio, dato, etiquetaPrioridad, etiquetaEstado, fechaHora } from '../ui.js';
import { llamar } from '../api.js';
import { ponerTitulo } from '../app.js';
import { galeriaFotos } from '../fotos.js';
import { tarjetaTrabajo } from './trabajos.js';
import { tarjetaTrabajoElectrico } from './electricista.js';

export async function pantallaHistorial(cont, [idMaquina]) {
  const d = await llamar('historialMaquina', { id_maquina: idMaquina });
  ponerTitulo('Historial · ' + d.maquina.nombre);
  const r = d.resumen;

  poner(cont,
    h('div', { class: 'tarjeta' },
      dato('Fallas registradas', String(r.total_fallas)),
      dato('Promedio fuera de servicio', r.prom_fuera_servicio_texto || '—'),
      dato('Promedio de reparación', r.prom_reparacion_texto || '—')),
    d.incidentes.length ? d.incidentes.map(tarjeta) : vacio('Esta máquina no tiene fallas registradas.'),
    (d.trabajos || []).length ? [h('h2', null, 'Trabajos varios (' + d.trabajos.length + ')'), d.trabajos.map(tarjetaTrabajo)] : null,
    (d.trabajos_electricos || []).length ? [h('h2', null, '⚡ Trabajos del electricista (' + d.trabajos_electricos.length + ')'), d.trabajos_electricos.map(tarjetaTrabajoElectrico)] : null,
    d.incidentes.length >= 50 ? h('p', { class: 'suave chico centro' }, 'Se muestran las últimas 50 fallas. El resto está en la planilla.') : null);
}

function tarjeta(inc) {
  // El detalle (con sus fotos) se arma recién la primera vez que se abre
  let cuerpo = null;
  const armarCuerpo = () => h('div', null,
    h('div', { class: 'separador' }),
    h('p', null, inc.descripcion),
    galeriaFotos(inc.fotos_falla),
    h('p', { class: 'suave chico' }, 'Cargó ' + inc.cargado_por + ' · ' + fechaHora(inc.fecha_falla)),

    inc.notas.length ? [h('h3', null, 'Notas'),
      h('ul', { class: 'lista' }, inc.notas.map(n => h('li', null, n.nota, galeriaFotos(n.fotos),
        h('div', { class: 'suave chico' }, n.cargado_por + ' · ' + fechaHora(n.fecha) + (n.subio_prioridad === 'SI' ? ' · ⬆️ subió a ' + n.prioridad : '')))))] : null,

    inc.mecanico ? [h('h3', null, 'Reparación'),
      dato('Mecánico', inc.mecanico),
      dato('Inicio', fechaHora(inc.inicio_reparacion)),
      dato('Fin', fechaHora(inc.fin_reparacion)),
      dato('Tiempo de reparación', inc.reparacion_texto),
      dato('Fuera de servicio', inc.fuera_servicio_texto)] : null,

    inc.trabajo_realizado ? [h('h3', null, 'Trabajo realizado'), h('p', null, inc.trabajo_realizado), galeriaFotos(inc.fotos_cierre)] : null,
    inc.causa ? [h('h3', null, 'Causa'), h('p', null, inc.causa + (inc.causa_detalle ? ' — ' + inc.causa_detalle : ''))] : null,

    inc.pedidos.length ? [h('h3', null, 'Repuestos pedidos'),
      h('ul', { class: 'lista' }, inc.pedidos.map(p => h('li', null,
        p.cantidad + ' × ' + p.repuesto + (p.medida ? ' (' + p.medida + ')' : '') + (p.detalle ? ' — ' + p.detalle : ''),
        h('div', { class: 'suave chico' }, p.pedido_por + ' · ' + fechaHora(p.fecha)))))] : null,

    inc.usados.length ? [h('h3', null, 'Repuestos usados'),
      h('ul', { class: 'lista' }, inc.usados.map(u => h('li', null,
        u.cantidad + ' × ' + u.repuesto + (u.detalle ? ' — ' + u.detalle : ''))))] : null);

  const caja = h('div', { class: 'tarjeta tarjeta-tocable', role: 'button', onclick: () => {
    if (!cuerpo) { cuerpo = armarCuerpo(); caja.appendChild(cuerpo); } else cuerpo.classList.toggle('oculto');
  } },
    h('div', { class: 'suave chico' }, 'Tocá para ver el detalle'),
    h('div', { class: 'fila' },
      h('span', { class: 'negrita crece' }, fechaHora(inc.fecha_falla)),
      inc.estado === 'Cerrado' ? h('span', { class: 'etiqueta est-ok' }, 'Cerrada') : etiquetaEstado(inc.estado)),
    h('div', { style: { marginTop: '6px' } }, etiquetaPrioridad(inc.prioridad), ' ', inc.tipo_falla),
    inc.fuera_servicio_texto ? h('div', { class: 'suave chico', style: { marginTop: '4px' } }, 'Fuera de servicio: ' + inc.fuera_servicio_texto +
      (inc.causa ? ' · Causa: ' + inc.causa : '')) : null);
  return caja;
}
