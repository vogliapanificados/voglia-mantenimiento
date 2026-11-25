/**
 * Planta: el plano de la fábrica con las máquinas como puntos de color.
 *  - Solapas: Toda la planta · un sector por sala · Externas (lista, sin plano).
 *  - Tocar una sala en la vista general → zoom a ese sector (el resto atenuado).
 *  - Tocar un punto → ficha de la máquina.
 *  - Modo "Ubicar máquinas" (solo admin, dentro de un sector): arrastrar los
 *    puntos o elegir una máquina y tocar en el plano dónde está.
 * Las posiciones se guardan en % del plano completo (plano_x, plano_y).
 */
import { h, poner, vacio, aviso, avisoError, iconoEstado, ESTADOS } from '../ui.js';
import { cargar } from '../api.js';
import { es, recargarDatos, invalidarDatos } from '../estado.js';
import { ir } from '../app.js';
import { PLANO, recorteDeSector, salaDeSector, viewBoxVista } from '../datos/planos.js';
import { tarjetaMaquina } from './maquinas.js';

const NS = 'http://www.w3.org/2000/svg';
const TODA = 'Toda la planta';
const EXTERNAS = 'Externas';
const CLAVE_VISTA = 'voglia_planta_vista';
const COLOR = {
  'Funcionando normalmente': '#16a34a', 'En falla': '#dc2626',
  'En reparación': '#eab308', 'En mantenimiento': '#2563eb'
};

let textoSvg = null; // el plano se descarga una sola vez

async function traerPlano() {
  if (!textoSvg) {
    const r = await fetch(PLANO.archivo);
    if (!r.ok) throw new Error('No se pudo cargar el plano.');
    textoSvg = await r.text();
  }
  return textoSvg;
}

