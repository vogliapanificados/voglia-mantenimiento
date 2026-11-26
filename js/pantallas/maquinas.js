/**
 * Listado de máquinas (con buscador y filtros por estado) y detalle de una máquina
 * con su falla abierta y las acciones que puede hacer cada rol.
 */
import {
  h, poner, vacio, dato, aviso, confirmar, conBoton, abrirModal,
  claseEstado, iconoEstado, etiquetaPrioridad, rangoPrioridad,
  fechaHora, hace, normalizar, ESTADOS
} from '../ui.js';
import { llamar, cargar } from '../api.js';
import { es, recargarDatos, invalidarDatos } from '../estado.js';
import { ir, ponerTitulo } from '../app.js';
import { abrirEditarMaquina } from './admin.js';
import { galeriaFotos } from '../fotos.js';
import { tarjetaTrabajo } from './trabajos.js';
import { marcarReciente } from './reportar.js';
import { tarjetaPreventivo } from './preventivo.js';

// Se recuerdan entre visitas a la pantalla
let textoBuscado = '';
let filtroEstado = 'Todas';
let filtroSector = 'Todos';

// ============================================================
//  Listado
// ============================================================

export async function pantallaMaquinas(cont) {
  const datos = await recargarDatos();
  const maquinas = datos.maquinas
    .filter(m => m.activa === 'SI')
    .sort((a, b) => ordenEstado(a) - ordenEstado(b) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));

  const lista = h('div');
  const filtros = h('div', { class: 'filtros' });
  const filtrosSector = h('div', { class: 'filtros' });
  const sectores = datos.sectores.map(s => s.sector).filter(s => maquinas.some(m => m.sector === s));
  if (maquinas.some(m => !m.sector)) sectores.push('Sin sector');
  if (filtroSector !== 'Todos' && !sectores.includes(filtroSector)) filtroSector = 'Todos';
  const buscador = h('input', {
    type: 'search', placeholder: '🔍 Buscar por nombre o tipo…', value: textoBuscado,
    oninput: (ev) => { textoBuscado = ev.target.value; dibujar(); }
  });

  function dibujar() {
    const t = normalizar(textoBuscado.trim());
    const enSector = (m) => filtroSector === 'Todos' || (m.sector || 'Sin sector') === filtroSector;
    const porTexto = maquinas.filter(m => enSector(m) &&
      (!t || normalizar(m.nombre + ' ' + m.tipo + ' ' + m.marca + ' ' + m.sector).includes(t)));

    poner(filtrosSector, sectores.length > 1 ? ['Todos', ...sectores].map(s =>
      h('button', { class: 'filtro' + (filtroSector === s ? ' elegido' : ''), onclick: () => { filtroSector = s; dibujar(); } },
        s === 'Todos' ? 'Todos los sectores' : s)) : null);

    poner(filtros, ['Todas', ...ESTADOS].map(e => {
      const n = e === 'Todas' ? porTexto.length : porTexto.filter(m => m.estado === e).length;
      if (e === 'En mantenimiento' && !n && filtroEstado !== e) return null; // solo si hay alguna
      const texto = e === 'Todas' ? 'Todas' : e === 'Funcionando normalmente' ? '🟢 Funcionando' : iconoEstado(e) + ' ' + e;
      return h('button', { class: 'filtro' + (filtroEstado === e ? ' elegido' : ''), onclick: () => { filtroEstado = e; dibujar(); } },
        texto + ' (' + n + ')');
    }));

    const visibles = porTexto.filter(m => filtroEstado === 'Todas' || m.estado === filtroEstado);
    poner(lista, visibles.length ? visibles.map(tarjetaMaquina)
      : vacio(maquinas.length ? 'No hay máquinas que coincidan.' : 'Todavía no hay máquinas cargadas.' +
        (es('admin') ? ' Cargalas desde Admin › Máquinas o con la pestaña Importar de la planilla.' : '')));
  }

  dibujar();
  poner(cont, h('div', { class: 'buscador' }, buscador), filtrosSector, filtros, lista);
}

