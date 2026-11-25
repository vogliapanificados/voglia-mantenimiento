/**
 * Cargas guardadas en el celular: las que esperan señal y las que el sistema rechazó al enviarlas.
 * Las rechazadas las descarta quien las cargó (puede copiar el texto para cargarla de nuevo).
 */
import { h, poner, vacio, aviso, confirmar, fechaHora } from '../ui.js';
import { cargasDelUsuario, descartar, procesar } from '../cola.js';
import { ir } from '../app.js';

/** Texto de la carga, para copiarlo y volver a cargarla. */
function textoDe(it) {
  const d = it.datos || {};
  const partes = [it.descripcion];
  if (d.descripcion) partes.push(d.descripcion);
  if (d.tipo_falla) partes.push('Tipo: ' + d.tipo_falla + (d.prioridad ? ' · ' + d.prioridad : ''));
  if (d.trabajo_realizado) partes.push('Trabajo: ' + d.trabajo_realizado);
  if (d.observacion) partes.push('Observación: ' + d.observacion);
  if (d.motivo) partes.push('Motivo: ' + d.motivo);
  if (Array.isArray(d.items)) d.items.forEach(x => partes.push('• ' + x.cantidad + ' × ' + x.repuesto + (x.medida ? ' (' + x.medida + ')' : '')));
  return partes.join('\n');
}

export async function pantallaPendientes(cont) {
  const lista = await cargasDelUsuario();
  const esperando = lista.filter(x => x.estado === 'pendiente');
  const problemas = lista.filter(x => x.estado === 'error');
  const recargar = () => ir('pendientes');

  const tarjeta = (it, conProblema) => h('div', { class: 'tarjeta' + (conProblema ? ' tarjeta-problema' : '') },
    h('div', { class: 'negrita' }, it.descripcion),
    h('div', { class: 'suave' }, 'Cargada ' + fechaHora(it.momento) + (it.datos && it.datos.fotos && it.datos.fotos.length ? ' · 📷 ' + it.datos.fotos.length : '')),
    conProblema ? h('p', { class: 'texto-problema' }, '⚠️ ' + it.error) : null,
    conProblema ? h('div', { class: 'fila-botones' },
      h('button', {
        class: 'btn btn-secundario', onclick: async () => {
          try { await navigator.clipboard.writeText(textoDe(it)); aviso('Texto copiado: lo podés pegar al cargarla de nuevo.', 'ok'); }
          catch (e) { aviso('No se pudo copiar en este celular.', 'error'); }
        }
      }, '📋 Copiar texto'),
      h('button', {
        class: 'btn btn-rojo', onclick: async () => {
          const ok = await confirmar({ titulo: 'Descartar carga', texto: 'Se borra del celular. Si hace falta, cargala de nuevo.', si: 'Descartar' });
          if (!ok) return;
          await descartar(it.id_cliente);
          recargar();
        }
      }, 'Descartar')) : null);

  poner(cont,
    problemas.length ? [
      h('h2', null, '⚠️ Cargas con problema'),
      h('p', { class: 'suave' }, 'Se guardaron sin señal, pero al enviarlas el sistema no las aceptó (por ejemplo, otra persona ya había cerrado esa reparación). Revisá el motivo y, si hace falta, cargala de nuevo.'),
      problemas.map(it => tarjeta(it, true))
    ] : null,
    h('h2', null, '📵 Esperando señal'),
    esperando.length ? [
      h('p', { class: 'suave' }, 'Se envían solas, en este orden, cuando vuelva la conexión. No cierres sesión hasta que se envíen.'),
      esperando.map(it => tarjeta(it, false)),
      h('button', {
        class: 'btn', onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          await procesar();
          recargar();
        }
      }, '🔄 Intentar enviar ahora')
    ] : vacio('No hay cargas esperando. Todo está enviado ✅'));
}
