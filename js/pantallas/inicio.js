/**
 * Inicio: la primera pantalla, distinta para cada rol (organización aprobada por Juan).
 *  - Encargado: "Reportar una falla" / "Pedir un trabajo" + Ahora en la planta + Lo que reporté / pedí.
 *  - Mecánico: sus tareas (lo que está haciendo + para hacer, por urgencia) con los botones a mano.
 *  - Admin: estado + Necesita tu atención + Tareas del equipo + acciones.
 */
import {
  h, poner, vacio, aviso, conBoton, confirmar, etiquetaPrioridad, etiquetaEstado, claseEstado,
  hace, fecha, fechaHora, chipPendiente
} from '../ui.js';
import { llamar, cargar } from '../api.js';
import { estado, invalidarDatos } from '../estado.js';
import { ir } from '../app.js';
import { etiquetaUrgencia } from './tareas.js';
import { etiquetaEstadoPrev } from './preventivo.js';
import { inicioElectricista } from './electricista.js';

export async function pantallaInicio(cont) {
  const d = await llamar('inicio');
  const rol = estado.usuario.rol;
  const recargar = () => ir('inicio');
  const saludo = h('p', { class: 'saludo' }, saludoDelDia() + ', ' + estado.usuario.nombre.split(' ')[0]);

  if (rol === 'electricista') return poner(cont, saludo, inicioElectricista(d));
  if (rol === 'encargado') return poner(cont, saludo, inicioEncargado(d));
  if (rol === 'mecanico') return poner(cont, saludo, inicioMecanico(d, recargar));
  return poner(cont, saludo, inicioAdmin(d, recargar));
}

function saludoDelDia() {
  const hora = Number(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
}

// ---------- Piezas comunes ----------

/** Contadores por estado (tocar → Planta). */
function contadores(resumen) {
  const caja = (clase, n, texto) => h('button', { class: 'numero ' + clase, onclick: () => ir('planta') }, h('b', null, n || 0), h('span', null, texto));
  return h('div', { class: 'numeros cuatro' },
    caja('est-falla', resumen['En falla'], 'En falla'),
    caja('est-reparacion', resumen['En reparación'], 'En reparación'),
    caja('est-mant', resumen['En mantenimiento'], 'Mantenimiento'),
    caja('est-ok', resumen['Funcionando normalmente'], 'Funcionando'));
}

/** Botón grande de acción principal. */
const botonGrande = (texto, clase, ruta) => h('button', { class: 'btn btn-grande ' + clase, onclick: () => ir(ruta) }, texto);

/** "Ahora en la planta": máquinas que no están funcionando normalmente. */
function ahoraEnPlanta(lista, resumen) {
  const funcionando = resumen['Funcionando normalmente'] || 0;
  return [
    h('h2', null, 'Ahora en la planta'),
    lista.length ? lista.map(m => h('button', { class: 'tarjeta tarjeta-tocable maquina ' + claseEstado(m.estado), onclick: () => ir('maquina/' + m.id_maquina) },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, m.nombre), m._pendiente ? chipPendiente() : null,
        m.prioridad && m.estado === 'En falla' ? etiquetaPrioridad(m.prioridad) : etiquetaEstado(m.estado)),
      h('div', { class: 'maquina-detalle' },
        m.estado === 'En falla' ? m.tipo_falla + ' · sin atender ' + hace(m.desde)
          : m.estado === 'En reparación' ? '🔧 ' + m.mecanico + ' trabajando ' + hace(m.desde).replace('hace ', 'desde hace ')
            : '🛠️ ' + m.trabajo + (m.mecanico ? ' · ' + m.mecanico : ''))))
      : h('div', { class: 'tarjeta centro' }, '🟢 Todas las máquinas funcionando.'),
    lista.length && funcionando ? h('p', { class: 'suave chico' }, '🟢 ' + funcionando + ' máquina(s) funcionando normalmente.') : null
  ];
}

// ---------- Encargado ----------

