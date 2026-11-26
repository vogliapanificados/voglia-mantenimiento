/**
 * Indicadores (solo admin): un mes comparado con el anterior, filtro por sector,
 * rankings de máquinas, costos, preventivo, gráficos y el PDF mensual.
 * Definiciones en CLAUDE.md 13.1 ("Qué cuenta como tiempo parado", "Indicadores: detalles").
 */
import { h, poner, vacio, aviso, conBoton, cargando, avisoError, pesos, duracion, hoyISO } from '../ui.js';
import { llamar } from '../api.js';
import { ir } from '../app.js';
import { grafico, numeroGrande } from '../graficos.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (mes) => { const [a, m] = mes.split('-'); return MESES[Number(m) - 1] + ' ' + a; };
const mesCorto = (mes) => { const [a, m] = mes.split('-'); return MESES[Number(m) - 1].slice(0, 3) + ' ' + a.slice(2); };
const dur = (min) => (min === null || min === undefined ? '—' : duracion(min));

let mes = '';
let sector = '';

export async function pantallaIndicadores(cont) {
  const cuerpo = h('div');
  const selMes = h('input', { type: 'month', value: mes || hoyISO().slice(0, 7), max: hoyISO().slice(0, 7), onchange: (ev) => { mes = ev.target.value; cargar(); } });
  const selSector = h('select', { onchange: (ev) => { sector = ev.target.value; cargar(); } }, h('option', { value: '' }, 'Toda la planta'));

  async function cargar() {
    poner(cuerpo, cargando());
    try {
      const d = await llamar('indicadores', { mes: mes || undefined, sector: sector || undefined });
      mes = d.mes;
      selMes.value = d.mes;
      if (selSector.options.length === 1) d.sectores.forEach(s => selSector.appendChild(h('option', { value: s, selected: s === sector }, s)));
      poner(cuerpo, dibujar(d));
    } catch (e) { avisoError(e); poner(cuerpo, vacio(e.message)); }
  }

  poner(cont,
    h('div', { class: 'filtros-ind' }, selMes, selSector),
    cuerpo);
  await cargar();
}

