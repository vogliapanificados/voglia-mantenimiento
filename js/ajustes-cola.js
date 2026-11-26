/**
 * ============================================================
 *  Voglia Mantenimiento — ajustes-cola.js
 *  Hace que la app muestre las cargas que todavía no se enviaron
 *  como si ya estuvieran hechas (marcadas "⏳ sin enviar").
 *  Ejemplo: sin señal el mecánico toca "Empezar reparación" →
 *  la máquina aparece "En reparación" y puede pedir repuestos y
 *  cerrarla; todo se envía en orden cuando vuelve la señal.
 *  Solo cambia lo que se ve en el celular: lo que manda es la planilla.
 * ============================================================
 */
import { estado } from './estado.js';

const GRUPO_FALLA = { 'Máquina parada': 2, 'Funciona con problemas': 5, 'Leve': 8 };
const RANGO_PRIORIDAD = { 'Máquina parada': 0, 'Funciona con problemas': 1, 'Leve': 2 };

/** Arma, a partir de las cargas pendientes, qué le pasó a cada máquina / trabajo / preventivo. */
function resumirCola(cola) {
  const maq = {}, trab = {}, prev = {}, trabajosNuevos = [];
  const yo = estado.usuario ? estado.usuario.nombre : '';
  const deMaq = (id) => (maq[id] = maq[id] || { ops: [] });
  cola.forEach((it) => {
    const d = it.datos || {};
    switch (it.accion) {
      case 'cargarFalla': deMaq(d.id_maquina).ops.push({ tipo: 'falla', d, momento: it.momento, quien: yo }); break;
      case 'iniciarReparacion': deMaq(d.id_maquina).ops.push({ tipo: 'iniciar', momento: it.momento, quien: yo }); break;
      case 'cerrarReparacion': deMaq(d.id_maquina).ops.push({ tipo: 'cerrar', momento: it.momento }); break;
      case 'pedirRepuestos': deMaq(d.id_maquina).ops.push({ tipo: 'pedido', items: d.items || [], momento: it.momento, quien: yo }); break;
      case 'empezarTrabajo': trab[d.id_trabajo] = { estado: 'En curso', inicio: it.momento, mecanico: yo }; break;
      case 'terminarTrabajo': trab[d.id_trabajo] = { estado: 'Terminado', fin: it.momento }; break;
      case 'empezarPreventivo': prev[d.id_tarea] = { estado: 'En curso', inicio: it.momento, mecanico: yo }; break;
      case 'terminarPreventivo': prev[d.id_tarea] = { estado: 'Hecho' }; break;
      case 'posponerPreventivo': prev[d.id_tarea] = { estado: 'Pospuesto', proxima_fecha: d.nueva_fecha }; break;
      case 'pedirTrabajo': trabajosNuevos.push({ d, momento: it.momento, quien: yo }); break;
      default: break;
    }
  });
  return { maq, trab, prev, trabajosNuevos };
}

/** ¿Es la misma carga? (mismo texto y misma hora: el backend guarda la hora del celular) */
const mismaHora = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 2000;
const mismaCarga = (texto, fecha, op, textoOp) => String(texto || '') === String(textoOp || '') && mismaHora(fecha, op.momento);