function inicioEncargado(d) {
  const ESTADO_TEXTO = {
    'En falla': '⏳ Sin atender', 'En reparación': '🔧 En reparación', 'Cerrado': '✅ Resuelto',
    'Pendiente': '⏳ Pendiente', 'En curso': '🔧 En curso', 'Terminado': '✅ Terminado', 'Cancelado': '✖️ Cancelado'
  };
  return [
    botonGrande('⚠️ Reportar una falla', 'btn-rojo', 'reportar'),
    h('button', { class: 'btn btn-secundario', onclick: () => ir('pedir-trabajo') }, '🛠️ Pedir un trabajo'),
    ahoraEnPlanta(d.ahora, d.resumen),
    h('h2', null, 'Lo que reporté / pedí'),
    d.mis_reportes.length ? d.mis_reportes.map(x => h('button', {
      class: 'tarjeta tarjeta-tocable', onclick: () => ir(x.tipo === 'trabajo' ? 'trabajo/' + x.id_trabajo : 'maquina/' + x.id_maquina)
    },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, (x.tipo === 'falla' ? '⚠️ ' : '🛠️ ') + x.titulo), x._pendiente ? chipPendiente() : null,
        h('span', { class: 'chico negrita' }, ESTADO_TEXTO[x.estado] || x.estado)),
      h('div', { class: 'maquina-detalle' }, x.detalle),
      h('div', { class: 'suave chico' },
        (x.estado === 'Cerrado' || x.estado === 'Terminado') ? 'Resuelto ' + hace(x.fin) + (x.mecanico ? ' por ' + x.mecanico : '')
          : (x.mecanico && (x.estado === 'En reparación' || x.estado === 'En curso')) ? x.mecanico + ' está trabajando'
            : 'Lo cargaste ' + hace(x.fecha))))
      : vacio('No reportaste nada en los últimos días.'),
    h('button', { class: 'btn-link', onclick: () => ir('registro') }, 'Ver todo en Registro ›')
  ];
}

// ---------- Mecánico ----------

function inicioMecanico(d, recargar) {
  const t = d.tareas;
  const enCurso = t.tareas.filter(x => x.grupo === 1);
  const paraHacer = t.tareas.filter(x => x.grupo !== 1);
  return [
    h('p', { class: 'resumen-tareas' },
      plural(t.resumen.en_curso, 'en curso', 'en curso') + ' · ' + plural(t.resumen.fallas, 'falla', 'fallas') + ' · ' +
      plural(t.resumen.trabajos, 'trabajo', 'trabajos') + ' · ' + plural(t.resumen.preventivos || 0, 'preventivo', 'preventivos')),
    enCurso.length ? [h('h2', null, 'Lo que estás haciendo'), enCurso.map(x => tarjetaTarea(x, recargar))] : null,
    h('h2', null, 'Para hacer'),
    paraHacer.length ? paraHacer.map(x => tarjetaTarea(x, recargar)) : vacio('🟢 No hay nada pendiente.'),
    (t.proximos || []).length ? [
      h('h2', null, 'Esta semana'),
      h('p', { class: 'suave chico' }, 'Preventivos de los próximos días: los podés adelantar.'),
      t.proximos.map(x => tarjetaTarea(Object.assign({}, x, { grupo: 99 }), recargar))
    ] : null,
    h('div', { style: { height: '6px' } }),
    h('button', { class: 'btn btn-secundario', onclick: () => ir('reportar') }, '⚠️ Reportar otra falla')
  ];
}

const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

/**
 * Tarjeta de una tarea con sus botones (Empezar / Pedir repuestos / Cerrar o Terminar).
 * Tocar la tarjeta abre el detalle; los botones hacen la acción directo.
 */