/** Primero las que tienen problemas (por prioridad), después las que funcionan. */
function ordenEstado(m) {
  if (!m.incidente) return m.estado === 'En mantenimiento' ? 50 : 100;
  return rangoPrioridad(m.incidente.prioridad) * 2 + (m.estado === 'En falla' ? 0 : 1);
}

export function tarjetaMaquina(m) {
  const inc = m.incidente;
  return h('button', { class: 'tarjeta tarjeta-tocable maquina ' + claseEstado(m.estado), onclick: () => ir('maquina/' + m.id_maquina) },
    h('div', { class: 'fila' },
      h('div', { class: 'maquina-nombre crece' }, m.nombre),
      h('span', { class: 'etiqueta etiqueta-estado' }, m.estado === 'Funcionando normalmente' ? 'Funcionando' : m.estado)),
    m.sector ? h('div', { class: 'maquina-detalle' }, '📍 ' + m.sector) : null,
    inc ? h('div', { class: 'maquina-detalle' },
      etiquetaPrioridad(inc.prioridad), ' ', inc.tipo_falla, ' · ', hace(inc.fecha_falla)) : null,
    inc && inc.mecanico ? h('div', { class: 'maquina-detalle' },
      '🔧 ' + inc.mecanico + ' trabajando ' + hace(inc.inicio_reparacion).replace('hace ', 'desde hace ')) : null);
}

// ============================================================
//  Detalle de una máquina
// ============================================================

export async function pantallaMaquina(cont, [idMaquina]) {
  const d = await llamar('detalleMaquina', { id_maquina: idMaquina });
  const m = d.maquina;
  marcarReciente(idMaquina);
  const inc = d.incidente;
  ponerTitulo(m.nombre);

  const activa = m.activa === 'SI';
  const externa = m.sector === 'Externas'; // la atiende un service: solo el admin la gestiona
  const puedeReparar = externa ? es('admin') : es('admin', 'mecanico');
  const recargar = () => { invalidarDatos(); ir('maquina/' + idMaquina); };

  const acciones = [];
  if (activa) {
    if (!inc) {
      acciones.push(h('button', { class: 'btn btn-rojo', onclick: () => ir('falla/' + idMaquina) }, '⚠️ Cargar falla'));
    } else {
      if (puedeReparar && m.estado === 'En falla') {
        acciones.push(h('button', {
          class: 'btn btn-amarillo',
          onclick: async (ev) => {
            const boton = ev.currentTarget; // hay que guardarlo antes del await (después queda vacío)
            const ok = await confirmar(externa
              ? { titulo: 'Llamé al service', texto: '¿Ya llamaste al service por ' + m.nombre + '? La máquina queda "En reparación" hasta que registres la visita.', si: 'Sí, ya llamé' }
              : { titulo: 'Empezar reparación', texto: '¿Empezás a trabajar en ' + m.nombre + '? Se le avisa a Juan.', si: 'Sí, empiezo' });
            if (!ok) return;
            await conBoton(boton, async () => {
              const r = await cargar('iniciarReparacion', { id_maquina: idMaquina });
              aviso(r.mensaje || 'Reparación iniciada.', 'ok');
              recargar();
            });
          }
        }, externa ? '📞 Llamé al service' : '🔧 Empezar reparación'));
      }
      if (puedeReparar && m.estado === 'En reparación' && externa) {
        acciones.push(h('button', { class: 'btn btn-verde', onclick: () => ir('cierre-externa/' + idMaquina) }, '✅ Registrar visita y cerrar'));
      } else if (puedeReparar && m.estado === 'En reparación') {
        acciones.push(h('button', { class: 'btn', onclick: () => ir('pedido/' + idMaquina) }, '🛒 Pedir repuestos'));
        acciones.push(h('button', { class: 'btn btn-verde', onclick: () => ir('cierre/' + idMaquina) }, '✅ Cerrar reparación'));
      }
      acciones.push(h('button', { class: 'btn btn-secundario', onclick: () => ir('falla/' + idMaquina) }, '➕ Agregar otra falla / nota'));
    }
  }
  if (activa && !externa && es('admin', 'encargado')) {
    acciones.push(h('button', { class: 'btn btn-secundario', onclick: () => ir('pedir-trabajo/' + idMaquina) }, '🛠️ Pedir un trabajo en esta máquina'));
  }
  acciones.push(h('button', { class: 'btn btn-secundario', onclick: () => ir('historial/' + idMaquina) }, '📋 Ver historial'));

  poner(cont,
    h('div', { class: 'estado-grande ' + claseEstado(m.estado) }, iconoEstado(m.estado) + ' ' + m.estado),
    d._pendiente ? h('p', { class: 'suave' }, '⏳ Incluye cargas que todavía se están enviando.') : null,
    d._armada_sin_conexion ? h('p', { class: 'suave' }, '📵 Sin conexión: se muestra lo básico de la máquina (el detalle completo aparece cuando vuelva la señal).') : null,
    !activa ? h('div', { class: 'tarjeta' }, h('span', { class: 'etiqueta inactiva' }, 'Dada de baja'),
      ' Esta máquina no aparece en el listado.') : null,
    externa && activa ? h('p', { class: 'suave chico' }, '🧰 Equipo de Externas: lo atiende un service externo' +
      (es('admin') ? '.' : '. Cargá la falla y Juan llama al service.')) : null,
    inc ? tarjetaIncidente(inc) : null,
    (d.trabajos || []).length ? [h('h2', null, 'Trabajos varios'), d.trabajos.map(tarjetaTrabajo)] : null,
    (d.preventivos || []).length && es('admin', 'mecanico') ? [h('h2', null, 'Preventivo'), d.preventivos.map(tarjetaPreventivo)] : null,
    acciones,
    tarjetaFicha(m, d.service),
    puedeReparar && activa && !externa ? seccionCatalogo(idMaquina, d.catalogo) : null);
}