function dibujar(d) {
  const k = d.kpi, a = d.anterior;
  const conSector = !!d.sector;
  return [
    h('p', { class: 'suave chico' }, nombreMes(d.mes) + ' · ' + (d.sector || 'toda la planta') + ' · comparado con ' + nombreMes(mesAnterior(d.mes))),

    // ---------- Ahora ----------
    d.abiertas.length ? h('button', { class: 'tarjeta tarjeta-tocable atencion', onclick: () => ir('planta') },
      h('div', { class: 'negrita' }, '⚠️ Ahora hay ' + d.abiertas.length + (d.abiertas.length === 1 ? ' falla abierta' : ' fallas abiertas')),
      h('div', { class: 'maquina-detalle' }, d.abiertas.slice(0, 3).map(x => x.maquina + ' (' + x.estado.toLowerCase() + ', hace ' + x.abierta_texto + ')').join(' · '))) : null,

    // ---------- Números principales ----------
    h('h2', null, 'Fallas y tiempos'),
    h('div', { class: 'kpis' },
      numeroGrande({ titulo: 'Fallas', valor: String(k.fallas), actual: k.fallas, anterior: a.fallas, ayuda: k.maquinas_con_fallas + ' máquina(s)' }),
      numeroGrande({ titulo: 'Tiempo parado', valor: dur(k.min_parada), actual: k.min_parada, anterior: a.min_parada, formato: duracion }),
      numeroGrande({ titulo: 'Tiempo medio de reparación', valor: dur(k.mttr), actual: k.mttr, anterior: a.mttr, formato: duracion, ayuda: 'MTTR · ' + k.reparaciones + ' reparaciones' }),
      numeroGrande({ titulo: 'Tiempo de respuesta', valor: dur(k.respuesta), actual: k.respuesta, anterior: a.respuesta, formato: duracion, ayuda: 'de la carga a empezar' }),
      numeroGrande({ titulo: 'Tiempo entre fallas', valor: dur(k.mtbf), actual: k.mtbf, anterior: a.mtbf, masEsMalo: false, formato: duracion, ayuda: 'MTBF (más es mejor)' })),

    h('h2', null, 'Costos'),
    h('div', { class: 'kpis' },
      numeroGrande({ titulo: 'Mantenimiento', valor: pesos(k.costo_mantenimiento), actual: k.costo_mantenimiento, anterior: a.costo_mantenimiento, formato: pesos,
        ayuda: 'repuestos ' + pesos(k.costo_repuestos) + ' + services ' + pesos(k.costo_services) }),
      conSector ? null : numeroGrande({ titulo: 'Mano de obra', valor: pesos(k.mano_obra), actual: k.mano_obra, anterior: a.mano_obra, formato: pesos,
        ayuda: 'mecánico ' + pesos(k.mano_obra_mecanico || 0) + ' + electricista ' + pesos(k.mano_obra_electricista || 0) }),
      conSector ? null : numeroGrande({ titulo: 'Total', valor: pesos(k.costo_total), actual: k.costo_total, anterior: a.costo_total, formato: pesos })),

    h('h2', null, 'Preventivo'),
    h('div', { class: 'kpis' },
      numeroGrande({ titulo: 'Hechos a tiempo', valor: k.prev_cumplimiento === null ? '—' : k.prev_cumplimiento + '%', actual: k.prev_cumplimiento, anterior: a.prev_cumplimiento,
        masEsMalo: false, formato: (n) => n + ' puntos', ayuda: k.prev_a_tiempo + ' a tiempo · ' + k.prev_atrasados + ' atrasados · ' + k.prev_vencidos + ' vencidos' }),
      numeroGrande({ titulo: 'Pospuestos', valor: String(k.prev_pospuestos), actual: k.prev_pospuestos, anterior: a.prev_pospuestos })),

    // ---------- Máquinas ----------
    h('h2', null, 'Máquinas'),
    grafico({ titulo: 'Las que más fallaron', subtitulo: 'Con el % acumulado: pocas máquinas suelen concentrar la mayoría de las fallas.',
      items: d.pareto.map(x => ({ etiqueta: x.maquina, valor: x.fallas, texto: x.fallas + ' · ' + x.acumulado + '%', detalle: x.fallas + ' fallas · ' + x.acumulado + '% acumulado' })) }),
    grafico({ titulo: 'Las que más tiempo estuvieron paradas', items: d.mas_parada.map(x => ({ etiqueta: x.maquina, valor: x.min_parada, texto: x.parada_texto })) }),
    grafico({ titulo: 'Las que más demoraron en repararse', subtitulo: 'Tiempo medio de reparación (MTTR).',
      items: d.mas_lentas.map(x => ({ etiqueta: x.maquina, valor: x.mttr, texto: x.mttr_texto, detalle: x.mttr_texto + ' en promedio · ' + x.reparaciones + ' reparación(es)' })) }),
    grafico({ titulo: 'Menos tiempo entre fallas', subtitulo: 'MTBF: las que fallan más seguido (menos es peor).',
      items: d.mtbf_maquinas.map(x => ({ etiqueta: x.maquina, valor: x.mtbf, texto: x.mtbf_texto })) }),
    grafico({ titulo: 'Costo por máquina', subtitulo: 'Repuestos con precio cargado + services externos.',
      items: d.costos_maquinas.map(x => ({ etiqueta: x.maquina, valor: x.costo, texto: x.costo_texto })) }),

    // ---------- Fallas ----------
    h('h2', null, 'Por qué y cuándo fallan'),
    grafico({ titulo: 'Por categoría (eléctrica, mecánica, otra)', items: d.por_categoria || [] }),
    grafico({ titulo: 'Por tipo de falla', items: d.por_tipo }),
    grafico({ titulo: 'Por causa', subtitulo: 'De las reparaciones cerradas en el mes.', items: d.por_causa }),
    conSector ? null : grafico({ titulo: 'Por sector', items: d.por_sector }),
    grafico({ titulo: 'Por hora del día', tipo: 'columnas', cadaEtiqueta: 3, items: d.por_hora.map(x => ({ etiqueta: x.etiqueta + ' h', valor: x.valor, texto: x.valor + ' falla(s)' })) }),
    grafico({ titulo: 'Por día de la semana', tipo: 'columnas', items: d.por_dia.map(x => ({ etiqueta: x.etiqueta, valor: x.valor, texto: x.valor + ' falla(s)' })) }),

    // ---------- Evolución ----------
    h('h2', null, 'Últimos 12 meses'),
    grafico({ titulo: 'Fallas por mes', tipo: 'columnas', cadaEtiqueta: 2, items: d.evolucion.map(e => ({ etiqueta: mesCorto(e.mes), valor: e.fallas, texto: e.fallas + ' fallas' })) }),
    grafico({ titulo: 'Horas paradas por mes', tipo: 'columnas', cadaEtiqueta: 2, items: d.evolucion.map(e => ({ etiqueta: mesCorto(e.mes), valor: e.horas_parada, texto: e.horas_parada + ' h' })) }),
    grafico({ titulo: 'Costo de mantenimiento por mes', tipo: 'columnas', cadaEtiqueta: 2, items: d.evolucion.map(e => ({ etiqueta: mesCorto(e.mes), valor: e.costo, texto: pesos(e.costo) })) }),

    // ---------- PDF ----------
    h('div', { class: 'separador' }),
    h('button', { class: 'btn', onclick: (ev) => descargarPdf(ev.currentTarget, d.mes) }, '📄 Descargar el informe PDF de ' + nombreMes(d.mes)),
    h('p', { class: 'suave chico' }, 'El PDF es de toda la planta y queda guardado en tu Drive (carpeta "Voglia Mantenimiento - Informes").')
  ];
}

function mesAnterior(m) {
  const [a, n] = m.split('-').map(Number);
  const d = new Date(Date.UTC(a, n - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

async function descargarPdf(boton, m) {
  await conBoton(boton, async () => {
    const r = await llamar('informeMensual', { mes: m });
    const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = h('a', { href: url, download: r.nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    aviso('Informe listo: ' + r.nombre, 'ok', 6);
  });
}
