/**
 * Pantallas del mecánico (y admin) durante una reparación:
 *  - Pedir repuestos (del catálogo de la máquina o uno nuevo, todas las veces que haga falta)
 *  - Cerrar la reparación (trabajo realizado, causa, repuestos usados y fotos)
 *  - Externas: registrar la visita del service y cerrar (solo admin)
 */
import { h, poner, aviso, conBoton, confirmar } from '../ui.js';
import { llamar, cargar } from '../api.js';
import { invalidarDatos, datosAlDia } from '../estado.js';
import { ir, ponerTitulo } from '../app.js';
import { selectorFotos } from '../fotos.js';
import { formularioPedido, editorUsados } from '../repuestos-ui.js';

/** Trae la máquina y verifica que esté En reparación. */
async function traerEnReparacion(idMaquina) {
  const d = await llamar('detalleMaquina', { id_maquina: idMaquina });
  if (!d.incidente || d.maquina.estado !== 'En reparación') {
    throw new Error(d.maquina.nombre + ' no está en reparación. Primero hay que tocar "Empezar reparación".');
  }
  return d;
}

// ============================================================
//  Pedir repuestos
// ============================================================

export async function pantallaPedido(cont, [idMaquina]) {
  const [d, datos] = await Promise.all([traerEnReparacion(idMaquina), datosAlDia()]);
  ponerTitulo('Pedir repuestos · ' + d.maquina.nombre);
  const form = formularioPedido({ catalogo: d.catalogo, conMaquina: true, stock: datos.stock });

  async function enviar(boton) {
    const items = await form.confirmarEnvio();
    if (!items) return;
    await conBoton(boton, async () => {
      const r = await cargar('pedirRepuestos', { id_maquina: idMaquina, items });
      aviso(r.mensaje || 'Pedido enviado.', 'ok', 5);
      invalidarDatos();
      ir('maquina/' + idMaquina);
    });
  }

  poner(cont,
    form.elementos,
    h('div', { class: 'separador' }),
    h('button', { class: 'btn', onclick: (ev) => enviar(ev.currentTarget) }, '🛒 Enviar pedido'),
    h('button', { class: 'btn btn-secundario', onclick: () => ir('maquina/' + idMaquina) }, 'Cancelar'));
}

// ============================================================
//  Cerrar reparación
// ============================================================

/**
 * Causa de la falla (obligatoria) + detalle libre. Devuelve { elementos, leer() }.
 */
function campoCausa(causas) {
  let causa = '';
  const caja = h('div', { class: 'opciones dos' });
  const detalle = h('input', { type: 'text', placeholder: 'Detalle de la causa (opcional)', maxlength: 500 });
  const dibujar = () => poner(caja, causas.map(c =>
    h('button', { class: 'opcion' + (c === causa ? ' elegida' : ''), type: 'button', onclick: () => { causa = c; dibujar(); } }, c)));
  dibujar();
  return {
    elementos: [h('h2', null, '¿Por qué falló?'), caja, detalle],
    leer: () => ({ causa, causa_detalle: detalle.value.trim() })
  };
}

export async function pantallaCierre(cont, [idMaquina]) {
  const [d, datos] = await Promise.all([traerEnReparacion(idMaquina), datosAlDia()]);
  if (d.maquina.sector === 'Externas') { ir('cierre-externa/' + idMaquina); return; }
  ponerTitulo('Cerrar · ' + d.maquina.nombre);
  const causa = campoCausa(datos.causas || []);
  const selector = selectorFotos({ texto: '📷 Foto del trabajo terminado (opcional)' });
  const usados = editorUsados([d.incidente.pedidos || [], d.catalogo], datos.stock);
  const trabajo = h('textarea', { placeholder: 'Qué hiciste: qué se cambió, qué se ajustó, qué se revisó…', maxlength: 2000 });

  async function enviar(boton) {
    if (!trabajo.value.trim()) return aviso('Contá qué trabajo hiciste.', 'error');
    if (!causa.leer().causa) return aviso('Elegí por qué falló.', 'error');
    const lista = usados.leer();
    const ok = await confirmar({
      titulo: 'Cerrar reparación',
      texto: lista.length
        ? '¿Confirmás que ' + d.maquina.nombre + ' quedó funcionando? Se registran ' + lista.length + ' repuesto(s) usado(s).'
        : '¿Confirmás que ' + d.maquina.nombre + ' quedó funcionando? No cargaste repuestos usados.',
      si: 'Sí, funciona', claseSi: 'btn btn-verde'
    });
    if (!ok) return;

    await conBoton(boton, async () => {
      const r = await cargar('cerrarReparacion', Object.assign({
        id_maquina: idMaquina, trabajo_realizado: trabajo.value.trim(), repuestos_usados: lista, fotos: selector.fotos()
      }, causa.leer()));
      aviso(r.mensaje || 'Reparación cerrada.', 'ok', 7);
      invalidarDatos();
      ir('maquina/' + idMaquina);
    });
  }

  poner(cont,
    h('h2', null, 'Trabajo realizado'), trabajo,
    causa.elementos,
    usados.elementos,
    h('h2', null, 'Fotos'), selector.elemento,
    h('div', { class: 'separador' }),
    h('button', { class: 'btn btn-verde', onclick: (ev) => enviar(ev.currentTarget) }, '✅ Cerrar reparación'),
    h('button', { class: 'btn btn-secundario', onclick: () => ir('maquina/' + idMaquina) }, 'Cancelar'));
}

