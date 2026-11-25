/**
 * ============================================================
 *  Voglia Mantenimiento — repuestos-ui.js
 *  Piezas de pantalla que se repiten en reparaciones y trabajos:
 *   - formularioPedido: elegir repuestos del catálogo o agregar nuevos
 *   - editorUsados: cargar los repuestos usados (con sugerencias)
 * ============================================================
 */
import { h, poner, aviso, confirmar } from './ui.js';

export const nombreConMedida = (r) => r.repuesto + (r.medida ? ' (' + r.medida + ')' : '');

const claveRep = (repuesto, medida) => (String(repuesto || '') + '|' + String(medida || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Busca en el stock el mismo repuesto (nombre y medida). */
function enStock(stock, repuesto, medida) {
  return (stock || []).find(x => claveRep(x.repuesto, x.medida) === claveRep(repuesto, medida)) || null;
}

const textoStock = (s) => '📦 hay ' + s.cantidad + (s.unidad && s.unidad !== 'u' ? ' ' + s.unidad : '');

/** Campo de texto que guarda lo que se escribe en obj[prop]. */
function campo(obj, prop, props = {}) {
  return h('input', Object.assign({ type: 'text', value: obj[prop] || '', oninput: (ev) => { obj[prop] = ev.target.value; } }, props));
}

/**
 * Formulario de pedido de repuestos.
 * catalogo: repuestos típicos de la máquina ([] si no hay máquina).
 * conMaquina: si se ofrece "sumarlo a los repuestos típicos".
 * Devuelve { elementos, leer(), confirmarEnvio() } — confirmarEnvio() muestra el resumen
 * y devuelve los ítems si el usuario confirma (o null).
 */
export function formularioPedido({ catalogo = [], conMaquina = true, stock = [] }) {
  const elegidos = {};   // id_repuesto → ítem
  const nuevos = [];     // repuestos fuera del catálogo
  const cajaCatalogo = h('div');
  const cajaNuevos = h('div');

  function dibujarCatalogo() {
    poner(cajaCatalogo, catalogo.map(r => {
      const it = elegidos[r.id_repuesto];
      return h('div', { class: 'item-repuesto' + (it ? ' elegido' : '') },
        h('label', { class: 'check', style: { margin: 0 } },
          h('input', { type: 'checkbox', checked: !!it, onchange: () => {
            if (elegidos[r.id_repuesto]) delete elegidos[r.id_repuesto];
            else elegidos[r.id_repuesto] = { id_repuesto: r.id_repuesto, repuesto: r.repuesto, medida: r.medida || '', cantidad: '1', detalle: '' };
            dibujarCatalogo();
          } }),
          h('span', { class: 'negrita' }, nombreConMedida(r)),
          enStock(stock, r.repuesto, r.medida) ? h('span', { class: 'etiqueta est-ok', style: { marginLeft: '6px' } }, textoStock(enStock(stock, r.repuesto, r.medida))) : null),
        it ? h('div', { class: 'campos' },
          campo(it, 'cantidad', { inputmode: 'decimal', placeholder: 'Cant.', 'aria-label': 'Cantidad' }),
          campo(it, 'medida', { placeholder: 'Medida / especificación', 'aria-label': 'Medida' }),
          campo(it, 'detalle', { class: 'ancho', placeholder: 'Detalle (marca, urgencia, dónde comprar…)', 'aria-label': 'Detalle' })) : null);
    }));
  }

  function dibujarNuevos() {
    poner(cajaNuevos, nuevos.map((it, i) => h('div', { class: 'item-repuesto elegido' },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, 'Repuesto'),
        h('button', { class: 'btn-link', style: { color: 'var(--rojo)' }, onclick: () => { nuevos.splice(i, 1); dibujarNuevos(); } }, 'Quitar')),
      h('div', { class: 'campos' },
        campo(it, 'repuesto', { class: 'ancho', placeholder: 'Nombre del repuesto', 'aria-label': 'Repuesto' }),
        campo(it, 'cantidad', { inputmode: 'decimal', placeholder: 'Cant.', 'aria-label': 'Cantidad' }),
        campo(it, 'medida', { placeholder: 'Medida / especificación', 'aria-label': 'Medida' }),
        campo(it, 'detalle', { class: 'ancho', placeholder: 'Detalle (opcional)', 'aria-label': 'Detalle' })),
      conMaquina ? h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: it.agregar_catalogo, onchange: (ev) => { it.agregar_catalogo = ev.target.checked; } }),
        h('span', null, 'Sumarlo a los repuestos típicos de esta máquina')) : null)));
  }

  const agregarNuevo = () => { nuevos.push({ repuesto: '', cantidad: '1', medida: '', detalle: '', agregar_catalogo: conMaquina }); dibujarNuevos(); };
  dibujarCatalogo();
  if (!catalogo.length) agregarNuevo(); else dibujarNuevos();

  const leer = () => [...Object.values(elegidos), ...nuevos.filter(n => n.repuesto.trim())].map(it => ({
    id_repuesto: it.id_repuesto, repuesto: it.repuesto.trim(), cantidad: String(it.cantidad || '1').trim() || '1',
    medida: (it.medida || '').trim(), detalle: (it.detalle || '').trim(), agregar_catalogo: !!it.agregar_catalogo
  }));

  async function confirmarEnvio() {
    const items = leer();
    if (!items.length) { aviso('Elegí o agregá al menos un repuesto.', 'error'); return null; }
    const ok = await confirmar({
      titulo: 'Enviar pedido',
      texto: h('ul', { class: 'lista' }, items.map(it => h('li', null, it.cantidad + ' × ' + nombreConMedida(it) + (it.detalle ? ' — ' + it.detalle : '')))),
      si: 'Enviar a Juan'
    });
    return ok ? items : null;
  }

  return {
    elementos: [
      h('p', { class: 'suave' }, 'Elegí los repuestos que necesitás. Le llega el pedido a Juan por Telegram para mandar a comprarlos.'),
      catalogo.length ? [h('h2', null, 'Repuestos típicos de la máquina'), cajaCatalogo, h('h2', null, 'Otros repuestos')] : h('h2', null, 'Repuestos'),
      cajaNuevos,
      h('button', { class: 'btn btn-secundario', onclick: agregarNuevo }, catalogo.length ? '+ Agregar un repuesto que no está en la lista' : '+ Agregar otro repuesto')
    ],
    leer,
    confirmarEnvio
  };
}