/** Ficha técnica: sector, modelo, serie, año, datos eléctricos y (solo admin) service técnico. */
function tarjetaFicha(m, service) {
  const filas = [
    dato('Sector', m.sector || 'Sin sector'),
    dato('Modelo', m.modelo), dato('N° de serie', m.serie), dato('Año', m.anio),
    dato('Potencia', m.potencia), dato('Tensión', m.tension)
  ];
  return [
    h('h2', null, 'Ficha técnica'),
    h('div', { class: 'tarjeta' }, filas,
      service ? h('div', { class: 'dato' },
        h('span', null, 'Service técnico'),
        h('span', null, service.empresa + (service.contacto ? ' (' + service.contacto + ')' : ''),
          service.telefono ? h('div', null, h('a', { href: 'tel:' + service.telefono.replace(/[^\d+]/g, '') }, '📞 ' + service.telefono)) : null)) : null,
      es('admin') ? h('button', { class: 'btn-link', onclick: () => abrirEditarMaquina(m, () => { invalidarDatos(); ir('maquina/' + m.id_maquina); }) }, 'Editar ficha') : null)
  ];
}

/** Datos de la falla abierta: prioridad, descripción, notas, reparación y pedidos. */
export function tarjetaIncidente(inc) {
  // Agrupa los ítems de los pedidos por id_pedido
  const pedidos = {};
  (inc.pedidos || []).forEach(p => { (pedidos[p.id_pedido] = pedidos[p.id_pedido] || []).push(p); });

  return h('div', { class: 'tarjeta' },
    h('div', { class: 'fila' }, h('h3', { class: 'crece', style: { margin: 0 } }, 'Falla abierta'), etiquetaPrioridad(inc.prioridad)),
    h('p', { class: 'negrita' }, inc.tipo_falla),
    h('p', null, inc.descripcion),
    galeriaFotos(inc.fotos_falla),
    h('p', { class: 'suave chico' }, 'Cargó ' + inc.cargado_por + ' · ' + fechaHora(inc.fecha_falla) + ' (' + hace(inc.fecha_falla) + ')'),
    inc.mecanico ? h('p', { class: 'chico' }, '🔧 ' + inc.mecanico + ' empezó la reparación el ' + fechaHora(inc.inicio_reparacion)) : null,

    inc.notas && inc.notas.length ? [
      h('h3', null, 'Notas agregadas (' + inc.notas.length + ')'),
      h('ul', { class: 'lista' }, inc.notas.map(n => h('li', null,
        h('div', null, n.nota),
        galeriaFotos(n.fotos),
        h('div', { class: 'suave chico' }, n.tipo_falla + ' · ' + n.prioridad + (n.subio_prioridad === 'SI' ? ' ⬆️ subió la prioridad' : '')),
        h('div', { class: 'suave chico' }, n.cargado_por + ' · ' + fechaHora(n.fecha)))))
    ] : null,

    Object.keys(pedidos).length ? [
      h('h3', null, 'Repuestos pedidos'),
      h('ul', { class: 'lista' }, Object.values(pedidos).map(items => h('li', null,
        h('div', { class: 'suave chico' }, items[0].pedido_por + ' · ' + fechaHora(items[0].fecha)),
        items.map(p => h('div', null, '• ' + p.cantidad + ' × ' + p.repuesto + (p.medida ? ' (' + p.medida + ')' : '') + (p.detalle ? ' — ' + p.detalle : ''))))))
    ] : null);
}