// ============================================================
//  Externas: registrar la visita del service y cerrar (solo admin)
// ============================================================

export async function pantallaCierreExterna(cont, [idMaquina]) {
  const [d, datos] = await Promise.all([traerEnReparacion(idMaquina), datosAlDia()]);
  ponerTitulo('Visita del service · ' + d.maquina.nombre);
  const causa = campoCausa(datos.causas || []);
  const selector = selectorFotos({ texto: '📷 Foto del trabajo (opcional)' });

  const service = h('select', null,
    h('option', { value: '' }, 'Elegí el service…'),
    (datos.services || []).map(s => h('option', { value: s.id_service, selected: s.id_service === d.maquina.id_service },
      s.empresa + (s.especialidad ? ' · ' + s.especialidad : ''))));
  const tecnico = h('input', { type: 'text', placeholder: 'Nombre del técnico (opcional)', maxlength: 80 });
  const trabajo = h('textarea', { placeholder: 'Qué hizo el service', maxlength: 2000 });
  const costo = h('input', { type: 'text', inputmode: 'numeric', placeholder: '$ 0 (opcional)',
    oninput: (ev) => { const n = Number(String(ev.target.value).replace(/\D/g, '')); ev.target.value = n ? n.toLocaleString('es-AR') : ''; } });

  async function enviar(boton) {
    if (!service.value) return aviso('Elegí el service.', 'error');
    if (!trabajo.value.trim()) return aviso('Contá qué hizo el service.', 'error');
    if (!causa.leer().causa) return aviso('Elegí por qué falló.', 'error');
    const ok = await confirmar({ titulo: 'Registrar visita y cerrar', texto: '¿' + d.maquina.nombre + ' quedó funcionando?', si: 'Sí, funciona', claseSi: 'btn btn-verde' });
    if (!ok) return;
    await conBoton(boton, async () => {
      const r = await cargar('cerrarExterna', Object.assign({
        id_maquina: idMaquina, id_service: service.value, tecnico: tecnico.value.trim(),
        trabajo: trabajo.value.trim(), costo: costo.value.replace(/\D/g, ''), fotos: selector.fotos()
      }, causa.leer()));
      aviso(r.mensaje || 'Visita registrada.', 'ok', 7);
      invalidarDatos();
      ir('maquina/' + idMaquina);
    });
  }

  poner(cont,
    h('p', { class: 'suave' }, 'Equipo de Externas: registrá lo que hizo el service. El costo solo lo ves vos.'),
    h('label', { class: 'campo' }, h('span', null, 'Service'), service),
    (datos.services || []).length ? null : h('p', { class: 'suave chico' }, 'Primero cargá el service en Admin › Services técnicos.'),
    h('label', { class: 'campo' }, h('span', null, 'Técnico'), tecnico),
    h('label', { class: 'campo' }, h('span', null, 'Qué hizo'), trabajo),
    h('label', { class: 'campo' }, h('span', null, 'Costo ($)'), costo),
    causa.elementos,
    h('h2', null, 'Fotos'), selector.elemento,
    h('div', { class: 'separador' }),
    h('button', { class: 'btn btn-verde', onclick: (ev) => enviar(ev.currentTarget) }, '✅ Registrar visita y cerrar'),
    h('button', { class: 'btn btn-secundario', onclick: () => ir('maquina/' + idMaquina) }, 'Cancelar'));
}