/** Aplica las operaciones de una máquina sobre su estado e incidente actuales. */
function aplicarOps(ops, estadoBase, incBase) {
  let est = estadoBase || 'Funcionando normalmente';
  let inc = incBase ? Object.assign({}, incBase) : null;
  ops.forEach((op) => {
    if (op.tipo === 'falla') {
      // Si los datos ya la traen (llegó a la planilla), no se suma de nuevo
      if (inc && (mismaCarga(inc.descripcion, inc.fecha_falla, op, op.d.descripcion) ||
        (inc.notas || []).some(n => mismaCarga(n.nota, n.fecha, op, op.d.descripcion)))) return;
      if (!inc) {
        est = 'En falla';
        inc = {
          id_incidente: '', estado: 'En falla', prioridad: op.d.prioridad, tipo_falla: op.d.tipo_falla,
          descripcion: op.d.descripcion, cargado_por: op.quien, fecha_falla: op.momento, mecanico: '', inicio_reparacion: '',
          notas: [], pedidos: [], usados: [], fotos_falla: [], fotos_cierre: [], _pendiente: true
        };
      } else {
        inc.notas = (inc.notas || []).concat([{ nota: op.d.descripcion, tipo_falla: op.d.tipo_falla, prioridad: op.d.prioridad, cargado_por: op.quien, fecha: op.momento, fotos: [], _pendiente: true }]);
        if (RANGO_PRIORIDAD[op.d.prioridad] < RANGO_PRIORIDAD[inc.prioridad]) inc.prioridad = op.d.prioridad;
      }
    } else if (op.tipo === 'iniciar' && inc && est === 'En falla') {
      est = 'En reparación';
      Object.assign(inc, { estado: 'En reparación', inicio_reparacion: op.momento, mecanico: op.quien, _pendiente: true });
    } else if (op.tipo === 'pedido' && inc) {
      if ((inc.pedidos || []).some(p => mismaHora(p.fecha, op.momento))) return; // ya figura
      inc.pedidos = (inc.pedidos || []).concat(op.items.map(x => ({ repuesto: x.repuesto, cantidad: x.cantidad, medida: x.medida, detalle: x.detalle, pedido_por: op.quien, fecha: op.momento, _pendiente: true })));
    } else if (op.tipo === 'cerrar' && inc) {
      est = 'Funcionando normalmente';
      inc = null;
    }
  });
  return { estado: est, incidente: inc };
}

const copia = (x) => JSON.parse(JSON.stringify(x));
const nombreDe = (id) => {
  const m = estado.datos && estado.datos.maquinas ? estado.datos.maquinas.find(x => x.id_maquina === id) : null;
  return m || null;
};

/** Ajusta la respuesta de una lectura con lo que está en la cola. Devuelve una copia. */
export function ajustarConCola(accion, params, datos, cola) {
  if (!datos || !cola || !cola.length) return datos;
  const R = resumirCola(cola);
  const r = copia(datos);
  const ajustarMaquina = (m) => {
    const info = R.maq[m.id_maquina];
    if (!info) return m;
    const res = aplicarOps(info.ops, m.estado, m.incidente || null);
    m.estado = res.estado;
    m.incidente = res.incidente;
    m._pendiente = true;
    return m;
  };

  switch (accion) {
    case 'datosIniciales':
      (r.maquinas || []).forEach(ajustarMaquina);
      break;
    case 'listarMaquinas':
      (Array.isArray(r) ? r : []).forEach(ajustarMaquina);
      break;
    case 'detalleMaquina': {
      const info = R.maq[params.id_maquina];
      if (info) {
        const res = aplicarOps(info.ops, r.maquina.estado, r.incidente);
        r.maquina.estado = res.estado;
        r.incidente = res.incidente;
        r._pendiente = true;
      }
      (r.trabajos || []).forEach(t => { if (R.trab[t.id_trabajo]) Object.assign(t, R.trab[t.id_trabajo], { _pendiente: true }); });
      (r.preventivos || []).forEach(p => { if (R.prev[p.id_tarea]) Object.assign(p, R.prev[p.id_tarea], { _pendiente: true }); });
      break;
    }
    case 'detalleTrabajo':
      if (R.trab[params.id_trabajo]) Object.assign(r, R.trab[params.id_trabajo], { _pendiente: true });
      break;
    case 'detallePreventivo':
      if (R.prev[params.id_tarea]) Object.assign(r, R.prev[params.id_tarea], { _pendiente: true });
      break;
    case 'listarTrabajos':
      (Array.isArray(r) ? r : []).forEach(t => { if (R.trab[t.id_trabajo]) Object.assign(t, R.trab[t.id_trabajo], { _pendiente: true }); });
      break;
    case 'misTareas':
      ajustarTareas(r, R);
      break;
    case 'inicio':
      ajustarInicio(r, R);
      break;
    default: break;
  }
  return r;
}

