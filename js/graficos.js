/**
 * ============================================================
 *  Voglia Mantenimiento — graficos.js
 *  Gráficos livianos hechos con HTML (sin librerías, andan sin conexión).
 *  Reglas (guía de visualización):
 *   - Una sola serie por gráfico → un solo color, sin leyenda (el título la nombra).
 *   - Barras finas (≤ 24 px), punta redondeada de 4 px, base recta, 2 px de aire.
 *   - Valor al final de la barra (texto en tinta normal, no del color de la serie).
 *   - Tocar/pasar sobre una barra muestra el detalle; "Ver como tabla" para leerlo exacto.
 *   - Nunca dos escalas en un mismo gráfico.
 * ============================================================
 */
import { h, poner } from './ui.js';

/**
 * Tarjeta con título, gráfico y "Ver como tabla".
 * items: [{ etiqueta, valor, texto? (lo que se muestra), detalle? (texto del tooltip) }]
 * tipo: 'barras' (horizontales, para rankings) | 'columnas' (para tiempo: meses, horas, días)
 */
export function grafico({ titulo, subtitulo, items, tipo = 'barras', vacioTexto = 'Sin datos en el período.', cadaEtiqueta = 1 }) {
  const cuerpo = h('div');
  let comoTabla = false;
  const tooltip = h('div', { class: 'graf-tooltip', role: 'status', 'aria-live': 'polite' });
  const mostrar = (it) => poner(tooltip, h('b', null, it.etiqueta), ': ' + (it.detalle || it.texto || it.valor));

  function dibujar() {
    if (!items.length || items.every(x => !x.valor)) return poner(cuerpo, h('p', { class: 'suave chico' }, vacioTexto));
    if (comoTabla) {
      return poner(cuerpo, h('table', { class: 'graf-tabla' },
        h('tbody', null, items.map(it => h('tr', null, h('td', null, it.etiqueta), h('td', { class: 'num' }, it.texto !== undefined ? it.texto : String(it.valor)))))));
    }
    const max = Math.max(...items.map(x => x.valor)) || 1;
    if (tipo === 'barras') {
      poner(cuerpo, h('div', { class: 'graf-barras', role: 'list' }, items.map(it =>
        h('button', {
          class: 'graf-fila', role: 'listitem', type: 'button', 'aria-label': it.etiqueta + ': ' + (it.texto || it.valor),
          onmouseenter: () => mostrar(it), onfocus: () => mostrar(it), onclick: () => mostrar(it)
        },
          h('span', { class: 'graf-eti' }, it.etiqueta),
          h('span', { class: 'graf-pista' },
            h('span', { class: 'graf-barra', style: { width: Math.max(1.5, it.valor / max * 100) + '%' } }),
            h('span', { class: 'graf-valor' }, it.texto !== undefined ? it.texto : String(it.valor)))))));
    } else {
      poner(cuerpo,
        h('div', { class: 'graf-columnas', role: 'list' }, items.map((it, i) =>
          h('button', {
            class: 'graf-col', role: 'listitem', type: 'button', 'aria-label': it.etiqueta + ': ' + (it.texto || it.valor),
            onmouseenter: () => mostrar(it), onfocus: () => mostrar(it), onclick: () => mostrar(it)
          },
            h('span', { class: 'graf-col-pista' }, h('span', { class: 'graf-col-barra', style: { height: (it.valor ? Math.max(2, it.valor / max * 100) : 0) + '%' } })),
            h('span', { class: 'graf-col-eti' }, i % cadaEtiqueta === 0 ? it.etiqueta : '')))),
        h('div', { class: 'graf-eje' }, 'Máximo: ' + (items.find(x => x.valor === max).texto || max)));
    }
  }
  dibujar();

  return h('div', { class: 'tarjeta grafico' },
    h('div', { class: 'fila' },
      h('h3', { class: 'crece', style: { margin: 0 } }, titulo),
      h('button', { class: 'btn-link chico', onclick: (ev) => { comoTabla = !comoTabla; ev.currentTarget.textContent = comoTabla ? 'Ver gráfico' : 'Ver como tabla'; dibujar(); } }, 'Ver como tabla')),
    subtitulo ? h('p', { class: 'suave chico', style: { margin: '2px 0 8px' } }, subtitulo) : null,
    cuerpo,
    tooltip);
}

/**
 * Número grande con comparación contra el mes anterior.
 * masEsMalo: si que suba es malo (fallas, horas paradas, costos) → ↑ en rojo; si no, ↑ en verde.
 * La comparación siempre va con flecha y texto (nunca solo color).
 */
export function numeroGrande({ titulo, valor, actual, anterior, masEsMalo = true, formato = String, ayuda }) {
  let comp = null;
  if (actual !== null && actual !== undefined && anterior !== null && anterior !== undefined) {
    const dif = actual - anterior;
    if (!dif) comp = h('span', { class: 'comp igual' }, '= igual que el mes anterior');
    else {
      const malo = masEsMalo ? dif > 0 : dif < 0;
      comp = h('span', { class: 'comp ' + (malo ? 'peor' : 'mejor') }, (dif > 0 ? '↑ ' : '↓ ') + formato(Math.abs(dif)) + ' vs. mes anterior');
    }
  }
  return h('div', { class: 'kpi' },
    h('span', { class: 'kpi-titulo' }, titulo),
    h('b', { class: 'kpi-valor' }, valor),
    comp,
    ayuda ? h('span', { class: 'kpi-ayuda' }, ayuda) : null);
}