/**
 * Repuestos usados. fuentes: listas de repuestos para sugerir (pedidos, catálogo).
 * Devuelve { elementos, leer() }.
 */
export function editorUsados(fuentes = [], stock = []) {
  const usados = [];
  const caja = h('div');

  // Sugerencias sin repetir
  const sugerencias = [];
  const vistos = new Set();
  fuentes.flat().forEach(r => {
    const texto = nombreConMedida(r);
    if (vistos.has(texto)) return;
    vistos.add(texto);
    sugerencias.push({ texto, cantidad: r.cantidad ? String(r.cantidad) : '1' });
  });

  function dibujar() {
    poner(caja, usados.length ? usados.map((it, i) => h('div', { class: 'item-repuesto elegido' },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, it.id_stock ? '📦 Del stock' : 'Repuesto usado'),
        h('button', { class: 'btn-link', style: { color: 'var(--rojo)' }, onclick: () => { usados.splice(i, 1); dibujar(); } }, 'Quitar')),
      h('div', { class: 'campos' },
        campo(it, 'repuesto', { class: 'ancho', placeholder: 'Repuesto', 'aria-label': 'Repuesto' }),
        campo(it, 'cantidad', { inputmode: 'decimal', placeholder: 'Cant.', 'aria-label': 'Cantidad' }),
        campo(it, 'detalle', { placeholder: 'Detalle (opcional)', 'aria-label': 'Detalle' }))))
      : h('p', { class: 'suave' }, 'Todavía no agregaste repuestos usados.'));
  }
  dibujar();
  const agregar = (repuesto = '', cantidad = '1', idStock = '') => {
    // Si ya está cargado ese mismo del stock, no se repite
    if (idStock && usados.some(u => u.id_stock === idStock)) return;
    usados.push({ repuesto, cantidad, detalle: '', id_stock: idStock });
    dibujar();
  };

  return {
    elementos: [
      h('h2', null, 'Repuestos usados'),
      (stock || []).length ? [
        h('p', { class: 'suave chico' }, 'Del stock (se descuenta solo):'),
        h('div', { class: 'filtros', style: { flexWrap: 'wrap' } }, stock.map(x =>
          h('button', { class: 'filtro', onclick: () => agregar(nombreConMedida(x), '1', x.id_stock) }, '+ ' + nombreConMedida(x) + ' · ' + textoStock(x))))
      ] : null,
      sugerencias.length ? [
        h('p', { class: 'suave chico' }, 'Pueden ser distintos de los que pediste. Tocá uno para agregarlo:'),
        h('div', { class: 'filtros', style: { flexWrap: 'wrap' } }, sugerencias.map(s =>
          h('button', { class: 'filtro', onclick: () => agregar(s.texto, s.cantidad) }, '+ ' + s.texto)))
      ] : null,
      caja,
      h('button', { class: 'btn btn-secundario', onclick: () => agregar() }, '+ Agregar otro repuesto')
    ],
    leer: () => usados.filter(u => u.repuesto.trim()).map(u => ({
      repuesto: u.repuesto.trim(), cantidad: String(u.cantidad || '1').trim() || '1', detalle: (u.detalle || '').trim(), id_stock: u.id_stock || undefined
    }))
  };
}
