/**
 * Trabajos varios (no son fallas): lista, detalle, pedir, editar, cancelar,
 * empezar, pedir repuestos y terminar.
 *  - Piden: admin y encargados. Hacen: mecánico y admin.
 *  - Editan/cancelan (solo Pendiente): quien lo pidió o el admin (lo decide el backend: puede_modificar).
 */
import { h, poner, vacio, dato, aviso, conBoton, confirmar, abrirModal, fechaHora, hace } from '../ui.js';
import { llamar, cargar } from '../api.js';
import { es, datosAlDia, invalidarDatos } from '../estado.js';
import { ir, ponerTitulo } from '../app.js';
import { etiquetaUrgencia } from './tareas.js';
import { formularioPedido, editorUsados, nombreConMedida } from '../repuestos-ui.js';

const URGENCIAS = ['Urgente', 'Normal', 'Cuando se pueda'];
const AYUDA_URGENCIA = { 'Urgente': 'Hoy, apenas se pueda', 'Normal': 'En estos días', 'Cuando se pueda': 'Sin apuro' };
const CLASE_ESTADO = { 'Pendiente': 'prio-1', 'En curso': 'est-mant', 'Terminado': 'est-ok', 'Cancelado': 'inactiva' };

const etiquetaEstadoTrabajo = (e) => h('span', { class: 'etiqueta ' + (CLASE_ESTADO[e] || '') }, e);

/** Elección de urgencia con botones grandes. Devuelve { elemento, valor() }. */
function eleccionUrgencia(inicial) {
  let valor = inicial || '';
  const caja = h('div', { class: 'opciones' });
  const dibujar = () => poner(caja, URGENCIAS.map((u, i) =>
    h('button', { class: 'opcion prio-' + i + (u === valor ? ' elegida' : ''), type: 'button', onclick: () => { valor = u; dibujar(); } },
      h('div', { class: 'negrita' }, u), h('div', { class: 'suave chico' }, AYUDA_URGENCIA[u]))));
  dibujar();
  return { elemento: caja, valor: () => valor };
}

// ============================================================
//  Lista
// ============================================================

let filtro = 'activos';

export async function pantallaTrabajos(cont) {
  const lista = await llamar('listarTrabajos', { estado: filtro });
  const opciones = [['activos', 'Pendientes y en curso'], ['Terminado', 'Terminados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']];

  poner(cont,
    es('admin', 'encargado') ? h('button', { class: 'btn', onclick: () => ir('pedir-trabajo') }, '+ Pedir un trabajo') : null,
    h('div', { class: 'filtros' }, opciones.map(([v, t]) =>
      h('button', { class: 'filtro' + (filtro === v ? ' elegido' : ''), onclick: () => { filtro = v; ir('registro/trabajos'); } }, t))),
    lista.length ? lista.map(tarjetaTrabajo) : vacio(filtro === 'activos' ? '🟢 No hay trabajos pendientes.' : 'No hay trabajos.'));
}

export function tarjetaTrabajo(t) {
  return h('button', { class: 'tarjeta tarjeta-tocable', onclick: () => ir('trabajo/' + t.id_trabajo) },
    h('div', { class: 'fila' },
      h('span', { class: 'negrita crece' }, '🛠️ ' + t.donde),
      t.estado === 'Pendiente' ? etiquetaUrgencia(t.urgencia) : etiquetaEstadoTrabajo(t.estado)),
    h('div', { class: 'maquina-detalle' }, t.descripcion),
    h('div', { class: 'suave chico', style: { marginTop: '4px' } },
      t.estado === 'En curso' ? '🔧 ' + t.mecanico + ' · empezó ' + hace(t.inicio)
        : t.estado === 'Terminado' ? '✅ ' + t.mecanico + ' · ' + fechaHora(t.fin) + ' · llevó ' + t.tiempo_texto
          : 'Pidió ' + t.pedido_por + ' · ' + hace(t.fecha_pedido)));
}

// ============================================================
//  Pedir un trabajo (admin, encargado)
// ============================================================

