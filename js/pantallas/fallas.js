/**
 * Sección "Fallas" (admin y mecánico): todas las fallas con filtros por estado,
 * sector, máquina, tipo, prioridad, causa, quién la cargó, fechas y texto.
 * El backend no le manda al mecánico las fallas de "Externas" y nunca manda costos.
 */
import {
  h, poner, vacio, cargando, avisoError, etiquetaPrioridad, etiquetaEstado, fechaHora, duracion, PRIORIDADES
} from '../ui.js';
import { llamar } from '../api.js';
import { datosAlDia, es } from '../estado.js';
import { ir } from '../app.js';

// Los filtros se recuerdan mientras la app está abierta
const filtros = { estado: 'abiertas', sector: '', id_maquina: '', tipo_falla: '', prioridad: '', causa: '', desde: '', hasta: '', texto: '' };
let verFiltros = false;

export async function pantallaFallas(cont) {
  const datos = await datosAlDia();
  const resultado = h('div');
  const cajaFiltros = h('div');

  const opcionesSelect = (lista, valor, todos) => [h('option', { value: '' }, todos),
    ...lista.map(x => typeof x === 'string'
      ? h('option', { value: x, selected: x === valor }, x)
      : h('option', { value: x.valor, selected: x.valor === valor }, x.texto))];
  const select = (campo, lista, todos) => h('select', { onchange: (ev) => { filtros[campo] = ev.target.value; buscar(); } },
    opcionesSelect(lista, filtros[campo], todos));

  const estados = [['abiertas', 'Abiertas'], ['En falla', '🔴 Sin atender'], ['En reparación', '🟡 En reparación'], ['cerradas', 'Cerradas'], ['', 'Todas']];

  function dibujarFiltros() {
    const activos = ['sector', 'id_maquina', 'tipo_falla', 'prioridad', 'causa', 'desde', 'hasta'].filter(k => filtros[k]).length;
    poner(cajaFiltros,
      h('div', { class: 'filtros' }, estados.map(([v, t]) =>
        h('button', { class: 'filtro' + (filtros.estado === v ? ' elegido' : ''), onclick: () => { filtros.estado = v; dibujarFiltros(); buscar(); } }, t))),
      h('input', {
        type: 'search', placeholder: '🔍 Buscar en máquina, descripción o trabajo…', value: filtros.texto,
        onchange: (ev) => { filtros.texto = ev.target.value.trim(); buscar(); }
      }),
      h('button', { class: 'btn-link', onclick: () => { verFiltros = !verFiltros; dibujarFiltros(); } },
        (verFiltros ? '▲ Menos filtros' : '▼ Más filtros') + (activos ? ' (' + activos + ' activos)' : '')),
      verFiltros ? h('div', { class: 'tarjeta' },
        h('label', { class: 'campo' }, h('span', null, 'Sector'), select('sector', datos.sectores.filter(s => !(s.externa && es('mecanico'))).map(s => s.sector), 'Todos los sectores')),
        h('label', { class: 'campo' }, h('span', null, 'Máquina'), select('id_maquina',
          datos.maquinas.map(m => ({ valor: m.id_maquina, texto: m.nombre })).sort((a, b) => a.texto.localeCompare(b.texto, 'es', { numeric: true })), 'Todas las máquinas')),
        h('label', { class: 'campo' }, h('span', null, 'Tipo de falla'), select('tipo_falla', datos.tipos_falla, 'Todos los tipos')),
        h('label', { class: 'campo' }, h('span', null, 'Prioridad'), select('prioridad', PRIORIDADES, 'Todas')),
        h('label', { class: 'campo' }, h('span', null, 'Causa'), select('causa', datos.causas || [], 'Todas las causas')),
        h('div', { class: 'opciones dos' },
          h('label', { class: 'campo', style: { margin: 0 } }, h('span', null, 'Desde'),
            h('input', { type: 'date', value: filtros.desde, onchange: (ev) => { filtros.desde = ev.target.value; buscar(); } })),
          h('label', { class: 'campo', style: { margin: 0 } }, h('span', null, 'Hasta'),
            h('input', { type: 'date', value: filtros.hasta, onchange: (ev) => { filtros.hasta = ev.target.value; buscar(); } }))),
        h('button', { class: 'btn btn-secundario', onclick: () => {
          Object.assign(filtros, { sector: '', id_maquina: '', tipo_falla: '', prioridad: '', causa: '', desde: '', hasta: '', texto: '' });
          dibujarFiltros(); buscar();
        } }, 'Limpiar filtros')) : null);
  }

  let consulta = 0;
  async function buscar() {
    const mia = ++consulta;
    poner(resultado, cargando());
    try {
      const r = await llamar('listarFallas', filtros);
      if (mia !== consulta) return;
      poner(resultado,
        h('p', { class: 'suave chico' }, r.total === 1 ? '1 falla' : r.total + ' fallas',
          r.total > r.fallas.length ? ' (se muestran las ' + r.fallas.length + ' más recientes)' : ''),
        r.fallas.length ? r.fallas.map(tarjetaFalla) : vacio('No hay fallas con estos filtros.'));
    } catch (e) {
      if (mia !== consulta) return;
      avisoError(e);
      poner(resultado, vacio(e.message));
    }
  }

  dibujarFiltros();
  poner(cont, cajaFiltros, resultado);
  await buscar();
}

function tarjetaFalla(f) {
  const estado = f.estado === 'Cerrado' ? h('span', { class: 'etiqueta est-ok' }, 'Cerrada') : etiquetaEstado(f.estado);
  const tiempo = f.estado === 'Cerrado'
    ? 'Fuera de servicio: ' + f.fuera_servicio_texto + (f.causa ? ' · Causa: ' + f.causa : '')
    : f.estado === 'En reparación'
      ? '🔧 ' + f.mecanico + (f.min_respuesta !== null ? ' · tardó ' + duracion(f.min_respuesta) + ' en empezar' : '')
      : 'Sin atender';
  return h('button', { class: 'tarjeta tarjeta-tocable', onclick: () => ir(f.estado === 'Cerrado' ? 'historial/' + f.id_maquina : 'maquina/' + f.id_maquina) },
    h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, f.maquina), estado),
    h('div', { style: { marginTop: '6px' } }, etiquetaPrioridad(f.prioridad), ' ', f.tipo_falla, f.con_fotos ? ' 📷' : '', f.cant_notas ? ' · ' + f.cant_notas + ' nota(s)' : ''),
    h('div', { class: 'maquina-detalle' }, f.descripcion),
    h('div', { class: 'suave chico', style: { marginTop: '4px' } },
      fechaHora(f.fecha_falla) + ' · ' + f.cargado_por + (f.sector ? ' · ' + f.sector : '')),
    h('div', { class: 'suave chico' }, tiempo));
}