export function tarjetaTarea(x, recargar) {
  if (x.tipo === 'preventivo') return tarjetaPreventivoTarea(x, recargar);
  const enCurso = x.grupo === 1;
  const esFalla = x.tipo === 'falla';
  const detalle = esFalla ? 'maquina/' + x.id_maquina : 'trabajo/' + x.id_trabajo;
  const boton = (texto, clase, fn) => h('button', {
    class: 'btn btn-chico ' + clase, onclick: (ev) => { ev.stopPropagation(); fn(ev.currentTarget); }
  }, texto);

  const empezar = (b) => {
    const externa = esFalla && x.externa;
    confirmar(esFalla
      ? (externa
        ? { titulo: 'Llamé al service', texto: '¿Ya llamaste al service por ' + x.maquina + '?', si: 'Sí, ya llamé' }
        : { titulo: 'Empezar reparación', texto: '¿Empezás a trabajar en ' + x.maquina + '? Se le avisa a Juan.', si: 'Sí, empiezo' })
      : { titulo: 'Empezar trabajo', texto: x.id_maquina ? 'Mientras trabajás, ' + x.donde + ' queda "En mantenimiento".' : '¿Empezás "' + x.descripcion + '"?', si: 'Sí, empiezo' })
      .then(ok => ok && conBoton(b, async () => {
        const r = esFalla
          ? await cargar('iniciarReparacion', { id_maquina: x.id_maquina })
          : await cargar('empezarTrabajo', { id_trabajo: x.id_trabajo });
        aviso(r.mensaje, 'ok');
        invalidarDatos();
        recargar();
      }));
  };

  let botones;
  if (esFalla && x.externa) {
    botones = enCurso ? [boton('✅ Registrar visita y cerrar', 'btn-verde', () => ir('cierre-externa/' + x.id_maquina))]
      : [boton('📞 Llamé al service', 'btn-amarillo', empezar)];
  } else if (enCurso) {
    botones = [
      boton('🛒 Pedir repuestos', '', () => ir(esFalla ? 'pedido/' + x.id_maquina : 'pedido-trabajo/' + x.id_trabajo)),
      boton(esFalla ? '✅ Cerrar' : '✅ Terminar', 'btn-verde', () => ir(esFalla ? 'cierre/' + x.id_maquina : 'terminar-trabajo/' + x.id_trabajo))
    ];
  } else {
    botones = [boton('🔧 Empezar', 'btn-amarillo', empezar)];
  }

  const clase = enCurso ? (esFalla ? 'est-reparacion' : 'est-mant') : (esFalla ? 'est-falla' : 'est-ok');
  return h('div', { class: 'tarjeta tarjeta-tocable maquina ' + clase, role: 'button', onclick: () => ir(detalle) },
    h('div', { class: 'fila' },
      h('span', { class: 'negrita crece' }, (esFalla ? (x.externa ? '🧰 ' : '⚠️ ') + x.maquina : '🛠️ ' + x.donde)), x._pendiente ? chipPendiente() : null,
      enCurso ? h('span', { class: 'etiqueta ' + (esFalla ? 'est-reparacion' : 'est-mant') }, esFalla ? 'En reparación' : 'En curso')
        : esFalla ? etiquetaPrioridad(x.prioridad) : etiquetaUrgencia(x.urgencia)),
    h('div', { class: 'maquina-detalle' }, (esFalla ? x.tipo_falla + ' · ' : 'Trabajo: ') + x.descripcion),
    h('div', { class: 'suave chico', style: { marginTop: '4px' } },
      enCurso ? '🔧 ' + x.mecanico + ' · empezó ' + hace(x.inicio) : (esFalla ? 'Cargó ' : 'Pidió ') + x.cargado_por + ' · ' + hace(x.fecha)),
    h('div', { class: 'fila-botones', style: { marginTop: '10px' } }, botones));
}

/** Tarjeta de un preventivo en las tareas (Empezar / Terminar; "esperando reparación" sin botones). */
function tarjetaPreventivoTarea(x, recargar) {
  const enCurso = x.grupo === 1;
  const esperando = x.estado_prev === 'Esperando reparación';
  const boton = (texto, clase, fn) => h('button', {
    class: 'btn btn-chico ' + clase, onclick: (ev) => { ev.stopPropagation(); fn(ev.currentTarget); }
  }, texto);
  const empezar = (b) => confirmar({ titulo: 'Empezar preventivo', texto: 'Mientras lo hacés, ' + x.maquina + ' queda "En mantenimiento".', si: 'Sí, empiezo' })
    .then(ok => ok && conBoton(b, async () => {
      const r = await cargar('empezarPreventivo', { id_tarea: x.id_tarea });
      aviso(r.mensaje, 'ok');
      invalidarDatos();
      recargar();
    }));
  return h('div', { class: 'tarjeta tarjeta-tocable maquina est-mant', role: 'button', onclick: () => ir('preventivo/' + x.id_tarea) },
    h('div', { class: 'fila' },
      h('span', { class: 'negrita crece' }, '🔵 ' + x.maquina), x._pendiente ? chipPendiente() : null,
      enCurso ? h('span', { class: 'etiqueta est-mant' }, 'En curso') : etiquetaEstadoPrev(x.estado_prev, x.dias_atraso)),
    h('div', { class: 'maquina-detalle' }, 'Preventivo: ' + x.tarea + ' · ' + x.frecuencia_texto),
    h('div', { class: 'suave chico', style: { marginTop: '4px' } },
      enCurso ? '🔧 ' + x.mecanico + ' · empezó ' + hace(x.inicio)
        : esperando ? 'Espera a que se repare la falla' : 'Toca el ' + fecha(x.fecha)),
    esperando ? null : h('div', { class: 'fila-botones', style: { marginTop: '10px' } },
      enCurso ? boton('✅ Terminar', 'btn-verde', () => ir('terminar-preventivo/' + x.id_tarea))
        : boton(x.grupo === 99 ? '🔧 Adelantar' : '🔧 Empezar', 'btn-amarillo', empezar)));
}

// ---------- Admin ----------

