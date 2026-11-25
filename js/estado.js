/**
 * ============================================================
 *  Voglia Mantenimiento — estado.js
 *  Datos compartidos por todas las pantallas: usuario actual,
 *  máquinas, listas (tipos de falla, prioridades) y catálogo.
 * ============================================================
 */
import { llamar, sesionGuardada } from './api.js';

export const estado = {
  usuario: null,       // { id_usuario, nombre, rol }
  datos: null,         // respuesta de datosIniciales
  actualizado: 0       // cuándo se trajeron los datos (ms)
};

/** ¿El usuario actual tiene alguno de estos roles? */
export function es(...roles) {
  return !!estado.usuario && roles.includes(estado.usuario.rol);
}

/** Trae todo lo necesario del backend (máquinas, listas, catálogo). */
export async function recargarDatos() {
  const datos = await llamar('datosIniciales');
  estado.datos = datos;
  estado.usuario = datos.usuario;
  estado.actualizado = Date.now();
  return datos;
}

/** Usa los datos que ya hay si son recientes; si no, los vuelve a pedir. */
export async function datosAlDia(maxSegundos = 20) {
  if (estado.datos && Date.now() - estado.actualizado < maxSegundos * 1000) return estado.datos;
  return recargarDatos();
}

/** Marca los datos como viejos (después de una carga) para que se recarguen. */
export function invalidarDatos() {
  estado.actualizado = 0;
}

export function maquinaPorId(id) {
  return estado.datos ? estado.datos.maquinas.find(m => m.id_maquina === id) || null : null;
}

export function iniciarDesdeSesion() {
  const s = sesionGuardada();
  estado.usuario = s ? s.usuario : null;
  return s;
}