/** Inicio: contadores, "Ahora en la planta", tareas del mecánico y "Lo que reporté / pedí". */
function ajustarInicio(r, R) {
  const ahora = r.ahora || null;
  Object.keys(R.maq).forEach((id) => {
    const m = nombreDe(id);
    const previa = ahora ? ahora.find(x => x.id_maquina === id) : null;
    // Estado de base (el del servidor): "Ahora en la planta" lista todas las que no funcionan
    // normalmente; si no figura ahí, está funcionando. (La lista de máquinas en memoria ya viene ajustada.)
    const base = ahora ? (previa ? previa.estado : 'Funcionando normalmente') : (m ? m.estado : 'Funcionando normalmente');
    const incBase = ahora
      ? (previa && previa.estado !== 'En mantenimiento' ? { estado: previa.estado, prioridad: previa.prioridad, tipo_falla: previa.tipo_falla, fecha_falla: previa.desde, mecanico: previa.mecanico } : null)
      : (m && m.incidente ? m.incidente : null);
    const res = aplicarOps(R.maq[id].ops, base, incBase);
    if (ahora && r.resumen && base !== res.estado) {
      r.resumen[base] = Math.max(0, (r.resumen[base] || 0) - 1);
      r.resumen[res.estado] = (r.resumen[res.estado] || 0) + 1;
    }
    if (ahora) {
      const i = ahora.indexOf(previa);
      if (res.estado === 'Funcionando normalmente') { if (i >= 0) ahora.splice(i, 1); }
      else {
        const fila = {
          id_maquina: id, nombre: m ? m.nombre : (previa ? previa.nombre : id), estado: res.estado, sector: m ? m.sector : '',
          prioridad: res.incidente ? res.incidente.prioridad : '', tipo_falla: res.incidente ? res.incidente.tipo_falla : '',
          desde: res.incidente ? (res.estado === 'En reparación' ? res.incidente.inicio_reparacion : res.incidente.fecha_falla) : '',
          mecanico: res.incidente ? res.incidente.mecanico : '', trabajo: '', _pendiente: true
        };
        if (i >= 0) ahora[i] = Object.assign({}, previa, fila); else ahora.unshift(fila);
      }
    }
    if (r.mis_reportes) {
      R.maq[id].ops.filter(op => op.tipo === 'falla').forEach((op) => {
        if (r.mis_reportes.some(x => x.tipo === 'falla' && x.id_maquina === id && x.estado !== 'Cerrado')) return;
        r.mis_reportes.unshift({ tipo: 'falla', id_maquina: id, titulo: m ? m.nombre : id, detalle: op.d.tipo_falla, estado: res.estado === 'Funcionando normalmente' ? 'Cerrado' : res.estado, fecha: op.momento, fin: '', mecanico: '', _pendiente: true });
      });
    }
  });
  if (r.mis_reportes) {
    R.trabajosNuevos.forEach(({ d, momento }) => {
      const m = d.id_maquina ? nombreDe(d.id_maquina) : null;
      r.mis_reportes.unshift({ tipo: 'trabajo', id_trabajo: '', id_maquina: d.id_maquina || '', titulo: m ? m.nombre : (d.lugar || ''), detalle: d.descripcion, estado: 'Pendiente', fecha: momento, fin: '', mecanico: '', _pendiente: true });
    });
  }
  if (r.tareas) ajustarTareas(r.tareas, R);
}

