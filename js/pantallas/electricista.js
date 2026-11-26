/**
 * Electricista (rol nuevo, decidido con Juan el 26/11/2026).
 *  - Cargar un trabajo realizado: en una máquina (tocándola en el plano o en la lista se
 *    abre directo este formulario) o en otro lugar de la planta (sector + lugar escrito).
 *    Qué hizo, repuestos usados, valor en $ y hasta 3 fotos. Funciona sin señal (cola).
 *  - El VALOR solo lo ve Juan: una vez enviado, el electricista no lo vuelve a ver.
 *  - "Mis trabajos": lo que cargó, sin el valor.
 *  - Su Inicio: botones grandes + cómo está la planta + sus últimos trabajos.
 */
import { h, poner, vacio, aviso, conBoton, confirmar, pesos, leerMonto, claseEstado, iconoEstado, etiquetaEstado, etiquetaPrioridad, fechaHora, chipPendiente } from '../ui.js';
import { llamar, cargar } from '../api.js';
import { estado, datosAlDia, maquinaPorId, invalidarDatos } from '../estado.js';
import { ir, ponerTitulo } from '../app.js';
import { selectorFotos, galeriaFotos } from '../fotos.js';
import { editorUsados } from '../repuestos-ui.js';
import { elegirMaquina, marcarReciente } from './reportar.js';

// ============================================================
//  Cargar un trabajo realizado
// ============================================================

/** Ruta trabajo-electrico (elegir dónde) · trabajo-electrico/lugar · trabajo-electrico/<id de máquina> */
export async function pantallaTrabajoElectrico(cont, [donde]) {
  if (!donde) {
    return elegirMaquina(cont, {
      pregunta: '¿En qué máquina hiciste el trabajo?',
      destino: (m) => 'trabajo-electrico/' + m.id_maquina,
      arriba: [
        h('button', { class: 'btn btn-grande', onclick: () => ir('trabajo-electrico/lugar') }, '📍 Fue en otro lugar de la planta'),
        h('p', { class: 'suave chico' }, 'Luces, tableros, tomas, cableado… (no en una máquina)'),
        h('h2', null, 'O en una máquina')
      ]
    });
  }

  const datos = await datosAlDia();
  const enLugar = donde === 'lugar';
  const m = enLugar ? null : maquinaPorId(donde);
  if (!enLugar && !m) throw new Error('No se encontró la máquina.');
  ponerTitulo(enLugar ? 'Trabajo en la planta' : 'Trabajo · ' + m.nombre);

  // Dónde (solo fuera de una máquina): sector + lugar escrito
  let sector = '';
  const cajaSectores = h('div', { class: 'opciones dos' });
  const dibujarSectores = () => poner(cajaSectores, (datos.sectores_trabajo_elec || []).map(s =>
    h('button', { class: 'opcion' + (s === sector ? ' elegida' : ''), onclick: () => { sector = s; dibujarSectores(); } }, s)));
  dibujarSectores();
  const lugar = h('input', { type: 'text', maxlength: 120, placeholder: 'Lugar (ej. Tablero general, Luces del pasillo)' });

  const descripcion = h('textarea', { placeholder: 'Qué hiciste: qué se cambió, qué se reparó, qué se instaló…', maxlength: 2000 });
  const usados = editorUsados([m ? ((datos.catalogo || {})[m.id_maquina] || []) : []], datos.stock || []);
  const valor = h('input', {
    type: 'text', inputmode: 'numeric', placeholder: '$ 0', autocomplete: 'off',
    style: { fontSize: '26px', fontWeight: '700', textAlign: 'center' },
    oninput: (ev) => {
      const n = leerMonto(ev.target.value);
      ev.target.value = isNaN(n) ? '' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
    }
  });
  const fotos = selectorFotos({ texto: '📷 Sacar o agregar foto (opcional)' });

  async function enviar(boton) {
    if (enLugar && !sector) return aviso('Elegí en qué sector fue el trabajo.', 'error');
    if (enLugar && !lugar.value.trim()) return aviso('Escribí el lugar.', 'error');
    if (!descripcion.value.trim()) return aviso('Contá qué trabajo hiciste.', 'error');
    const monto = leerMonto(valor.value);
    if (isNaN(monto) || monto <= 0) return aviso('Escribí el valor del trabajo.', 'error');
    const ok = await confirmar({
      titulo: 'Enviar trabajo',
      texto: h('div', null,
        h('p', { class: 'negrita' }, enLugar ? sector + ' · ' + lugar.value.trim() : m.nombre),
        h('p', { style: { fontSize: '26px', fontWeight: '700', textAlign: 'center' } }, pesos(monto)),
        h('p', { class: 'suave' }, 'Revisá el valor: una vez enviado no lo vas a poder ver ni cambiar. Si te equivocás, avisale a Juan.')),
      si: 'Enviar'
    });
    if (!ok) return;
    await conBoton(boton, async () => {
      const r = await cargar('cargarTrabajoElectrico', Object.assign(
        enLugar ? { sector, lugar: lugar.value.trim() } : { id_maquina: m.id_maquina },
        { descripcion: descripcion.value.trim(), valor: monto, repuestos_usados: usados.leer(), fotos: fotos.fotos() }));
      aviso(r.mensaje || 'Trabajo cargado.', 'ok', 6);
      if (m) marcarReciente(m.id_maquina);
      invalidarDatos();
      ir('inicio');
    });
  }

  poner(cont,
    m ? h('div', { class: 'tarjeta maquina ' + claseEstado(m.estado) },
      h('div', { class: 'fila' }, h('span', { class: 'maquina-nombre crece' }, m.nombre), etiquetaEstado(m.estado)),
      m.incidente ? h('div', { class: 'maquina-detalle' }, '⚠️ Falla abierta: ', etiquetaPrioridad(m.incidente.prioridad), ' ' + (m.incidente.tipo_falla || '')) : null,
      h('button', { class: 'btn-link', onclick: () => ir('maquina/' + m.id_maquina) }, '📋 Ver ficha y fotos (chapa del motor)')) : null,
    enLugar ? [h('h2', null, '¿Dónde?'), cajaSectores, h('div', { style: { height: '8px' } }), lugar] : null,
    h('h2', null, 'Qué hiciste'), descripcion,
    h('h2', null, 'Repuestos usados'), usados.elementos,
    h('h2', null, 'Valor del trabajo'), valor,
    h('p', { class: 'suave chico' }, '🔒 Este valor lo ve solo Juan.'),
    h('h2', null, 'Fotos'), fotos.elemento,
    h('div', { style: { height: '14px' } }),
    h('button', { class: 'btn btn-verde', onclick: (ev) => enviar(ev.currentTarget) }, '⚡ Enviar trabajo'),
    h('button', { class: 'btn btn-secundario', onclick: () => history.back() }, 'Cancelar'));
}

