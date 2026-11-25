/**
 * Mantenimiento preventivo:
 *  - Registro › Preventivos (admin y mecánico): lista por estado y calendario del mes.
 *  - Detalle de una tarea: empezar / terminar / posponer, historial (y editar, el admin).
 *  - Terminar: pasos para tildar (si uno no se hizo, hay que decir por qué), observación,
 *    repuestos usados y, si encontró un problema, la falla ahí mismo.
 *  - Más › Plan preventivo (admin): crear tareas por máquina o para todas las de un tipo.
 */
import { h, poner, vacio, dato, aviso, conBoton, confirmar, abrirModal, cargando, avisoError, fecha, fechaHora, hoyISO, PRIORIDADES } from '../ui.js';
import { llamar, cargar } from '../api.js';
import { es, datosAlDia, invalidarDatos, recargarDatos } from '../estado.js';
import { ir, ponerTitulo } from '../app.js';
import { editorUsados } from '../repuestos-ui.js';

const DIAS_SEMANA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const CLASE_ESTADO = {
  'Vencida': 'prio-0', 'Hoy': 'prio-1', 'En curso': 'est-mant', 'Esta semana': 'est-ok',
  'Más adelante': 'inactiva', 'Esperando reparación': 'est-reparacion', 'Hecho': 'est-ok', 'Programada': 'inactiva'
};
const ICONO_ESTADO = { 'Vencida': '⏰', 'Hoy': '📌', 'En curso': '🔧', 'Esta semana': '📅', 'Más adelante': '🗓️', 'Esperando reparación': '⏸️' };

export const etiquetaEstadoPrev = (e, dias) => h('span', { class: 'etiqueta ' + (CLASE_ESTADO[e] || '') },
  (ICONO_ESTADO[e] ? ICONO_ESTADO[e] + ' ' : '') + (e === 'Vencida' && dias ? 'Vencida hace ' + dias + (dias === 1 ? ' día' : ' días') : e));

/** Tarjeta de una tarea preventiva (para listas y la ficha de la máquina). */
export function tarjetaPreventivo(t) {
  return h('button', { class: 'tarjeta tarjeta-tocable maquina est-mant', onclick: () => ir('preventivo/' + t.id_tarea) },
    h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, '🔵 ' + t.tarea), etiquetaEstadoPrev(t.estado, t.dias_atraso)),
    h('div', { class: 'maquina-detalle' }, t.maquina + ' · ' + t.frecuencia_texto),
    h('div', { class: 'suave chico', style: { marginTop: '4px' } },
      t.estado === 'En curso' ? 'En curso' : 'Próxima: ' + fecha(t.proxima_fecha) + (t.ultima_fecha ? ' · última: ' + fecha(t.ultima_fecha) : '')));
}

// ============================================================
//  Registro › Preventivos: lista y calendario
// ============================================================

let vista = 'lista';
let mesCal = '';

export async function pantallaPreventivos(cont) {
  const cuerpo = h('div');
  const botones = h('div', { class: 'fila-botones', style: { marginBottom: '10px' } });

  async function dibujar() {
    poner(botones,
      h('button', { class: 'btn btn-chico ' + (vista === 'lista' ? '' : 'btn-secundario'), onclick: () => { vista = 'lista'; dibujar(); } }, '📋 Lista'),
      h('button', { class: 'btn btn-chico ' + (vista === 'calendario' ? '' : 'btn-secundario'), onclick: () => { vista = 'calendario'; dibujar(); } }, '🗓️ Calendario'));
    poner(cuerpo, cargando());
    try {
      const r = await llamar('listarPreventivos', mesCal ? { mes: mesCal } : {});
      if (!mesCal) mesCal = r.mes;
      poner(cuerpo, vista === 'lista' ? vistaLista(r) : vistaCalendario(r, (m) => { mesCal = m; dibujar(); }));
    } catch (e) { avisoError(e); poner(cuerpo, vacio(e.message)); }
  }

  poner(cont,
    es('admin') ? h('button', { class: 'btn btn-secundario', onclick: () => ir('admin/preventivo') }, '⚙️ Armar el plan preventivo') : null,
    botones, cuerpo);
  await dibujar();
}

