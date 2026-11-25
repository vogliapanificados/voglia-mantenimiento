/**
 * ============================================================
 *  Voglia Mantenimiento — fotos.js
 *  - selectorFotos: botón para sacar o elegir hasta 3 fotos, que
 *    se achican en el celular (lado mayor 1280 px, JPEG) antes
 *    de mandarlas, para que suban rápido con poca señal.
 *  - galeriaFotos: miniaturas de fotos ya guardadas; se piden al
 *    backend (verFoto) solo cuando se muestran.
 * ============================================================
 */
import { h, poner, aviso, abrirModal } from './ui.js';
import { llamar } from './api.js';

const LADO_MAXIMO = 1280;
const CALIDAD = 0.72;

/** Achica una imagen (File) y devuelve un data URL JPEG. */
async function achicar(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((resolver, rechazar) => {
      const i = new Image();
      i.onload = () => resolver(i);
      i.onerror = () => rechazar(new Error('No se pudo leer la foto.'));
      i.src = url;
    });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL('image/jpeg', CALIDAD);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Selector de fotos. Devuelve { elemento, fotos() } — fotos() da la lista de data URLs.
 * texto: lo que dice el botón.
 */
export function selectorFotos({ maximo = 3, texto = '📷 Agregar foto' } = {}) {
  const fotos = [];
  const miniaturas = h('div', { class: 'fotos' });
  const entrada = h('input', {
    type: 'file', accept: 'image/*', multiple: true, class: 'oculto',
    onchange: async (ev) => {
      const archivos = Array.from(ev.target.files || []);
      ev.target.value = '';
      for (const a of archivos) {
        if (fotos.length >= maximo) { aviso('Máximo ' + maximo + ' fotos.', 'error'); break; }
        try { fotos.push(await achicar(a)); } catch (e) { aviso(e.message, 'error'); }
      }
      dibujar();
    }
  });
  const boton = h('button', { class: 'btn btn-secundario', type: 'button', onclick: () => entrada.click() }, texto);

  function dibujar() {
    poner(miniaturas, fotos.map((f, i) => h('div', { class: 'foto' },
      h('img', { src: f, alt: 'Foto ' + (i + 1) }),
      h('button', { class: 'foto-quitar', type: 'button', 'aria-label': 'Quitar foto', onclick: () => { fotos.splice(i, 1); dibujar(); } }, '✕'))));
    boton.classList.toggle('oculto', fotos.length >= maximo);
    poner(boton, fotos.length ? '📷 Agregar otra foto (' + fotos.length + '/' + maximo + ')' : texto);
  }
  dibujar();

  return { elemento: h('div', null, miniaturas, boton, entrada), fotos: () => fotos.slice() };
}

// ---------- Fotos guardadas ----------

const cache = new Map(); // id → data URL (para no pedirla dos veces)

async function traerFoto(id) {
  if (!cache.has(id)) {
    cache.set(id, llamar('verFoto', { id }).then(r => 'data:' + r.mime + ';base64,' + r.base64)
      .catch(e => { cache.delete(id); throw e; }));
  }
  return cache.get(id);
}

/** Miniaturas de fotos guardadas (lista de IDs). Al tocar una, se ve grande. */
export function galeriaFotos(ids) {
  if (!ids || !ids.length) return null;
  return h('div', { class: 'fotos' }, ids.map(id => {
    const img = h('img', { alt: 'Foto', loading: 'lazy' });
    const caja = h('button', { class: 'foto cargando-foto', type: 'button', onclick: (ev) => { ev.stopPropagation(); verGrande(id); } }, img);
    traerFoto(id).then(src => { img.src = src; caja.classList.remove('cargando-foto'); })
      .catch(() => { poner(caja, h('span', { class: 'suave chico' }, 'Sin conexión')); });
    return caja;
  }));
}

function verGrande(id) {
  const img = h('img', { alt: 'Foto', class: 'foto-grande' });
  traerFoto(id).then(src => { img.src = src; }).catch(e => aviso(e.message, 'error'));
  abrirModal(cerrar => [img, h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cerrar')]);
}
