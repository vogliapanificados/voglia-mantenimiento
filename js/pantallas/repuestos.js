/**
 * Repuestos, costos y stock.
 *  - Más › Repuestos y stock (solo admin), con pestañas:
 *      Pedidos (cargar precio y proveedor; "entra a stock"; "no se compró")
 *      · Stock (alta, ingresos, ajustes, movimientos) · Usados · Catálogo · Sugeridos
 *  - Registro › Stock (mecánico): qué hay y cuánto, sin precios.
 */
import {
  h, poner, vacio, dato, aviso, conBoton, abrirModal, cargando, avisoError, fechaHora, pesos, normalizar, hoyISO
} from '../ui.js';
import { llamar, cargar } from '../api.js';
import { datosAlDia, invalidarDatos } from '../estado.js';
import { ir } from '../app.js';

const nombre = (r) => r.repuesto + (r.medida ? ' (' + r.medida + ')' : '');
const cant = (s) => s.cantidad + (s.unidad && s.unidad !== 'u' ? ' ' + s.unidad : '');

// ============================================================
//  Registro › Stock (mecánico; el admin lo ve en Más)
// ============================================================

export async function pantallaStockMecanico(cont) {
  const lista = await llamar('listarStock');
  let texto = '';
  const caja = h('div');
  const dibujar = () => {
    const t = normalizar(texto);
    const vis = lista.filter(s => !t || normalizar(nombre(s) + ' ' + s.ubicacion).includes(t));
    poner(caja, vis.length ? vis.map(s => h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, '📦 ' + nombre(s)),
        h('span', { class: 'etiqueta ' + (s.cantidad <= 0 ? 'prio-0' : s.bajo ? 'prio-1' : 'est-ok') }, 'Hay ' + cant(s))),
      s.ubicacion ? h('div', { class: 'suave chico' }, '📍 ' + s.ubicacion) : null))
      : vacio(lista.length ? 'No hay nada con ese nombre.' : 'Todavía no hay repuestos en stock.'));
  };
  dibujar();
  poner(cont,
    h('input', { type: 'search', placeholder: '🔍 Buscar repuesto…', oninput: (ev) => { texto = ev.target.value; dibujar(); } }),
    h('p', { class: 'suave chico' }, 'Al cargar los repuestos usados, elegí los del stock y se descuentan solos.'),
    caja);
}

// ============================================================
//  Más › Repuestos y stock (admin)
// ============================================================

const PESTANAS = [
  { clave: 'pedidos', texto: '🛒 Pedidos' }, { clave: 'stock', texto: '📦 Stock' }, { clave: 'usados', texto: '🔧 Usados' },
  { clave: 'catalogo', texto: '📚 Catálogo' }, { clave: 'sugeridos', texto: '💡 Sugeridos' }
];

export async function pantallaRepuestos(cont, [pedida]) {
  const clave = PESTANAS.some(p => p.clave === pedida) ? pedida : 'pedidos';
  const cuerpo = h('div');
  const FN = { pedidos: vistaPedidos, stock: vistaStock, usados: vistaUsados, catalogo: vistaCatalogo, sugeridos: vistaSugeridos };
  await FN[clave](cuerpo);
  poner(cont,
    h('div', { class: 'pestanas pestanas-scroll' }, PESTANAS.map(p =>
      h('button', { class: 'pestana' + (p.clave === clave ? ' elegida' : ''), onclick: () => ir('admin/repuestos/' + p.clave) }, p.texto))),
    cuerpo);
}

// ---------- Pedidos: precio y proveedor ----------

let filtroPedidos = 'sin_precio';