export async function pantallaPedirTrabajo(cont, [idMaquina]) {
  const datos = await datosAlDia();
  const maquinas = datos.maquinas.filter(m => m.activa === 'SI' && m.sector !== 'Externas')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  const maquina = h('select', null,
    h('option', { value: '' }, 'No es sobre una máquina'),
    maquinas.map(m => h('option', { value: m.id_maquina, selected: m.id_maquina === idMaquina }, m.nombre)));
  const lugar = h('input', { type: 'text', placeholder: 'Ej: Depósito, vestuario, pasillo…', maxlength: 120 });
  const cajaLugar = h('label', { class: 'campo' }, h('span', null, '¿Dónde?'), lugar);
  const mostrarLugar = () => cajaLugar.classList.toggle('oculto', !!maquina.value);
  maquina.addEventListener('change', mostrarLugar);
  mostrarLugar();
  const descripcion = h('textarea', { placeholder: 'Qué hay que hacer', maxlength: 2000 });
  const urgencia = eleccionUrgencia('Normal');

  async function enviar(boton) {
    if (!maquina.value && !lugar.value.trim()) return aviso('Elegí la máquina o escribí dónde es.', 'error');
    if (!descripcion.value.trim()) return aviso('Contá qué hay que hacer.', 'error');
    await conBoton(boton, async () => {
      const r = await cargar('pedirTrabajo', {
        id_maquina: maquina.value || undefined, lugar: maquina.value ? undefined : lugar.value.trim(),
        descripcion: descripcion.value.trim(), urgencia: urgencia.valor()
      });
      aviso(r.mensaje || 'Trabajo pedido.', 'ok', 6);
      ir(idMaquina ? 'maquina/' + idMaquina : 'inicio');
    });
  }

  poner(cont,
    h('p', { class: 'suave' }, 'Para pedirle al mecánico algo que no es una falla: instalar, fabricar, mejorar, mover una máquina…'),
    h('label', { class: 'campo' }, h('span', null, 'Máquina'), maquina),
    cajaLugar,
    h('label', { class: 'campo' }, h('span', null, 'Qué hay que hacer'), descripcion),
    h('h2', null, 'Urgencia'), urgencia.elemento,
    h('button', { class: 'btn', onclick: (ev) => enviar(ev.currentTarget) }, 'Pedir trabajo'),
    h('button', { class: 'btn btn-secundario', onclick: () => history.back() }, 'Cancelar'));
}

// ============================================================
//  Detalle de un trabajo
// ============================================================

export async function pantallaTrabajo(cont, [idTrabajo]) {
  const t = await llamar('detalleTrabajo', { id_trabajo: idTrabajo });
  ponerTitulo('Trabajo · ' + t.donde);
  const puedeHacer = es('admin', 'mecanico');
  const recargar = () => ir('trabajo/' + idTrabajo);
  const acciones = [];

  if (puedeHacer && t.estado === 'Pendiente') {
    acciones.push(h('button', {
      class: 'btn btn-amarillo', onclick: async (ev) => {
        const boton = ev.currentTarget;
        const ok = await confirmar({
          titulo: 'Empezar trabajo',
          texto: t.id_maquina ? 'Mientras trabajás, ' + t.donde + ' queda "En mantenimiento".' : '¿Empezás este trabajo?',
          si: 'Sí, empiezo'
        });
        if (!ok) return;
        await conBoton(boton, async () => {
          const r = await cargar('empezarTrabajo', { id_trabajo: idTrabajo });
          aviso(r.mensaje, 'ok');
          invalidarDatos();
          recargar();
        });
      }
    }, '🔧 Empezar trabajo'));
  }
  if (puedeHacer && t.estado === 'En curso') {
    acciones.push(h('button', { class: 'btn', onclick: () => ir('pedido-trabajo/' + idTrabajo) }, '🛒 Pedir repuestos'));
    acciones.push(h('button', { class: 'btn btn-verde', onclick: () => ir('terminar-trabajo/' + idTrabajo) }, '✅ Terminar trabajo'));
  }
  if (t.puede_modificar) {
    acciones.push(h('button', { class: 'btn btn-secundario', onclick: () => editarTrabajo(t, recargar) }, '✏️ Cambiar'));
    acciones.push(h('button', {
      class: 'btn btn-peligro', onclick: () => {
        const motivo = h('input', { type: 'text', placeholder: 'Motivo (opcional)', maxlength: 500 });
        abrirModal(cerrar => [
          h('h2', null, 'Cancelar trabajo'),
          h('p', null, '¿Cancelás "' + t.descripcion + '"?'),
          h('label', { class: 'campo' }, motivo),
          h('button', {
            class: 'btn btn-rojo', onclick: (ev) => conBoton(ev.currentTarget, async () => {
              await cargar('cancelarTrabajo', { id_trabajo: idTrabajo, motivo: motivo.value.trim() });
              aviso('Trabajo cancelado.', 'ok');
              cerrar();
              recargar();
            })
          }, 'Sí, cancelar'),
          h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'No')
        ]);
      }
    }, 'Cancelar trabajo'));
  }
  if (t.id_maquina) acciones.push(h('button', { class: 'btn btn-secundario', onclick: () => ir('maquina/' + t.id_maquina) }, '🏭 Ver la máquina'));

  poner(cont,
    h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, '🛠️ ' + t.donde),
        t.estado === 'Pendiente' ? etiquetaUrgencia(t.urgencia) : etiquetaEstadoTrabajo(t.estado)),
      h('p', null, t.descripcion),
      dato('Estado', t.estado),
      dato('Urgencia', t.urgencia),
      dato('Pidió', t.pedido_por + ' · ' + fechaHora(t.fecha_pedido)),
      t.editado_por ? dato('Cambiado por', t.editado_por + ' · ' + fechaHora(t.fecha_edicion)) : null,
      t.mecanico ? dato('Lo hace', t.mecanico) : null,
      t.inicio ? dato('Empezó', fechaHora(t.inicio)) : null,
      t.fin ? dato('Terminó', fechaHora(t.fin)) : null,
      t.tiempo_texto ? dato('Tiempo', t.tiempo_texto) : null,
      t.cancelado_por ? dato('Cancelado por', t.cancelado_por + (t.motivo_cancelacion ? ' · ' + t.motivo_cancelacion : '')) : null),
    t.trabajo_realizado ? [h('h2', null, 'Qué se hizo'), h('div', { class: 'tarjeta' }, t.trabajo_realizado)] : null,
    t.pedidos.length ? [h('h2', null, 'Repuestos pedidos'), h('div', { class: 'tarjeta' }, h('ul', { class: 'lista' }, t.pedidos.map(p =>
      h('li', null, p.cantidad + ' × ' + nombreConMedida(p) + (p.detalle ? ' — ' + p.detalle : ''),
        h('div', { class: 'suave chico' }, p.pedido_por + ' · ' + fechaHora(p.fecha))))))] : null,
    t.usados.length ? [h('h2', null, 'Repuestos usados'), h('div', { class: 'tarjeta' }, h('ul', { class: 'lista' }, t.usados.map(u =>
      h('li', null, u.cantidad + ' × ' + u.repuesto + (u.detalle ? ' — ' + u.detalle : '')))))] : null,
    h('div', { style: { height: '8px' } }),
    acciones);
}