function vistaLista(r) {
  if (!r.tareas.length && !r.hechos.length) {
    return vacio(es('admin') ? 'Todavía no hay tareas preventivas. Armá el plan desde "Armar el plan preventivo".' : 'Todavía no hay tareas preventivas cargadas.');
  }
  const grupos = ['En curso', 'Vencida', 'Hoy', 'Esperando reparación', 'Esta semana', 'Más adelante'];
  const titulos = { 'En curso': 'En curso', 'Vencida': 'Vencidas', 'Hoy': 'Para hoy', 'Esperando reparación': 'Esperando una reparación', 'Esta semana': 'Esta semana', 'Más adelante': 'Más adelante' };
  return [
    grupos.map(g => {
      const lista = r.tareas.filter(t => t.estado === g);
      return lista.length ? [h('h2', null, titulos[g] + ' (' + lista.length + ')'), lista.map(tarjetaPreventivo)] : null;
    }),
    r.hechos.length ? [h('h2', null, 'Hechos hace poco'), r.hechos.slice(0, 15).map(x =>
      h('button', { class: 'tarjeta tarjeta-tocable', onclick: () => ir('preventivo/' + x.id_tarea) },
        h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, '✅ ' + x.tarea),
          h('span', { class: 'etiqueta ' + (x.a_tiempo === 'SI' ? 'est-ok' : 'prio-1') }, x.a_tiempo === 'SI' ? 'A tiempo' : 'Atrasado')),
        h('div', { class: 'maquina-detalle' }, x.maquina + ' · ' + x.mecanico + ' · ' + fechaHora(x.fin)),
        x.id_incidente_generado ? h('div', { class: 'chico', style: { color: 'var(--rojo)' } }, '⚠️ Encontró una falla') : null))] : null
  ];
}

function vistaCalendario(r, cambiarMes) {
  const [a, m] = r.mes.split('-').map(Number);
  const nombreMes = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const mesRel = (n) => { const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const primerDia = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  const hoy = hoyISO();
  const detalle = h('div');

  const verDia = (clave) => {
    const items = r.calendario[clave] || [];
    poner(detalle, h('h2', null, fecha(clave + 'T12:00:00')),
      items.length ? items.map(x => h('button', { class: 'tarjeta tarjeta-tocable', onclick: () => ir('preventivo/' + x.id_tarea) },
        h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, x.tarea), etiquetaEstadoPrev(x.estado)),
        h('div', { class: 'maquina-detalle' }, x.maquina))) : vacio('Nada programado.'));
  };

  const celdas = [];
  for (let i = 0; i < primerDia; i++) celdas.push(h('div', { class: 'cal-dia vacio-dia' }));
  for (let d = 1; d <= diasMes; d++) {
    const clave = r.mes + '-' + String(d).padStart(2, '0');
    const items = r.calendario[clave] || [];
    const marca = items.some(x => x.estado === 'Vencida') ? 'vencida' : items.some(x => x.estado === 'Hecho') && items.every(x => x.estado === 'Hecho') ? 'hecho' : items.length ? 'hay' : '';
    celdas.push(h('button', { class: 'cal-dia ' + marca + (clave === hoy ? ' hoy' : ''), onclick: () => verDia(clave) },
      h('span', null, d), items.length ? h('small', null, items.length) : null));
  }
  return [
    h('div', { class: 'fila', style: { marginBottom: '8px' } },
      h('button', { class: 'btn btn-chico btn-secundario', onclick: () => cambiarMes(mesRel(-1)) }, '‹'),
      h('span', { class: 'negrita crece centro', style: { textTransform: 'capitalize' } }, nombreMes),
      h('button', { class: 'btn btn-chico btn-secundario', onclick: () => cambiarMes(mesRel(1)) }, '›')),
    h('div', { class: 'cal' }, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => h('div', { class: 'cal-cab' }, x)), celdas),
    h('p', { class: 'suave chico' }, 'Tocá un día para ver qué toca. 🔴 vencido · 🟢 hecho · 🔵 programado'),
    detalle
  ];
}

// ============================================================
//  Detalle de una tarea
// ============================================================