async function vistaPedidos(cont) {
  const [r, datos, proveedores] = await Promise.all([
    llamar('listarPedidosAdmin', { filtro: filtroPedidos }), datosAlDia(), llamar('listarProveedores')
  ]);
  const recargar = () => ir('admin/repuestos/pedidos');
  poner(cont,
    h('div', { class: 'filtros' },
      [['sin_precio', 'Sin precio'], ['todos', 'Todos']].map(([v, t]) =>
        h('button', { class: 'filtro' + (filtroPedidos === v ? ' elegido' : ''), onclick: () => { filtroPedidos = v; recargar(); } }, t))),
    filtroPedidos === 'todos' ? h('div', { class: 'tarjeta' }, dato('Total gastado en repuestos', pesos(r.total))) : null,
    r.pedidos.length ? r.pedidos.map(p => h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, '🛒 ' + p.maquina), p.total ? h('b', null, pesos(p.total)) : null),
      h('div', { class: 'suave chico' }, p.pedido_por + ' · ' + fechaHora(p.fecha) + ' · ' + p.id_pedido),
      h('ul', { class: 'lista' }, p.items.map(it => h('li', { class: 'fila' },
        h('div', { class: 'crece' },
          h('div', null, it.cantidad + ' × ' + nombre(it) + (it.detalle ? ' — ' + it.detalle : '')),
          h('div', { class: 'suave chico' },
            it.compra === 'Comprado' ? '✅ ' + pesos(it.costo_total) + (it.proveedor ? ' · ' + it.proveedor : '') + (it.id_stock ? ' · 📦 entró al stock' : '')
              : it.compra === 'No se compró' ? '✖️ No se compró' : '⏳ Sin precio')),
        h('button', { class: 'btn-link', onclick: () => cargarPrecio(it, datos.stock, proveedores, recargar) }, it.compra ? 'Cambiar' : 'Cargar precio'))))))
      : vacio(filtroPedidos === 'sin_precio' ? '👌 No hay pedidos sin precio.' : 'Todavía no hay pedidos.'));
}

function cargarPrecio(it, stock, proveedores, alCambiar) {
  let compra = it.compra || 'Comprado';
  const precio = h('input', { type: 'text', inputmode: 'numeric', placeholder: '$ por unidad',
    value: it.precio_unitario !== null && it.precio_unitario !== undefined ? Number(it.precio_unitario).toLocaleString('es-AR') : '' });
  const proveedor = h('select', null, h('option', { value: '' }, 'Sin proveedor'),
    proveedores.filter(p => p.activo === 'SI').map(p => h('option', { value: p.id_proveedor, selected: p.id_proveedor === it.id_proveedor }, p.nombre)));
  // Entra a stock: se propone el mismo repuesto si ya está en stock
  const igual = stock.find(s => normalizar(nombre(s)) === normalizar(nombre(it)));
  const entra = h('select', { disabled: !!it.id_stock },
    h('option', { value: '' }, it.id_stock ? 'Ya entró al stock' : 'No entra a stock'),
    stock.map(s => h('option', { value: s.id_stock, selected: !it.id_stock && igual && igual.id_stock === s.id_stock }, 'Sumar a: ' + nombre(s) + ' (hay ' + cant(s) + ')')),
    igual ? null : h('option', { value: 'nuevo' }, '+ Agregar "' + nombre(it) + '" al stock'));
  const cajaComprado = h('div');
  const opciones = h('div', { class: 'opciones dos' });
  const dibujar = () => {
    poner(opciones, ['Comprado', 'No se compró'].map(c =>
      h('button', { class: 'opcion' + (c === compra ? ' elegida' : ''), type: 'button', onclick: () => { compra = c; dibujar(); } }, c === 'Comprado' ? '✅ Se compró' : '✖️ No se compró')));
    cajaComprado.classList.toggle('oculto', compra !== 'Comprado');
  };
  poner(cajaComprado,
    h('label', { class: 'campo' }, h('span', null, 'Precio por unidad ($)'), precio),
    h('p', { class: 'suave chico', style: { marginTop: '-8px' } }, 'Se multiplica por la cantidad pedida (' + it.cantidad + ').'),
    h('label', { class: 'campo' }, h('span', null, 'Proveedor'), proveedor),
    h('label', { class: 'campo' }, h('span', null, '¿Entra a stock?'), entra));
  dibujar();

  abrirModal(cerrar => [
    h('h2', null, it.cantidad + ' × ' + nombre(it)),
    opciones,
    cajaComprado,
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        const r = await cargar('cargarPrecioPedido', {
          id_item: it.id_item, compra, precio_unitario: precio.value, id_proveedor: proveedor.value, entra_stock: entra.value || undefined
        });
        aviso(r.mensaje, 'ok', 5);
        invalidarDatos();
        cerrar();
        alCambiar();
      })
    }, 'Guardar'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
  ]);
}

// ---------- Stock ----------