function inicioAdmin(d, recargar) {
  const tareas = d.tareas.tareas;
  const visibles = 5;
  const cajaTareas = h('div');
  let todas = false;
  const dibujarTareas = () => poner(cajaTareas,
    tareas.length ? (todas ? tareas : tareas.slice(0, visibles)).map(x => tarjetaTarea(x, recargar)) : vacio('🟢 No hay tareas pendientes.'),
    tareas.length > visibles ? h('button', { class: 'btn-link', onclick: () => { todas = !todas; dibujarTareas(); } },
      todas ? 'Ver menos' : 'Ver todas (' + tareas.length + ') ›') : null);
  dibujarTareas();

  return [
    contadores(d.resumen),
    h('div', { class: 'fila-botones' },
      h('button', { class: 'btn btn-rojo', onclick: () => ir('reportar') }, '⚠️ Reportar falla'),
      h('button', { class: 'btn btn-secundario', onclick: () => ir('pedir-trabajo') }, '🛠️ Pedir trabajo')),
    h('h2', null, 'Necesita tu atención'),
    d.atencion.length ? d.atencion.map(a => tarjetaAtencion(a, recargar)) : h('div', { class: 'tarjeta centro' }, '👌 Nada urgente por ahora.'),
    h('h2', null, 'Tareas del equipo (' + tareas.length + ')'),
    cajaTareas
  ];
}

function tarjetaAtencion(a, recargar) {
  const tarjeta = (icono, titulo, detalle, extra, ruta) => h('div', { class: 'tarjeta tarjeta-tocable atencion', role: 'button', onclick: () => ruta && ir(ruta) },
    h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, icono + ' ' + titulo), a.prioridad ? etiquetaPrioridad(a.prioridad) : null),
    detalle ? h('div', { class: 'maquina-detalle' }, detalle) : null,
    extra);

  switch (a.tipo) {
    case 'llamar_service':
      return tarjeta('🧰', a.maquina, 'Hay que llamar al service' + (a.service ? ': ' + a.service : '') + ' · ' + hace(a.desde),
        h('div', { class: 'fila-botones', style: { marginTop: '10px' } },
          a.telefono ? h('a', { class: 'btn btn-chico btn-secundario', href: 'tel:' + a.telefono.replace(/[^\d+]/g, ''), onclick: (ev) => ev.stopPropagation() }, '📞 ' + a.telefono) : null,
          h('button', {
            class: 'btn btn-chico btn-amarillo', onclick: async (ev) => {
              ev.stopPropagation();
              const b = ev.currentTarget;
              const ok = await confirmar({ titulo: 'Llamé al service', texto: '¿Ya llamaste al service por ' + a.maquina + '?', si: 'Sí, ya llamé' });
              if (ok) await conBoton(b, async () => { const r = await cargar('iniciarReparacion', { id_maquina: a.id_maquina }); aviso(r.mensaje, 'ok'); invalidarDatos(); recargar(); });
            }
          }, 'Llamé al service')),
        'maquina/' + a.id_maquina);
    case 'registrar_visita':
      return tarjeta('🧰', a.maquina, 'El service está trabajando desde ' + fechaHora(a.desde) + '. Cuando termine, registrá la visita.',
        h('div', { class: 'fila-botones', style: { marginTop: '10px' } },
          h('button', { class: 'btn btn-chico btn-verde', onclick: (ev) => { ev.stopPropagation(); ir('cierre-externa/' + a.id_maquina); } }, '✅ Registrar visita y cerrar')),
        'maquina/' + a.id_maquina);
    case 'sin_atender':
      return tarjeta('⏰', a.maquina, 'Sin atender ' + hace(a.desde), null, 'maquina/' + a.id_maquina);
    case 'reparacion_larga':
      return tarjeta('⏳', a.maquina, 'En reparación ' + hace(a.desde).replace('hace ', 'desde hace ') + ' (' + a.mecanico + ')', null, 'maquina/' + a.id_maquina);
    case 'preventivos_vencidos':
      return tarjeta('🔵', a.cantidad === 1 ? '1 preventivo vencido' : a.cantidad + ' preventivos vencidos',
        a.tareas.map(t => t.maquina + ' · ' + t.tarea).join(' / '), null, 'registro/preventivos');
    case 'pedidos_sin_precio':
      return tarjeta('🛒', a.cantidad === 1 ? '1 pedido de repuestos sin precio' : a.cantidad + ' pedidos de repuestos sin precio',
        a.pedidos.map(p => p.maquina + ' · ' + p.items + ' ítem(s) · ' + hace(p.fecha)).join(' / '), null, 'admin/repuestos/pedidos');
    case 'stock_bajo':
      return tarjeta('📦', a.cantidad === 1 ? '1 repuesto para reponer' : a.cantidad + ' repuestos para reponer',
        a.repuestos.map(r => r.repuesto + (r.medida ? ' (' + r.medida + ')' : '') + ': hay ' + r.cantidad + ', mínimo ' + r.minimo).join(' / '), null, 'admin/repuestos/stock');
    case 'total_sin_cargar':
      return tarjeta('💰', 'Total diario del ' + fecha(a.fecha) + ' sin cargar', 'El mecánico trabajó ese día y no cargó su total.', null, 'admin/pagos');
    default:
      return null;
  }
}