export async function pantallaPreventivo(cont, [idTarea]) {
  const t = await llamar('detallePreventivo', { id_tarea: idTarea });
  ponerTitulo('Preventivo · ' + t.maquina);
  const recargar = () => ir('preventivo/' + idTarea);
  const acciones = [];

  if (t.estado === 'En curso') {
    acciones.push(h('button', { class: 'btn btn-verde', onclick: () => ir('terminar-preventivo/' + idTarea) }, '✅ Terminar preventivo'));
  } else if (t.estado === 'Esperando reparación') {
    acciones.push(h('div', { class: 'tarjeta', style: { background: 'var(--amarillo-claro)' } },
      '⏸️ ' + t.maquina + ' tiene una falla abierta: el preventivo espera a que se repare (no cuenta como atrasado).'));
  } else {
    acciones.push(h('button', {
      class: 'btn btn-amarillo', onclick: async (ev) => {
        const b = ev.currentTarget;
        const ok = await confirmar({ titulo: 'Empezar preventivo', texto: 'Mientras lo hacés, ' + t.maquina + ' queda "En mantenimiento".', si: 'Sí, empiezo' });
        if (!ok) return;
        await conBoton(b, async () => { const r = await cargar('empezarPreventivo', { id_tarea: idTarea }); aviso(r.mensaje, 'ok'); invalidarDatos(); recargar(); });
      }
    }, '🔧 Empezar preventivo'));
    acciones.push(h('button', { class: 'btn btn-secundario', onclick: () => posponer(t, recargar) }, '📅 Posponer'));
  }
  if (es('admin')) acciones.push(h('button', { class: 'btn btn-secundario', onclick: () => editarTarea(t, recargar) }, '✏️ Editar tarea'));
  acciones.push(h('button', { class: 'btn btn-secundario', onclick: () => ir('maquina/' + t.id_maquina) }, '🏭 Ver la máquina'));

  poner(cont,
    h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, '🔵 ' + t.tarea), etiquetaEstadoPrev(t.estado, t.dias_atraso)),
      t.descripcion ? h('p', null, t.descripcion) : null,
      dato('Máquina', t.maquina),
      dato('Frecuencia', t.frecuencia_texto),
      dato('Próxima', fecha(t.proxima_fecha)),
      dato('Última vez', t.ultima_fecha ? fecha(t.ultima_fecha) : 'Nunca')),
    t.pasos.length ? [h('h2', null, 'Pasos'), h('div', { class: 'tarjeta' }, h('ol', { class: 'pasos' }, t.pasos.map(p => h('li', null, p))))] : null,
    acciones,
    t.historial.length ? [h('h2', null, 'Historial'), t.historial.map(x => h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, x.estado === 'Pospuesto' ? '📅 Pospuesto' : x.estado === 'En curso' ? '🔧 En curso' : '✅ Hecho'),
        x.estado === 'Hecho' ? h('span', { class: 'etiqueta ' + (x.a_tiempo === 'SI' ? 'est-ok' : 'prio-1') }, x.a_tiempo === 'SI' ? 'A tiempo' : 'Atrasado') : null),
      h('div', { class: 'suave chico' }, x.mecanico + ' · ' + fechaHora(x.estado === 'Hecho' ? x.fin : x.inicio) + ' · tocaba el ' + fecha(x.vencia)),
      x.estado === 'Pospuesto' ? h('p', { class: 'chico' }, 'Para el ' + fecha(x.nueva_fecha) + ': ' + x.motivo) : null,
      x.observacion ? h('p', { class: 'chico' }, x.observacion) : null,
      x.pasos_resultado ? h('pre', { class: 'pasos-resultado' }, x.pasos_resultado) : null,
      x.id_incidente_generado ? h('div', { class: 'chico', style: { color: 'var(--rojo)' } }, '⚠️ Encontró una falla (' + x.id_incidente_generado + ')') : null))] : null);
}

function posponer(t, alCambiar) {
  const nueva = h('input', { type: 'date', min: hoyISO(1), value: hoyISO(1) });
  const motivo = h('input', { type: 'text', placeholder: 'Ej: producción no puede parar la máquina', maxlength: 300 });
  abrirModal(cerrar => [
    h('h2', null, 'Posponer'),
    h('p', null, t.tarea + ' · ' + t.maquina),
    h('label', { class: 'campo' }, h('span', null, 'Nueva fecha'), nueva),
    h('label', { class: 'campo' }, h('span', null, '¿Por qué?'), motivo),
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        const r = await cargar('posponerPreventivo', { id_tarea: t.id_tarea, nueva_fecha: nueva.value, motivo: motivo.value.trim() });
        aviso(r.mensaje, 'ok');
        cerrar();
        alCambiar();
      })
    }, 'Posponer'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
  ]);
}