async function vistaStock(cont) {
  const lista = await llamar('listarStock');
  const recargar = () => { invalidarDatos(); ir('admin/repuestos/stock'); };
  const activos = lista.filter(s => s.activo === 'SI');
  const bajos = activos.filter(s => s.bajo);
  poner(cont,
    h('button', { class: 'btn', onclick: () => editarStock(null, recargar) }, '+ Agregar repuesto al stock'),
    h('p', { class: 'suave chico' }, 'Solo se controla el stock de los repuestos que agregues acá. Mirá "💡 Sugeridos" para saber cuáles conviene tener.'),
    bajos.length ? [h('h2', null, '⚠️ Para reponer (' + bajos.length + ')'), bajos.map(s => tarjetaStock(s, recargar))] : null,
    h('h2', null, 'En stock (' + activos.length + ')'),
    activos.length ? activos.filter(s => !s.bajo).map(s => tarjetaStock(s, recargar)) : vacio('Todavía no hay repuestos en stock.'),
    lista.some(s => s.activo !== 'SI') ? [h('h2', null, 'Dados de baja'), lista.filter(s => s.activo !== 'SI').map(s => tarjetaStock(s, recargar))] : null);
}

function tarjetaStock(s, recargar) {
  return h('button', { class: 'tarjeta tarjeta-tocable', onclick: () => accionesStock(s, recargar) },
    h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, '📦 ' + nombre(s)),
      h('span', { class: 'etiqueta ' + (s.activo !== 'SI' ? 'inactiva' : s.cantidad <= 0 ? 'prio-0' : s.bajo ? 'prio-1' : 'est-ok') }, 'Hay ' + cant(s))),
    h('div', { class: 'suave chico' }, 'Mínimo: ' + s.minimo + (s.ubicacion ? ' · 📍 ' + s.ubicacion : '')));
}

function accionesStock(s, recargar) {
  const mover = (tipo) => {
    const n = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any' });
    const nota = h('input', { type: 'text', maxlength: 300, placeholder: tipo === 'Ingreso' ? 'Ej: compra en mostrador' : 'Ej: inventario del mes' });
    abrirModal(cerrar => [
      h('h2', null, (tipo === 'Ingreso' ? 'Ingreso · ' : 'Ajuste · ') + nombre(s)),
      h('p', { class: 'suave' }, tipo === 'Ingreso' ? 'Cuánto entra (se suma a lo que hay: ' + cant(s) + ').' : 'Cuánto hay realmente (contado). Hoy figura ' + cant(s) + '.'),
      h('label', { class: 'campo' }, h('span', null, tipo === 'Ingreso' ? 'Cantidad que entra' : 'Cantidad real'), n),
      h('label', { class: 'campo' }, h('span', null, 'Nota'), nota),
      h('button', {
        class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
          const r = await cargar('moverStock', { id_stock: s.id_stock, tipo, cantidad: n.value, nota: nota.value.trim() });
          aviso(r.mensaje, 'ok');
          cerrar();
          recargar();
        })
      }, 'Guardar'),
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
    ]);
  };
  const movimientos = async () => {
    const lista = await llamar('movimientosStock', { id_stock: s.id_stock });
    abrirModal(cerrar => [
      h('h2', null, 'Movimientos · ' + nombre(s)),
      lista.length ? h('ul', { class: 'lista' }, lista.map(m => h('li', null,
        h('div', { class: 'fila' }, h('span', { class: 'crece' }, m.tipo + (m.origen && m.origen !== 'manual' ? ' (' + m.origen + ')' : '')),
          h('b', null, (m.cantidad > 0 ? '+' : '') + m.cantidad + ' → ' + m.saldo)),
        h('div', { class: 'suave chico' }, fechaHora(m.fecha) + ' · ' + m.usuario + (m.nota ? ' · ' + m.nota : ''))))) : vacio('Sin movimientos.'),
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cerrar')
    ]);
  };
  abrirModal(cerrar => [
    h('h2', null, '📦 ' + nombre(s)),
    h('div', { class: 'tarjeta' }, dato('Hay', cant(s)), dato('Mínimo', String(s.minimo)), dato('Ubicación', s.ubicacion || '—')),
    s.activo === 'SI' ? [
      h('button', { class: 'btn', onclick: () => { cerrar(); mover('Ingreso'); } }, '➕ Registrar ingreso'),
      h('button', { class: 'btn btn-secundario', onclick: () => { cerrar(); mover('Ajuste'); } }, '🔢 Ajustar (inventario)')
    ] : null,
    h('button', { class: 'btn btn-secundario', onclick: () => { cerrar(); movimientos(); } }, '📜 Ver movimientos'),
    h('button', { class: 'btn btn-secundario', onclick: () => { cerrar(); editarStock(s, recargar); } }, '✏️ Editar'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cerrar')
  ]);
}