/** Repuestos típicos de la máquina (admin y mecánico pueden agregar; solo admin quita). */
function seccionCatalogo(idMaquina, catalogoInicial) {
  let catalogo = catalogoInicial || [];
  const caja = h('div', { class: 'tarjeta' });

  const dibujar = () => poner(caja,
    h('div', { class: 'fila' },
      h('h3', { class: 'crece', style: { margin: 0 } }, 'Repuestos típicos'),
      h('button', { class: 'btn-link', onclick: agregar }, '+ Agregar')),
    catalogo.length
      ? h('ul', { class: 'lista' }, catalogo.map(r => h('li', { class: 'fila' },
          h('span', { class: 'crece' }, r.repuesto + (r.medida ? ' (' + r.medida + ')' : '')),
          es('admin') ? h('button', { class: 'btn-link', style: { color: 'var(--rojo)' }, onclick: () => quitar(r) }, 'Quitar') : null)))
      : h('p', { class: 'suave chico' }, 'Todavía no hay repuestos típicos para esta máquina.'));

  function agregar() {
    const nombre = h('input', { type: 'text', placeholder: 'Ej: Rodamiento' });
    const medida = h('input', { type: 'text', placeholder: 'Ej: 6204' });
    abrirModal(cerrar => [
      h('h2', null, 'Agregar repuesto típico'),
      h('label', { class: 'campo' }, h('span', null, 'Repuesto'), nombre),
      h('label', { class: 'campo' }, h('span', null, 'Medida / especificación (opcional)'), medida),
      h('button', {
        class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
          const r = await cargar('agregarRepuestoCatalogo', { id_maquina: idMaquina, repuesto: nombre.value, medida: medida.value });
          catalogo = r.catalogo;
          aviso(r.mensaje, r.agregado ? 'ok' : '');
          invalidarDatos();
          cerrar();
          dibujar();
        })
      }, 'Agregar'),
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
    ]);
    setTimeout(() => nombre.focus(), 50);
  }

  async function quitar(r) {
    const ok = await confirmar({ titulo: 'Quitar repuesto', texto: '¿Quitar "' + r.repuesto + '" de los repuestos típicos?', si: 'Sí, quitar', claseSi: 'btn btn-rojo' });
    if (!ok) return;
    try {
      await cargar('quitarRepuestoCatalogo', { id_repuesto: r.id_repuesto });
      catalogo = catalogo.filter(x => x.id_repuesto !== r.id_repuesto);
      invalidarDatos();
      dibujar();
    } catch (e) { aviso(e.message, 'error'); }
  }

  dibujar();
  return [h('h2', null, 'Catálogo'), caja];
}
