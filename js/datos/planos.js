// Plano de la planta de Voglia.
//
// El plano es un único dibujo de toda la planta (img/plano-planta.svg), hecho a
// partir del croquis de Juan (docs/croquis-planta-original.png). Se dibuja con
// herramientas/generar_plano.py; si cambia la planta, se edita ese archivo y se
// vuelve a generar el SVG.
//
// Las máquinas se ubican encima en porcentaje (columnas plano_x y plano_y de la
// pestaña Maquinas): 0 % = borde izquierdo / superior, 100 % = borde derecho /
// inferior del dibujo. Como el SVG es vectorial, las posiciones no cambian
// aunque el plano se vea más grande o más chico.

export const PLANO = {
  archivo: 'img/plano-planta.svg',
  ancho: 1200,   // unidades del dibujo (viewBox)
  alto: 560,
  // relación alto/ancho, para reservar el lugar del plano en la pantalla
  proporcion: 560 / 1200
};

// Recorte (zoom) de cada sector dentro del plano, en % del dibujo.
// El orden es el del recorrido del producto, igual que la pestaña Sectores.
// "Externas" no está acá: no va en el plano, se muestra como lista.
export const SECTORES_PLANO = [
  { sector: 'Producción',   id: 'produccion',   orden: 1, zoom: { x: 65.42, y: 26.79, ancho: 32.92, alto: 69.64 } },
  { sector: 'Fermentadora', id: 'fermentadora', orden: 2, zoom: { x: 55.83, y: 26.79, ancho:  9.58, alto: 69.64 } },
  { sector: 'Hornos',       id: 'hornos',       orden: 3, zoom: { x: 45.83, y: 26.79, ancho: 10.00, alto: 69.64 } },
  { sector: 'Enfriado',     id: 'enfriado',     orden: 4, zoom: { x: 39.17, y: 26.79, ancho:  6.67, alto: 69.64 } },
  { sector: 'Envase',       id: 'envase',       orden: 5, zoom: { x:  1.67, y: 26.79, ancho: 37.50, alto: 69.64 } }
];

// Margen que se agrega alrededor del sector al hacer zoom, en % del plano,
// para que se vean las paredes y las puertas que lo rodean.
export const MARGEN_ZOOM = 1.5;

/** Devuelve el recorte de un sector, o null si ese sector no va en el plano. */
export function recorteDeSector(sector) {
  const s = SECTORES_PLANO.find(function (x) { return x.sector === sector; });
  return s ? s.zoom : null;
}

/**
 * Sala del plano de un sector de la planilla. La columna "plano" de la pestaña
 * Sectores dice qué sala le corresponde (así, si Juan renombra el sector, sigue
 * apuntando a la misma sala). Devuelve el nombre de la sala o null.
 */
export function salaDeSector(sectorPlanilla) {
  if (!sectorPlanilla) return null;
  const clave = sectorPlanilla.plano || sectorPlanilla.sector;
  return SECTORES_PLANO.some(function (x) { return x.sector === clave; }) ? clave : null;
}

/**
 * viewBox para mostrar en pantalla: como viewBoxDe, pero si la sala es muy
 * angosta (Enfriado, Hornos, Fermentadora) se ensancha la vista hacia los
 * costados (sin salir del plano), para que entre bien en el celular y se vean
 * las salas vecinas atenuadas. minAspecto = ancho / alto mínimo.
 */
export function viewBoxVista(sala, minAspecto) {
  const vb = viewBoxDe(sala).split(' ').map(Number);
  if (!sala || !minAspecto || vb[2] / vb[3] >= minAspecto) return vb;
  const ancho = Math.min(PLANO.ancho, vb[3] * minAspecto);
  const centro = vb[0] + vb[2] / 2;
  const x = Math.max(0, Math.min(PLANO.ancho - ancho, centro - ancho / 2));
  return [Math.round(x), vb[1], Math.round(ancho), vb[3]];
}

/**
 * Pasa el viewBox del SVG a unidades del dibujo para mostrar un sector.
 * Si no se pasa sector, devuelve el plano completo.
 */
export function viewBoxDe(sector) {
  const z = sector ? recorteDeSector(sector) : null;
  if (!z) return '0 0 ' + PLANO.ancho + ' ' + PLANO.alto;
  const m = MARGEN_ZOOM;
  const x = Math.max(0, (z.x - m) / 100 * PLANO.ancho);
  const y = Math.max(0, (z.y - m) / 100 * PLANO.alto);
  const an = Math.min(PLANO.ancho - x, (z.ancho + m * 2) / 100 * PLANO.ancho);
  const al = Math.min(PLANO.alto - y, (z.alto + m * 2) / 100 * PLANO.alto);
  return [x, y, an, al].map(function (n) { return Math.round(n); }).join(' ');
}

/**
 * Pasa la posición de una máquina (plano_x, plano_y en % del plano completo)
 * a % dentro del recuadro que se está mostrando, para ubicar el punto.
 */
export function posicionEnVista(plano_x, plano_y, sector) {
  const vb = viewBoxDe(sector).split(' ').map(Number);
  const px = plano_x / 100 * PLANO.ancho;
  const py = plano_y / 100 * PLANO.alto;
  return {
    x: (px - vb[0]) / vb[2] * 100,
    y: (py - vb[1]) / vb[3] * 100
  };
}