/** Crea un elemento SVG con atributos. */
function s(tag, attrs, ...hijos) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  });
  hijos.forEach(c => { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}

/** Rectángulo de una sala en unidades del dibujo. */
function rectSala(sala) {
  const z = recorteDeSector(sala);
  return z ? {
    x: z.x / 100 * PLANO.ancho, y: z.y / 100 * PLANO.alto,
    w: z.ancho / 100 * PLANO.ancho, h: z.alto / 100 * PLANO.alto
  } : null;
}

const enPlano = (m) => m.plano_x !== null && m.plano_x !== undefined && m.plano_y !== null && m.plano_y !== undefined;
const etiquetaCorta = (m) => m.tipo + ' ' + m.numero;

// ============================================================

export async function pantallaPlanta(cont) {
  const [datos, texto] = await Promise.all([recargarDatos(), traerPlano()]);
  const maquinas = datos.maquinas.filter(m => m.activa === 'SI');

  // Sectores de la planilla que tienen sala en el plano (en el orden de la planilla)
  const conSala = datos.sectores
    .map(sec => ({ sector: sec.sector, sala: salaDeSector(sec) }))
    .filter(x => x.sala);
  const verExternas = !es('mecanico') && datos.sectores.some(x => x.externa);
  const vistas = [TODA, ...conSala.map(x => x.sector), ...(verExternas ? [EXTERNAS] : [])];

  let vista = localStorage.getItem(CLAVE_VISTA);
  if (!vistas.includes(vista)) vista = TODA;
  let ubicando = false;
  let elegida = null; // id de la máquina elegida en modo ubicar

  const solapas = h('div', { class: 'filtros' });
  const caja = h('div');

  function cambiarVista(v) {
    vista = v;
    localStorage.setItem(CLAVE_VISTA, v);
    ubicando = false;
    elegida = null;
    dibujar();
  }

  function dibujar() {
    poner(solapas, vistas.map(v => h('button', { class: 'filtro' + (v === vista ? ' elegido' : ''), onclick: () => cambiarVista(v) },
      v === EXTERNAS ? '🧰 ' + v : v)),
      h('button', { class: 'filtro', onclick: () => ir('maquinas') }, '📋 Lista'));

    if (vista === EXTERNAS) { poner(caja, vistaExternas()); return; }
    const sector = vista === TODA ? null : conSala.find(x => x.sector === vista);
    poner(caja, vistaPlano(sector));
  }

  // ---------- Externas: lista ----------
  function vistaExternas() {
    const lista = maquinas.filter(m => m.sector === EXTERNAS);
    return [
      h('p', { class: 'suave chico' }, 'Equipos que controla un service externo. No van en el plano.'),
      lista.length ? lista.map(tarjetaMaquina) : vacio('No hay equipos en Externas.')
    ];
  }

  // ---------- Plano general o de un sector ----------
  function vistaPlano(sector) {
    const sala = sector ? sector.sala : null;
    const delaVista = sector ? maquinas.filter(m => m.sector === sector.sector) : maquinas.filter(m => m.sector !== EXTERNAS);
    const ubicadas = delaVista.filter(enPlano);
    const sinUbicar = delaVista.filter(m => !enPlano(m));

    // SVG del plano
    const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
    const svg = document.importNode(doc.documentElement, true);
    svg.querySelectorAll('metadata, title').forEach(n => n.remove());
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    const vb = sala ? viewBoxVista(sala, 0.75) : [0, 0, PLANO.ancho, PLANO.alto];
    svg.setAttribute('viewBox', vb.join(' '));
    svg.setAttribute('class', 'plano-svg' + (ubicando ? ' ubicando' : ''));
    svg.setAttribute('aria-label', sala ? 'Plano del sector ' + sector.sector : 'Plano de la planta');

    const radio = vb[2] * (sala ? 0.022 : 0.012);

    // Sala elegida: atenuar el resto del plano
    if (sala) {
      const r = rectSala(sala);
      svg.appendChild(s('path', {
        d: `M0 0H${PLANO.ancho}V${PLANO.alto}H0Z M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`,
        'fill-rule': 'evenodd', fill: '#f3f4f6', 'fill-opacity': '0.78', 'pointer-events': 'none'
      }));
    } else {
      // Vista general: tocar una sala hace zoom a ese sector
      conSala.forEach(x => {
        const r = rectSala(x.sala);
        svg.appendChild(s('rect', {
          x: r.x, y: r.y, width: r.w, height: r.h, fill: 'transparent', class: 'sala-tocable',
          onclick: () => cambiarVista(x.sector)
        }, s('title', null, 'Ver ' + x.sector)));
      });
    }

    // Puntos de las máquinas
    const capa = s('g', { class: 'puntos' });
    ubicadas.forEach(m => {
      const cx = m.plano_x / 100 * PLANO.ancho, cy = m.plano_y / 100 * PLANO.alto;
      const g = s('g', { class: 'punto' + (elegida === m.id_maquina ? ' elegido' : ''), 'data-id': m.id_maquina, transform: `translate(${cx} ${cy})` },
        s('circle', { r: radio * 2.2, fill: 'transparent' }), // zona de toque más grande
        s('circle', { r: radio, fill: COLOR[m.estado] || '#9ca3af', stroke: '#fff', 'stroke-width': radio * 0.3 }),
        // Titila: en falla rápido (es prioridad), en reparación más lento
        m.estado === 'En falla' || m.estado === 'En reparación'
          ? s('circle', {
              r: radio * 1.6, fill: 'none', stroke: COLOR[m.estado], 'stroke-width': radio * 0.3,
              class: m.estado === 'En falla' ? 'pulso pulso-rapido' : 'pulso'
            }) : null,
        sala ? s('text', {
          x: radio * 1.5, y: radio * 0.5, 'font-size': radio * 1.5, 'font-weight': 600, fill: '#1f2937',
          stroke: '#fff', 'stroke-width': radio * 0.45, 'paint-order': 'stroke'
        }, etiquetaCorta(m)) : null,
        s('title', null, m.nombre + ' · ' + m.estado));
      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (ubicando) { elegida = m.id_maquina; dibujar(); return; }
        ir('maquina/' + m.id_maquina);
      });
      if (ubicando) habilitarArrastre(g, m, svg, sala);
      capa.appendChild(g);
    });
    svg.appendChild(capa);

    // Modo ubicar: tocar en el plano pone la máquina elegida ahí
    if (ubicando) {
      svg.addEventListener('click', (ev) => {
        if (!elegida) return aviso('Primero elegí una máquina de la lista de abajo.', '', 3);
        const p = puntoEnPlano(svg, ev.clientX, ev.clientY);
        if (!p) return;
        const m = maquinas.find(x => x.id_maquina === elegida);
        guardarPosicion(m, limitarASala(p, sala));
      });
    }

    // Resumen por estado
    const resumen = h('div', { class: 'leyenda' }, ESTADOS.map(e => {
      const n = delaVista.filter(m => m.estado === e).length;
      return (n || e !== 'En mantenimiento') ? h('span', null, iconoEstado(e) + ' ' + n + ' ' + (e === 'Funcionando normalmente' ? 'funcionando' : e.toLowerCase())) : null;
    }));

    const conProblemas = delaVista.filter(m => m.estado !== 'Funcionando normalmente');
    const partes = [
      resumen,
      h('div', { class: 'plano-caja' + (sala ? ' zoom' : '') }, svg),
      !sala && ubicadas.length < delaVista.length
        ? h('p', { class: 'suave chico' }, (delaVista.length - ubicadas.length) + ' máquina(s) todavía sin ubicar en el plano.' +
          (es('admin') ? ' Entrá a un sector y tocá "Ubicar máquinas".' : '')) : null,
      !sala ? h('p', { class: 'suave chico' }, 'Tocá un sector del plano para verlo más grande.') : null
    ];

    if (sala && es('admin')) partes.push(barraUbicar(sala, delaVista));

    if (sala) {
      partes.push(h('h2', null, sector.sector + ' (' + delaVista.length + ')'));
      partes.push(delaVista.length ? delaVista.map(tarjetaMaquina) : vacio('No hay máquinas en este sector.'));
      if (sinUbicar.length && !ubicando) partes.push(h('p', { class: 'suave chico' }, sinUbicar.length + ' sin ubicar en el plano.'));
    } else if (conProblemas.length) {
      partes.push(h('h2', null, 'Con problemas (' + conProblemas.length + ')'));
      partes.push(conProblemas.map(tarjetaMaquina));
    }
    return partes;
  }

  // ---------- Modo ubicar (solo admin) ----------
  function barraUbicar(sala, delaVista) {
    if (!ubicando) {
      return h('button', { class: 'btn btn-secundario', onclick: () => { ubicando = true; elegida = null; dibujar(); } }, '📍 Ubicar máquinas');
    }
    const m = delaVista.find(x => x.id_maquina === elegida);
    return h('div', { class: 'tarjeta' },
      h('p', { class: 'negrita' }, '📍 Ubicar máquinas'),
      h('p', { class: 'suave chico' }, 'Elegí una máquina y tocá en el plano dónde está. También podés arrastrar los puntos. Se guarda solo.'),
      h('div', { class: 'filtros', style: { flexWrap: 'wrap' } }, delaVista.map(x =>
        h('button', { class: 'filtro' + (x.id_maquina === elegida ? ' elegido' : ''), onclick: () => { elegida = x.id_maquina; dibujar(); } },
          (enPlano(x) ? '✓ ' : '') + etiquetaCorta(x)))),
      delaVista.length ? null : h('p', { class: 'suave' }, 'No hay máquinas en este sector.'),
      m && enPlano(m) ? h('button', { class: 'btn btn-peligro', onclick: () => quitarDelPlano(m) }, 'Quitar ' + etiquetaCorta(m) + ' del plano') : null,
      h('button', { class: 'btn', onclick: () => { ubicando = false; elegida = null; dibujar(); } }, 'Listo'));
  }

  function habilitarArrastre(g, m, svg, sala) {
    let arrastrando = false, movio = false, ultimo = null;
    g.addEventListener('pointerdown', (ev) => {
      arrastrando = true; movio = false; elegida = m.id_maquina;
      g.setPointerCapture && g.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    g.addEventListener('pointermove', (ev) => {
      if (!arrastrando) return;
      const p = puntoEnPlano(svg, ev.clientX, ev.clientY);
      if (!p) return;
      ultimo = limitarASala(p, sala);
      movio = true;
      g.setAttribute('transform', `translate(${ultimo.x} ${ultimo.y})`);
    });
    const soltar = () => {
      if (!arrastrando) return;
      arrastrando = false;
      if (movio && ultimo) guardarPosicion(m, ultimo);
    };
    g.addEventListener('pointerup', soltar);
    g.addEventListener('pointercancel', soltar);
  }

  async function guardarPosicion(m, p) {
    const x = p.x / PLANO.ancho * 100, y = p.y / PLANO.alto * 100;
    try {
      const r = await cargar('ubicarMaquina', { id_maquina: m.id_maquina, x, y });
      m.plano_x = r.plano_x; m.plano_y = r.plano_y;
      invalidarDatos();
      elegida = m.id_maquina;
      dibujar();
    } catch (e) { avisoError(e); dibujar(); }
  }

  async function quitarDelPlano(m) {
    try {
      await cargar('ubicarMaquina', { id_maquina: m.id_maquina, quitar: true });
      m.plano_x = null; m.plano_y = null;
      invalidarDatos();
      dibujar();
    } catch (e) { avisoError(e); }
  }

  dibujar();
  poner(cont, solapas, caja);
}

/** Pasa un toque en la pantalla a unidades del dibujo. */
function puntoEnPlano(svg, clientX, clientY) {
  if (!svg.getScreenCTM || !svg.createSVGPoint) return null;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Mantiene el punto dentro de la sala del sector (con un pequeño margen). */
function limitarASala(p, sala) {
  const r = rectSala(sala);
  if (!r) return p;
  const m = Math.min(r.w, r.h) * 0.04;
  return {
    x: Math.min(r.x + r.w - m, Math.max(r.x + m, p.x)),
    y: Math.min(r.y + r.h - m, Math.max(r.y + m, p.y))
  };
}