/** Tareas del mecánico / del equipo: mueve lo empezado a "en curso" y saca lo terminado. */
function ajustarTareas(t, R) {
  let lista = t.tareas || [];
  const proximos = t.proximos || [];
  const esMecanico = estado.usuario && estado.usuario.rol === 'mecanico';

  // Fallas
  Object.keys(R.maq).forEach((id) => {
    const m = nombreDe(id);
    const item = lista.find(x => x.tipo === 'falla' && x.id_maquina === id);
    const base = item ? item.estado : (m ? m.estado : 'Funcionando normalmente');
    const incBase = item ? { estado: item.estado, prioridad: item.prioridad, tipo_falla: item.tipo_falla, descripcion: item.descripcion, fecha_falla: item.fecha, cargado_por: item.cargado_por, mecanico: item.mecanico, inicio_reparacion: item.inicio }
      : (m && m.incidente ? m.incidente : null);
    const res = aplicarOps(R.maq[id].ops, base, incBase);
    if (!res.incidente) { lista = lista.filter(x => x !== item); return; }
    if (esMecanico && m && m.sector === 'Externas') return;
    const nuevo = {
      tipo: 'falla', grupo: res.estado === 'En reparación' ? 1 : (GRUPO_FALLA[res.incidente.prioridad] || 6), estado: res.estado,
      id_maquina: id, maquina: m ? m.nombre : (item ? item.maquina : id), sector: m ? m.sector : '', externa: !!(m && m.sector === 'Externas'),
      prioridad: res.incidente.prioridad, tipo_falla: res.incidente.tipo_falla, descripcion: res.incidente.descripcion,
      cargado_por: res.incidente.cargado_por, fecha: res.incidente.fecha_falla, mecanico: res.incidente.mecanico || '',
      inicio: res.incidente.inicio_reparacion || '', _pendiente: true
    };
    if (item) Object.assign(item, nuevo); else lista.push(nuevo);
  });

  // Trabajos
  lista = lista.filter((x) => {
    if (x.tipo !== 'trabajo' || !R.trab[x.id_trabajo]) return true;
    const c = R.trab[x.id_trabajo];
    if (c.estado === 'Terminado') return false;
    Object.assign(x, c, { grupo: 1, _pendiente: true });
    return true;
  });

  // Preventivos (también los de "Esta semana" que se adelantaron)
  lista = lista.filter((x) => {
    if (x.tipo !== 'preventivo' || !R.prev[x.id_tarea]) return true;
    const c = R.prev[x.id_tarea];
    if (c.estado !== 'En curso') return false; // hecho o pospuesto: sale de "para hacer"
    Object.assign(x, { estado_prev: 'En curso', grupo: 1, inicio: c.inicio, mecanico: c.mecanico, _pendiente: true });
    return true;
  });
  for (let i = proximos.length - 1; i >= 0; i--) {
    const c = R.prev[proximos[i].id_tarea];
    if (!c) continue;
    const [x] = proximos.splice(i, 1);
    if (c.estado === 'En curso') lista.push(Object.assign(x, { estado_prev: 'En curso', grupo: 1, inicio: c.inicio, mecanico: c.mecanico, _pendiente: true }));
  }

  const ms = (f) => (f ? new Date(f).getTime() : 0);
  lista.sort((a, b) => a.grupo - b.grupo || ms(a.fecha) - ms(b.fecha));
  t.tareas = lista;
  t.proximos = proximos;
  if (t.resumen) {
    t.resumen.en_curso = lista.filter(x => x.grupo === 1).length;
    t.resumen.fallas = lista.filter(x => x.tipo === 'falla' && x.grupo !== 1).length;
    t.resumen.trabajos = lista.filter(x => x.tipo === 'trabajo' && x.grupo !== 1).length;
    t.resumen.preventivos = lista.filter(x => x.tipo === 'preventivo' && x.grupo !== 1).length;
  }
}

/**
 * Sin señal y sin la ficha guardada: la arma con la lista de máquinas
 * (trae la falla abierta) y el catálogo de datosIniciales.
 */
export function fichaDesdeDatos(idMaquina, datosIniciales) {
  if (!datosIniciales || !datosIniciales.maquinas) return null;
  const m = datosIniciales.maquinas.find(x => x.id_maquina === idMaquina);
  if (!m) return null;
  const maquina = copia(m);
  const inc = maquina.incidente ? Object.assign({ notas: [], pedidos: [], usados: [], fotos_falla: [], fotos_cierre: [] }, maquina.incidente) : null;
  delete maquina.incidente;
  return {
    maquina, incidente: inc, service: null,
    catalogo: (datosIniciales.catalogo && datosIniciales.catalogo[idMaquina]) || [],
    trabajos: [], preventivos: [], _armada_sin_conexion: true
  };
}