// ============================================================
//  Terminar (pasos, observación, repuestos y falla encontrada)
// ============================================================

export async function pantallaTerminarPreventivo(cont, [idTarea]) {
  const [t, datos] = await Promise.all([llamar('detallePreventivo', { id_tarea: idTarea }), datosAlDia()]);
  if (t.estado !== 'En curso') throw new Error('Este preventivo no está en curso. Primero hay que tocar "Empezar preventivo".');
  ponerTitulo('Terminar · ' + t.maquina);

  const pasos = t.pasos.map(p => ({ paso: p, hecho: false, motivo: '' }));
  const cajaPasos = h('div');
  const dibujarPasos = () => poner(cajaPasos, pasos.map(p => h('div', { class: 'item-repuesto' + (p.hecho ? ' elegido' : '') },
    h('label', { class: 'check', style: { margin: 0 } },
      h('input', { type: 'checkbox', checked: p.hecho, onchange: (ev) => { p.hecho = ev.target.checked; dibujarPasos(); } }),
      h('span', { class: 'negrita' }, p.paso)),
    p.hecho ? null : h('input', { type: 'text', placeholder: 'Si no lo hiciste, ¿por qué?', value: p.motivo, style: { marginTop: '8px' },
      oninput: (ev) => { p.motivo = ev.target.value; } }))));
  dibujarPasos();

  const observacion = h('textarea', { placeholder: 'Cómo encontraste la máquina, qué hiciste…', maxlength: 2000 });
  const usados = editorUsados([t.catalogo], datos.stock);

  // ¿Encontró un problema? → falla
  let conFalla = false;
  let tipoFalla = '', prioridad = '';
  const cajaFalla = h('div');
  const descFalla = h('textarea', { placeholder: 'Qué problema encontraste', maxlength: 2000 });
  const dibujarFalla = () => poner(cajaFalla, conFalla ? h('div', { class: 'tarjeta', style: { background: 'var(--rojo-claro)' } },
    h('p', { class: 'negrita' }, 'Se va a cargar una falla en ' + t.maquina + ' (y se le avisa a Juan).'),
    h('div', { class: 'opciones dos' }, datos.tipos_falla.map(x => h('button', { class: 'opcion' + (x === tipoFalla ? ' elegida' : ''), type: 'button', onclick: () => { tipoFalla = x; dibujarFalla(); } }, x))),
    h('div', { class: 'opciones' }, PRIORIDADES.map((p, i) => h('button', { class: 'opcion prio-' + i + (p === prioridad ? ' elegida' : ''), type: 'button', onclick: () => { prioridad = p; dibujarFalla(); } }, p))),
    descFalla) : null);
  dibujarFalla();

  async function enviar(boton) {
    const sinMotivo = pasos.find(p => !p.hecho && !p.motivo.trim());
    if (sinMotivo) return aviso('El paso "' + sinMotivo.paso + '" quedó sin tildar: contá por qué.', 'error');
    if (conFalla && (!tipoFalla || !prioridad || !descFalla.value.trim())) return aviso('Completá la falla: tipo, prioridad y qué encontraste.', 'error');
    const ok = await confirmar({ titulo: 'Terminar preventivo', texto: '¿Terminaste "' + t.tarea + '"?', si: 'Sí, terminé', claseSi: 'btn btn-verde' });
    if (!ok) return;
    await conBoton(boton, async () => {
      const r = await cargar('terminarPreventivo', {
        id_tarea: idTarea, observacion: observacion.value.trim(), repuestos_usados: usados.leer(),
        pasos: pasos.map(p => ({ paso: p.paso, hecho: p.hecho, motivo: p.motivo.trim() })),
        falla: conFalla ? { tipo_falla: tipoFalla, prioridad, descripcion: descFalla.value.trim() } : undefined
      });
      aviso(r.mensaje, 'ok', 7);
      invalidarDatos();
      ir('inicio');
    });
  }

  poner(cont,
    h('div', { class: 'tarjeta' }, h('p', { class: 'negrita' }, '🔵 ' + t.tarea), t.descripcion ? h('p', { class: 'chico' }, t.descripcion) : null),
    pasos.length ? [h('h2', null, 'Pasos'), h('p', { class: 'suave chico' }, 'Tildá lo que hiciste.'), cajaPasos] : null,
    h('h2', null, 'Observación'), observacion,
    usados.elementos,
    h('h2', null, '¿Encontraste algún problema?'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', onchange: (ev) => { conFalla = ev.target.checked; dibujarFalla(); } }),
      h('span', null, 'Sí, cargar una falla')),
    cajaFalla,
    h('div', { class: 'separador' }),
    h('button', { class: 'btn btn-verde', onclick: (ev) => enviar(ev.currentTarget) }, '✅ Terminar preventivo'),
    h('button', { class: 'btn btn-secundario', onclick: () => history.back() }, 'Cancelar'));
}