function editarTrabajo(t, alCambiar) {
  const descripcion = h('textarea', { maxlength: 2000 });
  descripcion.value = t.descripcion;
  const urgencia = eleccionUrgencia(t.urgencia);
  abrirModal(cerrar => [
    h('h2', null, 'Cambiar trabajo'),
    h('label', { class: 'campo' }, h('span', null, 'Qué hay que hacer'), descripcion),
    h('h3', null, 'Urgencia'), urgencia.elemento,
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        await cargar('editarTrabajo', { id_trabajo: t.id_trabajo, descripcion: descripcion.value.trim(), urgencia: urgencia.valor() });
        aviso('Trabajo actualizado.', 'ok');
        cerrar();
        alCambiar();
      })
    }, 'Guardar'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
  ]);
}

// ============================================================
//  Pedir repuestos y terminar (admin, mecánico)
// ============================================================

async function traerEnCurso(idTrabajo) {
  const t = await llamar('detalleTrabajo', { id_trabajo: idTrabajo });
  if (t.estado !== 'En curso') throw new Error('Este trabajo no está en curso. Primero hay que tocar "Empezar trabajo".');
  return t;
}

export async function pantallaPedidoTrabajo(cont, [idTrabajo]) {
  const [t, datos] = await Promise.all([traerEnCurso(idTrabajo), datosAlDia()]);
  ponerTitulo('Pedir repuestos · ' + t.donde);
  const form = formularioPedido({ catalogo: t.catalogo, conMaquina: !!t.id_maquina, stock: datos.stock });

  async function enviar(boton) {
    const items = await form.confirmarEnvio();
    if (!items) return;
    await conBoton(boton, async () => {
      const r = await cargar('pedirRepuestosTrabajo', { id_trabajo: idTrabajo, items });
      aviso(r.mensaje || 'Pedido enviado.', 'ok', 5);
      ir('trabajo/' + idTrabajo);
    });
  }

  poner(cont,
    form.elementos,
    h('div', { class: 'separador' }),
    h('button', { class: 'btn', onclick: (ev) => enviar(ev.currentTarget) }, '🛒 Enviar pedido'),
    h('button', { class: 'btn btn-secundario', onclick: () => ir('trabajo/' + idTrabajo) }, 'Cancelar'));
}

export async function pantallaTerminarTrabajo(cont, [idTrabajo]) {
  const [t, datos] = await Promise.all([traerEnCurso(idTrabajo), datosAlDia()]);
  ponerTitulo('Terminar · ' + t.donde);
  const realizado = h('textarea', { placeholder: 'Qué hiciste', maxlength: 2000 });
  const usados = editorUsados([t.pedidos, t.catalogo], datos.stock);

  async function enviar(boton) {
    if (!realizado.value.trim()) return aviso('Contá qué hiciste.', 'error');
    const ok = await confirmar({ titulo: 'Terminar trabajo', texto: '¿Terminaste "' + t.descripcion + '"?', si: 'Sí, terminé', claseSi: 'btn btn-verde' });
    if (!ok) return;
    await conBoton(boton, async () => {
      const r = await cargar('terminarTrabajo', { id_trabajo: idTrabajo, trabajo_realizado: realizado.value.trim(), repuestos_usados: usados.leer() });
      aviso(r.mensaje || 'Trabajo terminado.', 'ok', 6);
      invalidarDatos();
      ir('trabajo/' + idTrabajo);
    });
  }

  poner(cont,
    h('div', { class: 'tarjeta' }, h('p', { class: 'negrita' }, t.descripcion), h('p', { class: 'suave chico' }, 'Empezó ' + hace(t.inicio) + ' · el tiempo se calcula solo')),
    h('h2', null, 'Qué hiciste'), realizado,
    usados.elementos,
    h('div', { class: 'separador' }),
    h('button', { class: 'btn btn-verde', onclick: (ev) => enviar(ev.currentTarget) }, '✅ Terminar trabajo'),
    h('button', { class: 'btn btn-secundario', onclick: () => ir('trabajo/' + idTrabajo) }, 'Cancelar'));
}