/** Alta o edición de un repuesto en stock. prellenado: { repuesto, medida, minimo } (desde Catálogo o Sugeridos). */
export function editarStock(s, alCambiar, prellenado) {
  const base = s || prellenado || {};
  const campo = (valor, props) => h('input', Object.assign({ type: 'text', value: valor === undefined || valor === null ? '' : String(valor) }, props));
  const repuesto = campo(base.repuesto, { maxlength: 120, placeholder: 'Ej: Rodamiento' });
  const medida = campo(base.medida, { maxlength: 120, placeholder: 'Ej: 6204' });
  const unidad = campo(base.unidad || 'u', { maxlength: 20, placeholder: 'u, kg, m, l…' });
  const minimo = campo(base.minimo === undefined ? 0 : base.minimo, { inputmode: 'decimal' });
  const ubicacion = campo(base.ubicacion, { maxlength: 120, placeholder: 'Ej: Estante A' });
  const inicial = s ? null : campo('', { inputmode: 'decimal', placeholder: '0' });
  abrirModal(cerrar => [
    h('h2', null, s ? 'Editar repuesto en stock' : 'Agregar repuesto al stock'),
    h('label', { class: 'campo' }, h('span', null, 'Repuesto'), repuesto),
    h('div', { class: 'opciones dos' },
      h('label', { class: 'campo' }, h('span', null, 'Medida'), medida),
      h('label', { class: 'campo' }, h('span', null, 'Unidad'), unidad)),
    h('div', { class: 'opciones dos' },
      h('label', { class: 'campo' }, h('span', null, 'Mínimo (avisa)'), minimo),
      inicial ? h('label', { class: 'campo' }, h('span', null, 'Hay ahora'), inicial) : h('span')),
    h('label', { class: 'campo' }, h('span', null, 'Ubicación'), ubicacion),
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        const r = await cargar('guardarStock', {
          id_stock: s ? s.id_stock : undefined, repuesto: repuesto.value.trim(), medida: medida.value.trim(), unidad: unidad.value.trim(),
          minimo: minimo.value, ubicacion: ubicacion.value.trim(), cantidad_inicial: inicial ? inicial.value : undefined
        });
        aviso(r.mensaje, 'ok');
        cerrar();
        alCambiar();
      })
    }, 'Guardar'),
    s ? h('button', {
      class: s.activo === 'SI' ? 'btn btn-peligro' : 'btn btn-secundario', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        await cargar('guardarStock', { id_stock: s.id_stock, repuesto: s.repuesto, medida: s.medida, unidad: s.unidad, minimo: s.minimo, ubicacion: s.ubicacion, activo: s.activo === 'SI' ? 'NO' : 'SI' });
        cerrar();
        alCambiar();
      })
    }, s.activo === 'SI' ? 'Dejar de controlar este stock' : 'Volver a controlarlo') : null,
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
  ]);
}

// ---------- Usados ----------

let filtroUsados = { texto: '', desde: '', hasta: '' };