// ============================================================
//  Mis trabajos (sin el valor)
// ============================================================

export function tarjetaTrabajoElectrico(t) {
  return h('div', { class: 'tarjeta' },
    h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, '⚡ ' + t.donde), t._pendiente ? chipPendiente() : null),
    h('div', null, t.descripcion),
    t.repuestos ? h('div', { class: 'suave chico' }, '🔩 ' + t.repuestos) : null,
    h('div', { class: 'suave chico' }, (t.cargado_por ? t.cargado_por + ' · ' : '') + fechaHora(t.fecha)),
    galeriaFotos(t.fotos));
}

export async function pantallaMisTrabajos(cont) {
  const lista = await llamar('misTrabajosElectricos');
  poner(cont,
    h('button', { class: 'btn', onclick: () => ir('trabajo-electrico') }, '⚡ Cargar un trabajo'),
    h('h2', null, 'Mis trabajos'),
    lista.length ? lista.map(tarjetaTrabajoElectrico) : vacio('Todavía no cargaste trabajos.'));
}

// ============================================================
//  Inicio del electricista
// ============================================================

export function inicioElectricista(d) {
  const ahora = d.ahora || [];
  return [
    h('button', { class: 'btn btn-grande btn-verde', onclick: () => ir('trabajo-electrico') }, '⚡ Cargar un trabajo'),
    h('button', { class: 'btn btn-grande btn-rojo', onclick: () => ir('reportar') }, '⚠️ Reportar una falla'),
    h('h2', null, 'Ahora en la planta'),
    ahora.length ? ahora.map(m => h('button', { class: 'tarjeta tarjeta-tocable maquina ' + claseEstado(m.estado), onclick: () => ir('trabajo-electrico/' + m.id_maquina) },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, m.nombre), m._pendiente ? chipPendiente() : null,
        m.prioridad && m.estado === 'En falla' ? etiquetaPrioridad(m.prioridad) : etiquetaEstado(m.estado)),
      m.tipo_falla ? h('div', { class: 'maquina-detalle' }, iconoEstado(m.estado) + ' ' + m.tipo_falla) : null))
      : h('p', { class: 'suave' }, '🟢 Todas las máquinas funcionando normalmente.'),
    h('div', { class: 'fila' }, h('h2', { class: 'crece' }, 'Mis últimos trabajos'),
      h('button', { class: 'btn-link', onclick: () => ir('registro') }, 'Ver todos')),
    (d.mis_trabajos_elec || []).length ? d.mis_trabajos_elec.map(tarjetaTrabajoElectrico) : vacio('Todavía no cargaste trabajos.')
  ];
}