// ============================================================
//  Más › Plan preventivo (solo admin)
// ============================================================

/** Campos de una tarea (alta o edición). Devuelve { elementos, leer() }. */
function formularioTarea(t, datos) {
  const nueva = !t;
  let aplicar = 'maquina';
  const maquinas = datos.maquinas.filter(m => m.activa === 'SI' && m.sector !== 'Externas')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  const tipos = [...new Set(maquinas.map(m => m.tipo))].sort((a, b) => a.localeCompare(b, 'es'));
  const selMaquina = h('select', null, h('option', { value: '' }, 'Elegí la máquina…'), maquinas.map(m => h('option', { value: m.id_maquina }, m.nombre)));
  const selTipo = h('select', null, h('option', { value: '' }, 'Elegí el tipo…'),
    tipos.map(x => h('option', { value: x }, x + ' (' + maquinas.filter(m => m.tipo === x).length + ' máquinas)')));
  const cajaAplicar = h('div');
  const dibujarAplicar = () => poner(cajaAplicar,
    h('div', { class: 'opciones dos' },
      h('button', { class: 'opcion' + (aplicar === 'maquina' ? ' elegida' : ''), type: 'button', onclick: () => { aplicar = 'maquina'; dibujarAplicar(); } }, 'Una máquina'),
      h('button', { class: 'opcion' + (aplicar === 'tipo' ? ' elegida' : ''), type: 'button', onclick: () => { aplicar = 'tipo'; dibujarAplicar(); } }, 'Todas las de un tipo')),
    aplicar === 'maquina' ? selMaquina : selTipo);
  if (nueva) dibujarAplicar();

  const nombre = h('input', { type: 'text', placeholder: 'Ej: Lubricar rodamientos', maxlength: 120, value: t ? t.tarea : '' });
  const descripcion = h('textarea', { placeholder: 'Detalle (opcional)', maxlength: 2000, style: { minHeight: '70px' } });
  descripcion.value = t ? t.descripcion || '' : '';
  const pasos = h('textarea', { placeholder: 'Un paso por línea (opcional)\nEj: Limpiar graseras\nEngrasar rodamientos', style: { minHeight: '90px' } });
  pasos.value = t ? t.pasos.join('\n') : '';

  let frecuencia = t ? t.frecuencia : 'Cada X días';
  const cadaDias = h('input', { type: 'number', min: 1, max: 3650, value: t && t.cada_dias ? t.cada_dias : 7 });
  const diaSemana = h('select', null, DIAS_SEMANA.slice(1).map((d, i) => h('option', { value: i + 1, selected: t && Number(t.dia_semana) === i + 1 }, d)));
  const diaMes = h('input', { type: 'number', min: 1, max: 28, value: t && t.dia_mes ? t.dia_mes : 1 });
  const primera = h('input', { type: 'date', value: nueva ? hoyISO() : '' });
  const cajaFrecuencia = h('div');
  const dibujarFrecuencia = () => poner(cajaFrecuencia,
    h('div', { class: 'opciones' }, ['Cada X días', 'Semanal', 'Mensual'].map(f =>
      h('button', { class: 'opcion' + (f === frecuencia ? ' elegida' : ''), type: 'button', onclick: () => { frecuencia = f; dibujarFrecuencia(); } },
        f === 'Cada X días' ? 'Cada tantos días (desde la última vez)' : f === 'Semanal' ? 'Todas las semanas, un día fijo' : 'Todos los meses, un día fijo'))),
    frecuencia === 'Cada X días' ? h('label', { class: 'campo' }, h('span', null, 'Cada cuántos días'), cadaDias)
      : frecuencia === 'Semanal' ? h('label', { class: 'campo' }, h('span', null, 'Qué día'), diaSemana)
        : h('label', { class: 'campo' }, h('span', null, 'Qué día del mes (1 a 28)'), diaMes));
  dibujarFrecuencia();

  return {
    elementos: [
      nueva ? [h('h3', null, '¿A qué máquinas?'), cajaAplicar] : h('p', { class: 'suave' }, t.maquina),
      h('label', { class: 'campo' }, h('span', null, 'Tarea'), nombre),
      h('label', { class: 'campo' }, h('span', null, 'Detalle'), descripcion),
      h('label', { class: 'campo' }, h('span', null, 'Pasos para tildar'), pasos),
      h('h3', null, 'Frecuencia'), cajaFrecuencia,
      h('label', { class: 'campo' }, h('span', null, nueva ? 'Primera vez' : 'Cambiar la próxima fecha (opcional)'), primera)
    ],
    leer: () => ({
      aplicar, id_maquina: selMaquina.value, tipo: selTipo.value, tarea: nombre.value.trim(), descripcion: descripcion.value.trim(),
      pasos: pasos.value.split('\n').map(x => x.trim()).filter(Boolean), frecuencia,
      cada_dias: Number(cadaDias.value), dia_semana: Number(diaSemana.value), dia_mes: Number(diaMes.value),
      primera_fecha: primera.value || undefined
    })
  };
}

