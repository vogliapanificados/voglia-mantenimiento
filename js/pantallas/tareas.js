/**
 * Piezas de las tareas (la pantalla "Mis tareas" pasó a ser el Inicio del mecánico: ver inicio.js).
 */
import { h } from '../ui.js';

const ICONO_URGENCIA = { 'Urgente': '🔴', 'Normal': '🟠', 'Cuando se pueda': '⚪' };
const CLASE_URGENCIA = { 'Urgente': 'prio-0', 'Normal': 'prio-1', 'Cuando se pueda': 'prio-2' };

/** Etiqueta de color con la urgencia de un trabajo. */
export function etiquetaUrgencia(u) {
  return h('span', { class: 'etiqueta ' + (CLASE_URGENCIA[u] || 'prio-2') }, (ICONO_URGENCIA[u] || '') + ' ' + u);
}