async function vistaUsados(cont) {
  const caja = h('div');
  const buscar = async () => {
    poner(caja, cargando());
    try {
      const lista = await llamar('listarUsadosAdmin', filtroUsados);
      poner(caja, lista.length ? lista.map(u => h('div', { class: 'tarjeta' },
        h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, u.cantidad + ' × ' + u.repuesto), u.id_stock ? h('span', { class: 'etiqueta est-ok' }, '📦 del stock') : null),
        h('div', { class: 'maquina-detalle' }, u.maquina + (u.detalle ? ' · ' + u.detalle : '')),
        h('div', { class: 'suave chico' }, fechaHora(u.fecha) + ' · ' + u.cargado_por + ' · ' + ({ falla: 'reparación', trabajo: 'trabajo', preventivo: 'preventivo' }[u.origen] || 'reparación'))))
        : vacio('No hay repuestos usados con estos filtros.'));
    } catch (e) { avisoError(e); poner(caja, vacio(e.message)); }
  };
  poner(cont,
    h('input', { type: 'search', placeholder: '🔍 Repuesto o máquina…', value: filtroUsados.texto, onchange: (ev) => { filtroUsados.texto = ev.target.value.trim(); buscar(); } }),
    h('div', { class: 'opciones dos', style: { marginTop: '8px' } },
      h('label', { class: 'campo', style: { margin: 0 } }, h('span', null, 'Desde'), h('input', { type: 'date', value: filtroUsados.desde, onchange: (ev) => { filtroUsados.desde = ev.target.value; buscar(); } })),
      h('label', { class: 'campo', style: { margin: 0 } }, h('span', null, 'Hasta'), h('input', { type: 'date', value: filtroUsados.hasta || hoyISO(), onchange: (ev) => { filtroUsados.hasta = ev.target.value; buscar(); } }))),
    caja);
  await buscar();
}

// ---------- Catálogo general ----------

async function vistaCatalogo(cont) {
  const lista = await llamar('catalogoGeneral');
  const recargar = () => { invalidarDatos(); ir('admin/repuestos/catalogo'); };
  let texto = '';
  const caja = h('div');
  const dibujar = () => {
    const t = normalizar(texto);
    const vis = lista.filter(x => !t || normalizar(nombre(x) + ' ' + x.maquinas.join(' ')).includes(t));
    poner(caja, vis.length ? vis.map(x => h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, nombre(x)),
        x.en_stock !== null ? h('span', { class: 'etiqueta est-ok' }, '📦 hay ' + x.en_stock) : null),
      h('div', { class: 'maquina-detalle' }, 'Se usa en: ' + x.maquinas.join(', ')),
      h('div', { class: 'fila' },
        h('span', { class: 'suave chico crece' }, 'Pedido ' + x.veces_pedido + ' · usado ' + x.veces_usado + (x.veces_usado === 1 ? ' vez' : ' veces')),
        x.en_stock === null ? h('button', { class: 'btn-link', onclick: () => editarStock(null, recargar, { repuesto: x.repuesto, medida: x.medida }) }, '+ Al stock') : null)))
      : vacio('No hay repuestos con ese nombre.'));
  };
  dibujar();
  poner(cont,
    h('input', { type: 'search', placeholder: '🔍 Buscar repuesto o máquina…', oninput: (ev) => { texto = ev.target.value; dibujar(); } }),
    h('p', { class: 'suave chico' }, 'Todos los repuestos típicos de todas las máquinas. Se cargan desde la ficha de cada máquina.'),
    caja);
}

// ---------- Sugeridos para stock ----------

async function vistaSugeridos(cont) {
  const lista = await llamar('sugeridosStock');
  const recargar = () => { invalidarDatos(); ir('admin/repuestos/stock'); };
  poner(cont,
    h('p', { class: 'suave' }, 'Repuestos usados 2 veces o más en los últimos 3 meses. Stock sugerido = lo que se usa en un mes; mínimo = la mitad.'),
    lista.length ? lista.map(x => h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, '💡 ' + nombre(x)),
        x.en_stock !== null ? h('span', { class: 'etiqueta est-ok' }, '📦 hay ' + x.en_stock) : h('span', { class: 'etiqueta prio-1' }, 'Sin stock')),
      dato('Usado', x.veces + ' veces · ' + x.cantidad + ' u en 3 meses'),
      dato('Consumo por mes', String(x.consumo_mensual)),
      dato('Gastado', x.gasto ? x.gasto_texto : '—'),
      dato('Sugerido', 'tener ' + x.sugerido + ', mínimo ' + x.minimo_sugerido),
      h('div', { class: 'suave chico' }, 'En: ' + x.maquinas.join(', ')),
      x.en_stock === null ? h('button', {
        class: 'btn btn-secundario', style: { marginTop: '8px' },
        onclick: () => editarStock(null, recargar, { repuesto: x.repuesto, medida: x.medida, minimo: x.minimo_sugerido })
      }, '+ Empezar a stockearlo') : null))
      : vacio('Todavía no hay datos suficientes (se necesitan repuestos usados 2 veces o más). Volvé después del primer mes de uso.'));
}