function editarTarea(t, alCambiar) {
  datosAlDia().then(datos => {
    const form = formularioTarea(t, datos);
    abrirModal(cerrar => [
      h('h2', null, 'Editar tarea'),
      form.elementos,
      h('button', {
        class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
          const d = form.leer();
          const r = await cargar('guardarPreventivo', Object.assign(d, { id_tarea: t.id_tarea, aplicar: undefined }));
          aviso(r.mensaje, 'ok');
          cerrar();
          alCambiar();
        })
      }, 'Guardar'),
      h('button', {
        class: 'btn btn-peligro', onclick: async (ev) => {
          const b = ev.currentTarget;
          const ok = await confirmar({ titulo: 'Desactivar tarea', texto: 'La tarea deja de aparecer. Su historial queda guardado.', si: 'Desactivar', claseSi: 'btn btn-rojo' });
          if (!ok) return;
          await conBoton(b, async () => {
            const d = form.leer();
            await cargar('guardarPreventivo', Object.assign(d, { id_tarea: t.id_tarea, aplicar: undefined, primera_fecha: undefined, activa: 'NO' }));
            aviso('Tarea desactivada.', 'ok');
            cerrar();
            ir('admin/preventivo');
          });
        }
      }, 'Desactivar tarea'),
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
    ]);
  });
}

export async function pantallaPlanPreventivo(cont) {
  const [r, datos] = await Promise.all([llamar('listarPreventivos', {}), recargarDatos()]);
  const porMaquina = {};
  r.tareas.forEach(t => { (porMaquina[t.maquina] = porMaquina[t.maquina] || []).push(t); });
  const maquinas = Object.keys(porMaquina).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  const nueva = () => {
    const form = formularioTarea(null, datos);
    abrirModal(cerrar => [
      h('h2', null, 'Nueva tarea preventiva'),
      form.elementos,
      h('button', {
        class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
          const res = await cargar('guardarPreventivo', form.leer());
          aviso(res.mensaje, 'ok');
          cerrar();
          ir('admin/preventivo');
        })
      }, 'Crear tarea'),
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
    ]);
  };

  poner(cont,
    h('button', { class: 'btn', onclick: nueva }, '+ Nueva tarea preventiva'),
    h('p', { class: 'suave chico' }, 'Podés crear una tarea para una máquina o para todas las de un tipo de una vez. Los equipos de Externas no llevan preventivo.'),
    maquinas.length ? maquinas.map(m => [h('h2', null, m + ' (' + porMaquina[m].length + ')'), porMaquina[m].map(tarjetaPreventivo)])
      : vacio('Todavía no hay tareas. Cuando estén cargadas todas las máquinas, te propongo un plan inicial por tipo de máquina.'));
}
