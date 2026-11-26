/**
 * Pantallas solo para el admin: pagos al mecánico, usuarios, alta/baja de
 * máquinas y listas (tipos de falla y de máquina).
 * El backend vuelve a controlar el rol en cada acción.
 */
import {
  h, poner, vacio, dato, aviso, conBoton, confirmar, abrirModal, cargando, avisoError,
  fecha, fechaHora, pesos, leerMonto, hoyISO, etiquetaEstado, ROLES
} from '../ui.js';
import { llamar, cargar } from '../api.js';
import { estado, recargarDatos, invalidarDatos } from '../estado.js';
import { ir } from '../app.js';

// ============================================================
//  Menú de administración
// ============================================================

export async function pantallaAdmin(cont) {
  const opcion = (icono, titulo, texto, ruta) =>
    h('button', { class: 'tarjeta tarjeta-tocable', onclick: () => ir(ruta) },
      h('div', { class: 'negrita' }, icono + ' ' + titulo),
      h('div', { class: 'suave chico' }, texto));

  // Configuración agrupada por tema. Lo del día a día está en Inicio y lo histórico en Registro.
  poner(cont,
    h('h2', null, 'Máquinas y planta'),
    opcion('🏭', 'Máquinas', 'Alta, ficha técnica, sector y baja', 'admin/maquinas'),
    opcion('🔵', 'Plan preventivo', 'Tareas preventivas por máquina o por tipo', 'admin/preventivo'),
    opcion('📝', 'Listas', 'Sectores, tipos de falla, causas y tipos de máquina', 'admin/listas'),
    h('p', { class: 'suave chico' }, 'Para cargar muchas máquinas juntas: pestaña Importar de la planilla y menú Voglia › Importar máquinas.'),

    h('h2', null, 'Repuestos y compras'),
    opcion('📦', 'Repuestos y stock', 'Precios de los pedidos, stock, usados, catálogo y sugeridos', 'admin/repuestos'),
    opcion('🏪', 'Proveedores', 'Casas de repuestos', 'admin/proveedores'),

    h('h2', null, 'Personas'),
    opcion('👥', 'Usuarios', 'Crear usuarios, cambiar PIN, desbloquear, dar de baja', 'admin/usuarios'),
    opcion('💰', 'Pagos al mecánico', 'Totales diarios cargados y correcciones', 'admin/pagos'),

    h('h2', null, 'Services'),
    opcion('🧰', 'Services técnicos', 'Empresas y técnicos que atienden las máquinas', 'admin/services'),

    h('h2', null, 'Configuración'),
    opcion('🔔', 'Avisos automáticos', 'Cuándo te llegan los avisos por Telegram', 'admin/avisos'),
    opcion('👤', 'Mi cuenta', 'Cambiar mi PIN, cerrar sesión', 'cuenta'));
}

// ============================================================
//  Pagos al mecánico
// ============================================================

let rangoPagos = null;
let personaPagos = 'mecanico'; // pestaña: 'mecanico' (totales diarios) | 'electricista' (cada trabajo con su valor)

export async function pantallaPagos(cont) {
  if (!rangoPagos) rangoPagos = { desde: hoyISO().slice(0, 8) + '01', hasta: hoyISO() };
  const desde = h('input', { type: 'date', value: rangoPagos.desde });
  const hasta = h('input', { type: 'date', value: rangoPagos.hasta });
  const cuerpo = h('div');
  const pestanas = h('div', { class: 'pestanas' });
  const dibujarPestanas = () => poner(pestanas, [['mecanico', '🔧 Mecánico'], ['electricista', '⚡ Electricista']].map(([k, t]) =>
    h('button', { class: 'pestana' + (k === personaPagos ? ' elegida' : ''), onclick: () => { personaPagos = k; dibujarPestanas(); buscar(); } }, t)));
  dibujarPestanas();

  async function buscar() {
    rangoPagos = { desde: desde.value, hasta: hasta.value };
    poner(cuerpo, cargando());
    try {
      if (personaPagos === 'electricista') {
        const re = await llamar('listarTrabajosElectricos', rangoPagos);
        poner(cuerpo,
          h('div', { class: 'tarjeta' },
            dato('Trabajos', String(re.trabajos.length)),
            dato('Total del período', re.total_texto)),
          re.trabajos.length ? re.trabajos.map(t => tarjetaPagoElectrico(t, buscar)) : vacio('No hay trabajos del electricista en estas fechas.'));
        return;
      }
      const r = await llamar('listarPagos', rangoPagos);
      poner(cuerpo,
        h('div', { class: 'tarjeta' },
          dato('Días cargados', String(r.pagos.length)),
          dato('Total del período', r.total_texto)),
        r.pagos.length ? r.pagos.map(p => tarjetaPago(p, buscar)) : vacio('No hay totales cargados en estas fechas.'));
    } catch (e) {
      avisoError(e);
      poner(cuerpo, vacio(e.message));
    }
  }

  poner(cont,
    pestanas,
    h('div', { class: 'opciones dos' },
      h('label', { class: 'campo', style: { margin: 0 } }, h('span', null, 'Desde'), desde),
      h('label', { class: 'campo', style: { margin: 0 } }, h('span', null, 'Hasta'), hasta)),
    h('button', { class: 'btn btn-secundario', onclick: buscar }, 'Buscar'),
    cuerpo);
  await buscar();
}

/** Un trabajo del electricista con su valor (solo admin) y "Corregir". */
function tarjetaPagoElectrico(t, alCambiar) {
  const corregir = () => {
    const valor = h('input', { type: 'text', inputmode: 'numeric', value: Number(t.valor).toLocaleString('es-AR') });
    abrirModal(cerrar => [
      h('h2', null, 'Corregir valor'),
      h('p', { class: 'suave chico' }, t.donde + ' · ' + fechaHora(t.fecha) + '. Queda registrado el valor anterior.'),
      h('label', { class: 'campo' }, h('span', null, 'Valor ($)'), valor),
      h('button', {
        class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
          const n = leerMonto(valor.value);
          if (isNaN(n) || n <= 0) throw new Error('Escribí un valor válido.');
          const r = await cargar('editarTrabajoElectrico', { id_trabajo_elec: t.id_trabajo_elec, valor: n });
          aviso(r.mensaje || 'Valor corregido.', 'ok');
          cerrar();
          alCambiar();
        })
      }, 'Guardar corrección'),
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')]);
  };
  return h('div', { class: 'tarjeta' },
    h('div', { class: 'fila' },
      h('span', { class: 'negrita crece' }, '⚡ ' + t.donde),
      h('b', { style: { fontSize: '20px' } }, pesos(t.valor))),
    h('p', null, t.descripcion),
    t.repuestos ? h('p', { class: 'suave chico' }, '🔩 ' + t.repuestos) : null,
    h('p', { class: 'suave chico' }, t.cargado_por + ' · ' + fechaHora(t.fecha)),
    t.editado_por ? h('p', { class: 'chico', style: { color: '#9a3412' } },
      '✏️ Corregido por ' + t.editado_por + ' el ' + fechaHora(t.fecha_edicion) + ' (antes: ' + pesos(t.valor_anterior) + ')') : null,
    h('button', { class: 'btn-link', onclick: corregir }, 'Corregir'));
}

function tarjetaPago(p, alCambiar) {
  return h('div', { class: 'tarjeta' },
    h('div', { class: 'fila' },
      h('span', { class: 'negrita crece' }, fecha(p.fecha_trabajo)),
      h('b', { style: { fontSize: '20px' } }, pesos(p.total))),
    p.observacion ? h('p', null, p.observacion) : null,
    h('p', { class: 'suave chico' }, 'Cargó ' + p.cargado_por + ' · ' + fechaHora(p.fecha_carga)),
    p.editado_por ? h('p', { class: 'chico', style: { color: '#9a3412' } },
      '✏️ Corregido por ' + p.editado_por + ' el ' + fechaHora(p.fecha_edicion) + ' (antes: ' + pesos(p.total_anterior) + ')') : null,
    h('button', { class: 'btn-link', onclick: () => editarPago(p, alCambiar) }, 'Corregir'));
}

function editarPago(p, alCambiar) {
  const total = h('input', { type: 'text', inputmode: 'numeric', value: Number(p.total).toLocaleString('es-AR') });
  const obs = h('textarea', { maxlength: 500, style: { minHeight: '80px' } });
  obs.value = p.observacion || '';
  abrirModal(cerrar => [
    h('h2', null, 'Corregir total del ' + fecha(p.fecha_trabajo)),
    h('p', { class: 'suave chico' }, 'Queda registrado el valor anterior, quién lo cambió y cuándo.'),
    h('label', { class: 'campo' }, h('span', null, 'Total ($)'), total),
    h('label', { class: 'campo' }, h('span', null, 'Observación'), obs),
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        const n = leerMonto(total.value);
        if (isNaN(n) || n <= 0) throw new Error('Escribí un total válido.');
        const r = await cargar('editarPago', { id_pago: p.id_pago, total: n, observacion: obs.value.trim() });
        aviso(r.mensaje || 'Total corregido.', 'ok');
        cerrar();
        alCambiar();
      })
    }, 'Guardar corrección'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
  ]);
}

// ============================================================
//  Usuarios
// ============================================================

const selectorRol = (valor) => h('select', null,
  Object.entries(ROLES).map(([k, v]) => h('option', { value: k, selected: k === valor }, v)));

const campoPin = () => h('input', {
  type: 'text', inputmode: 'numeric', maxlength: 4, placeholder: '4 números', autocomplete: 'off',
  oninput: (ev) => { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 4); }
});

export async function pantallaUsuarios(cont) {
  const usuarios = await llamar('listarUsuarios');
  const recargar = () => ir('admin/usuarios');
  usuarios.sort((a, b) => (a.activo === b.activo ? 0 : a.activo === 'SI' ? -1 : 1) || a.nombre.localeCompare(b.nombre, 'es'));

  poner(cont,
    h('button', { class: 'btn', onclick: () => nuevoUsuario(recargar) }, '+ Nuevo usuario'),
    usuarios.map(u => h('button', { class: 'tarjeta tarjeta-tocable', onclick: () => editarUsuario(u, recargar) },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, u.nombre),
        u.activo !== 'SI' ? h('span', { class: 'etiqueta inactiva' }, 'Inactivo') : null,
        u.bloqueado ? h('span', { class: 'etiqueta prio-0' }, 'Bloqueado') : null),
      h('div', { class: 'suave chico' }, (ROLES[u.rol] || u.rol) + ' · ' +
        (u.ultimo_acceso ? 'último ingreso ' + fechaHora(u.ultimo_acceso) : 'nunca ingresó')))));
}

function nuevoUsuario(alCambiar) {
  const nombre = h('input', { type: 'text', placeholder: 'Nombre y apellido', maxlength: 60 });
  const rol = selectorRol('encargado');
  const pin = campoPin();
  abrirModal(cerrar => [
    h('h2', null, 'Nuevo usuario'),
    h('label', { class: 'campo' }, h('span', null, 'Nombre'), nombre),
    h('label', { class: 'campo' }, h('span', null, 'Rol'), rol),
    h('label', { class: 'campo' }, h('span', null, 'PIN inicial'), pin),
    h('p', { class: 'suave chico' }, 'Puede ser uno provisorio (ej. 1111): después cada uno lo cambia en "Mi cuenta".'),
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        const r = await cargar('crearUsuario', { nombre: nombre.value.trim(), rol: rol.value, pin: pin.value });
        aviso('Usuario ' + r.nombre + ' creado.', 'ok');
        cerrar();
        alCambiar();
      })
    }, 'Crear usuario'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
  ]);
  setTimeout(() => nombre.focus(), 50);
}

function editarUsuario(u, alCambiar) {
  const nombre = h('input', { type: 'text', value: u.nombre, maxlength: 60 });
  const rol = selectorRol(u.rol);
  const pin = campoPin();
  const soyYo = estado.usuario && estado.usuario.id_usuario === u.id_usuario;

  const guardar = (datos, mensaje) => async () => {
    await cargar('editarUsuario', Object.assign({ id_usuario: u.id_usuario }, datos));
    aviso(mensaje, 'ok');
    alCambiar();
  };

  abrirModal(cerrar => [
    h('h2', null, u.nombre),
    h('label', { class: 'campo' }, h('span', null, 'Nombre'), nombre),
    h('label', { class: 'campo' }, h('span', null, 'Rol'), rol),
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        await guardar({ nombre: nombre.value.trim(), rol: rol.value }, 'Datos guardados.')();
        cerrar();
      })
    }, 'Guardar nombre y rol'),
    h('p', { class: 'suave chico' }, 'Si cambiás el rol, se le cierra la sesión y tiene que volver a ingresar.'),

    h('div', { class: 'separador' }),
    h('label', { class: 'campo' }, h('span', null, 'PIN nuevo'), pin),
    h('button', {
      class: 'btn btn-secundario', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        if (pin.value.length !== 4) throw new Error('El PIN tiene que tener 4 números.');
        await guardar({ pin: pin.value }, 'PIN cambiado. Se cerraron sus sesiones.')();
        cerrar();
      })
    }, 'Cambiar PIN'),

    u.bloqueado ? h('button', {
      class: 'btn btn-secundario', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        await cargar('desbloquearUsuario', { id_usuario: u.id_usuario });
        aviso('Usuario desbloqueado.', 'ok');
        cerrar();
        alCambiar();
      })
    }, '🔓 Desbloquear') : null,

    h('div', { class: 'separador' }),
    soyYo ? h('p', { class: 'suave chico' }, 'No podés desactivar tu propio usuario desde acá.') :
      h('button', {
        class: u.activo === 'SI' ? 'btn btn-peligro' : 'btn btn-secundario',
        onclick: async (ev) => {
          const boton = ev.currentTarget;
          const activar = u.activo !== 'SI';
          if (!activar) {
            const ok = await confirmar({ titulo: 'Desactivar usuario', texto: u.nombre + ' no va a poder entrar más a la app. Lo que cargó queda registrado.', si: 'Desactivar', claseSi: 'btn btn-rojo' });
            if (!ok) return;
          }
          await conBoton(boton, async () => {
            await guardar({ activo: activar ? 'SI' : 'NO' }, activar ? 'Usuario reactivado.' : 'Usuario desactivado.')();
            cerrar();
          });
        }
      }, u.activo === 'SI' ? 'Desactivar usuario' : 'Reactivar usuario'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cerrar')
  ]);
}

// ============================================================
//  Máquinas (alta, edición, ficha técnica, baja)
// ============================================================

/** "Lona (60x200); Rodamiento (6204)" → [{ repuesto, medida }] (mismo formato que Importar) */
function leerRepuestos(texto) {
  return String(texto || '').split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    return m ? { repuesto: m[1].trim(), medida: m[2].trim() } : { repuesto: s, medida: '' };
  });
}

/**
 * Formulario de máquina (alta o edición). Devuelve { elementos, leer() }.
 * m = máquina existente (o null para una nueva).
 */
function formularioMaquina(m) {
  const datos = estado.datos || { tipos_maquina: [], sectores: [], services: [] };
  const lista = 'tipos-maquina-' + Math.random().toString(36).slice(2);
  const tipo = h('input', { type: 'text', list: lista, value: m ? m.tipo : '', placeholder: 'Ej: Amasadora', maxlength: 60 });
  const numero = h('input', { type: 'text', inputmode: 'numeric', value: m ? m.numero : '', placeholder: 'Ej: 1', maxlength: 10 });
  const marca = h('input', { type: 'text', value: m ? m.marca || '' : '', placeholder: 'Ej: Argental', maxlength: 60 });
  const sector = h('select', null,
    h('option', { value: '' }, 'Elegí el sector…'),
    datos.sectores.map(s => h('option', { value: s.sector, selected: m && m.sector === s.sector },
      s.externa ? s.sector + ' (service externo)' : s.sector)));
  const ficha = {
    modelo: h('input', { type: 'text', value: m ? m.modelo || '' : '', maxlength: 80 }),
    serie: h('input', { type: 'text', value: m ? m.serie || '' : '', maxlength: 60 }),
    anio: h('input', { type: 'text', inputmode: 'numeric', value: m ? m.anio || '' : '', maxlength: 10 }),
    potencia: h('input', { type: 'text', value: m ? m.potencia || '' : '', placeholder: 'Ej: 3 HP', maxlength: 30 }),
    tension: h('input', { type: 'text', value: m ? m.tension || '' : '', placeholder: 'Ej: 380 V', maxlength: 30 })
  };
  const service = h('select', null,
    h('option', { value: '' }, 'Sin service asignado'),
    datos.services.map(s => h('option', { value: s.id_service, selected: m && m.id_service === s.id_service },
      s.empresa + (s.especialidad ? ' · ' + s.especialidad : ''))));
  const repuestos = m ? null : h('textarea', { placeholder: 'Lona (60x200); Rodamiento (6204); Cuchilla', style: { minHeight: '80px' } });

  const campo = (texto, el) => h('label', { class: 'campo' }, h('span', null, texto), el);
  const elementos = [
    campo('Tipo', [tipo, h('datalist', { id: lista }, datos.tipos_maquina.map(t => h('option', { value: t })))]),
    h('div', { class: 'opciones dos' }, campo('Número', numero), campo('Marca', marca)),
    campo('Sector', sector),
    h('h3', null, 'Ficha técnica (opcional)'),
    campo('Modelo', ficha.modelo),
    h('div', { class: 'opciones dos' }, campo('N° de serie', ficha.serie), campo('Año', ficha.anio)),
    h('div', { class: 'opciones dos' }, campo('Potencia', ficha.potencia), campo('Tensión', ficha.tension)),
    campo('Service técnico', service),
    datos.services.length ? null : h('p', { class: 'suave chico' }, 'Para elegir un service, primero cargalo en Admin › Services técnicos.'),
    repuestos ? [campo('Repuestos típicos (opcional)', repuestos),
      h('div', { class: 'suave chico', style: { marginTop: '-8px', marginBottom: '14px' } }, 'Separados por punto y coma; la medida entre paréntesis.')] : null
  ];

  const leer = () => {
    const r = {
      tipo: tipo.value.trim(), numero: numero.value.trim(), marca: marca.value.trim(),
      sector: sector.value, id_service: service.value
    };
    Object.keys(ficha).forEach(k => { r[k] = ficha[k].value.trim(); });
    if (repuestos) r.repuestos = leerRepuestos(repuestos.value);
    return r;
  };
  return { elementos, leer };
}

export async function pantallaAdminMaquinas(cont) {
  const datos = await recargarDatos();
  const recargar = () => { invalidarDatos(); ir('admin/maquinas'); };
  const ordenSector = (s) => { const i = datos.sectores.findIndex(x => x.sector === s); return i < 0 ? 999 : i; };
  const maquinas = [...datos.maquinas].sort((a, b) =>
    (a.activa === b.activa ? 0 : a.activa === 'SI' ? -1 : 1) ||
    ordenSector(a.sector) - ordenSector(b.sector) ||
    a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));

  // Agrupadas por sector (las dadas de baja al final)
  const grupos = [];
  maquinas.forEach(m => {
    const titulo = m.activa !== 'SI' ? 'Dadas de baja' : (m.sector || 'Sin sector');
    let g = grupos.find(x => x.titulo === titulo);
    if (!g) { g = { titulo, maquinas: [] }; grupos.push(g); }
    g.maquinas.push(m);
  });

  poner(cont,
    h('button', { class: 'btn', onclick: () => nuevaMaquina(recargar) }, '+ Nueva máquina'),
    h('p', { class: 'suave chico' }, 'Para cargar muchas de una vez, usá la pestaña Importar de la planilla.'),
    grupos.length ? grupos.map(g => [
      h('h2', null, g.titulo + ' (' + g.maquinas.length + ')'),
      g.maquinas.map(m => h('button', { class: 'tarjeta tarjeta-tocable', onclick: () => abrirEditarMaquina(m, recargar) },
        h('div', { class: 'fila' },
          h('span', { class: 'negrita crece' }, m.nombre),
          m.activa === 'SI' ? etiquetaEstado(m.estado) : h('span', { class: 'etiqueta inactiva' }, 'Dada de baja')),
        h('div', { class: 'suave chico' }, m.id_maquina + (m.modelo ? ' · ' + m.modelo : ''))))
    ]) : vacio('Todavía no hay máquinas.'));
}

function nuevaMaquina(alCambiar) {
  const form = formularioMaquina(null);
  abrirModal(cerrar => [
    h('h2', null, 'Nueva máquina'),
    form.elementos,
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        const r = await cargar('crearMaquina', form.leer());
        aviso(r.maquina.nombre + ' creada' + (r.repuestos_agregados ? ' con ' + r.repuestos_agregados + ' repuestos.' : '.'), 'ok');
        cerrar();
        alCambiar();
      })
    }, 'Crear máquina'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
  ]);
}

/** Edición de una máquina (la usan Admin › Máquinas y la ficha de la máquina). */
export function abrirEditarMaquina(m, alCambiar) {
  const form = formularioMaquina(m);
  const activa = m.activa === 'SI';

  abrirModal(cerrar => [
    h('h2', null, m.nombre),
    form.elementos,
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        const r = await cargar('editarMaquina', Object.assign({ id_maquina: m.id_maquina }, form.leer()));
        aviso('Guardado: ' + r.nombre, 'ok');
        cerrar();
        alCambiar();
      })
    }, 'Guardar'),
    h('button', { class: 'btn btn-secundario', onclick: () => { cerrar(); ir('maquina/' + m.id_maquina); } }, 'Ver la máquina y sus repuestos'),
    h('div', { class: 'separador' }),
    h('button', {
      class: activa ? 'btn btn-peligro' : 'btn btn-secundario',
      onclick: async (ev) => {
        const boton = ev.currentTarget;
        if (activa) {
          const ok = await confirmar({ titulo: 'Dar de baja', texto: m.nombre + ' deja de aparecer en el listado. Su historial queda guardado.', si: 'Dar de baja', claseSi: 'btn btn-rojo' });
          if (!ok) return;
        }
        await conBoton(boton, async () => {
          await cargar('editarMaquina', { id_maquina: m.id_maquina, activa: activa ? 'NO' : 'SI' });
          aviso(activa ? 'Máquina dada de baja.' : 'Máquina reactivada.', 'ok');
          cerrar();
          alCambiar();
        });
      }
    }, activa ? 'Dar de baja' : 'Reactivar'),
    h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cerrar')
  ]);
}

// ============================================================
//  Listas: sectores, tipos de falla y tipos de máquina
// ============================================================

export async function pantallaListas(cont) {
  const datos = await recargarDatos();
  const recargar = () => { invalidarDatos(); ir('admin/listas'); };

  const pedirTexto = (titulo, valor, alGuardar) => {
    const campo = h('input', { type: 'text', value: valor || '', maxlength: 60 });
    abrirModal(cerrar => [
      h('h2', null, titulo),
      h('label', { class: 'campo' }, campo),
      h('button', { class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => { await alGuardar(campo.value.trim()); cerrar(); recargar(); }) }, 'Guardar'),
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
    ]);
    setTimeout(() => campo.focus(), 50);
  };

  const quitar = async (texto, fn) => {
    const ok = await confirmar({ titulo: 'Quitar de la lista', texto: '"' + texto + '" deja de aparecer para elegir. Lo ya cargado no cambia. Para volver a usarlo, se reactiva desde la planilla.', si: 'Quitar', claseSi: 'btn btn-rojo' });
    if (!ok) return;
    try { await fn(); recargar(); } catch (e) { avisoError(e); }
  };

  poner(cont,
    h('h2', null, 'Sectores'),
    h('div', { class: 'tarjeta' }, h('ul', { class: 'lista' }, datos.sectores.map(s => h('li', { class: 'fila' },
      h('span', { class: 'crece' }, s.sector, s.externa ? h('div', { class: 'suave chico' }, 'Fija: equipos que controla un service externo') : null),
      s.externa ? null : h('button', { class: 'btn-link', onclick: () => pedirTexto('Cambiar nombre', s.sector, nuevo => cargar('guardarSector', { sector: nuevo, sector_anterior: s.sector })) }, 'Editar'),
      s.externa ? null : h('button', { class: 'btn-link', style: { color: 'var(--rojo)' }, onclick: () => quitar(s.sector, () => cargar('guardarSector', { sector: s.sector, activo: 'NO' })) }, 'Quitar'))))),
    h('button', { class: 'btn btn-secundario', onclick: () => pedirTexto('Nuevo sector', '', nuevo => cargar('guardarSector', { sector: nuevo })) }, '+ Agregar sector'),

    h('h2', null, 'Tipos de falla'),
    h('p', { class: 'suave chico' }, 'Por categoría. Al reportar, se elige la categoría y después la falla (o se escribe a mano).'),
    (datos.categorias_falla || []).map(cat => [
      h('h3', null, ({ 'Eléctrica': '⚡ ', 'Mecánica': '⚙️ ', 'Otra': '❓ ' }[cat] || '') + cat),
      h('div', { class: 'tarjeta' }, h('ul', { class: 'lista' }, ((datos.fallas_por_categoria || {})[cat] || []).map(t => h('li', { class: 'fila' },
        h('span', { class: 'crece' }, t),
        h('button', { class: 'btn-link', onclick: () => pedirTexto('Cambiar nombre', t, nuevo => cargar('guardarTipoFalla', { tipo_falla: nuevo, tipo_anterior: t, categoria: cat })) }, 'Editar'),
        h('button', { class: 'btn-link', style: { color: 'var(--rojo)' }, onclick: () => quitar(t, () => cargar('guardarTipoFalla', { tipo_falla: t, activo: 'NO' })) }, 'Quitar'))))),
      h('button', { class: 'btn btn-secundario', onclick: () => pedirTexto('Nueva falla (' + cat + ')', '', nuevo => cargar('guardarTipoFalla', { tipo_falla: nuevo, categoria: cat })) }, '+ Agregar falla ' + cat.toLowerCase())
    ]),

    h('h2', null, 'Causas de falla'),
    h('p', { class: 'suave chico' }, 'Las elige el mecánico al cerrar una reparación.'),
    h('div', { class: 'tarjeta' }, h('ul', { class: 'lista' }, (datos.causas || []).map(c => h('li', { class: 'fila' },
      h('span', { class: 'crece' }, c),
      h('button', { class: 'btn-link', onclick: () => pedirTexto('Cambiar nombre', c, nuevo => cargar('guardarCausa', { causa: nuevo, causa_anterior: c })) }, 'Editar'),
      h('button', { class: 'btn-link', style: { color: 'var(--rojo)' }, onclick: () => quitar(c, () => cargar('guardarCausa', { causa: c, activo: 'NO' })) }, 'Quitar'))))),
    h('button', { class: 'btn btn-secundario', onclick: () => pedirTexto('Nueva causa', '', nuevo => cargar('guardarCausa', { causa: nuevo })) }, '+ Agregar causa'),

    h('h2', null, 'Tipos de máquina'),
    h('div', { class: 'tarjeta' }, h('ul', { class: 'lista' }, datos.tipos_maquina.map(t => h('li', { class: 'fila' },
      h('span', { class: 'crece' }, t),
      h('button', { class: 'btn-link', style: { color: 'var(--rojo)' }, onclick: () => quitar(t, () => cargar('guardarTipoMaquina', { tipo: t, activo: 'NO' })) }, 'Quitar'))))),
    h('button', { class: 'btn btn-secundario', onclick: () => pedirTexto('Nuevo tipo de máquina', '', nuevo => cargar('guardarTipoMaquina', { tipo: nuevo })) }, '+ Agregar tipo de máquina'));
}

// ============================================================
//  Services técnicos y proveedores (solo admin)
// ============================================================

/**
 * Pantalla de lista + alta/edición para services o proveedores.
 * def: { accionListar, accionGuardar, id, titulo, campos: [{ clave, etiqueta, tipo? }], principal, secundario }
 */
async function pantallaContactos(cont, def) {
  const lista = await llamar(def.accionListar);
  const recargar = () => ir(def.ruta);
  lista.sort((a, b) => (a.activo === b.activo ? 0 : a.activo === 'SI' ? -1 : 1) ||
    String(a[def.principal]).localeCompare(String(b[def.principal]), 'es'));

  const editar = (item) => {
    const inputs = {};
    def.campos.forEach(c => {
      inputs[c.clave] = c.largo
        ? h('textarea', { maxlength: 500, style: { minHeight: '70px' } })
        : h('input', { type: c.tel ? 'tel' : 'text', value: item ? item[c.clave] || '' : '', maxlength: 120 });
      if (c.largo) inputs[c.clave].value = item ? item[c.clave] || '' : '';
    });
    abrirModal(cerrar => [
      h('h2', null, item ? item[def.principal] : 'Nuevo ' + def.singular),
      def.campos.map(c => h('label', { class: 'campo' }, h('span', null, c.etiqueta), inputs[c.clave])),
      h('button', {
        class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
          const datos = {};
          def.campos.forEach(c => { datos[c.clave] = inputs[c.clave].value.trim(); });
          if (item) datos[def.id] = item[def.id];
          await cargar(def.accionGuardar, datos);
          aviso('Guardado.', 'ok');
          invalidarDatos();
          cerrar();
          recargar();
        })
      }, 'Guardar'),
      item ? h('button', {
        class: item.activo === 'SI' ? 'btn btn-peligro' : 'btn btn-secundario',
        onclick: (ev) => conBoton(ev.currentTarget, async () => {
          const datos = { activo: item.activo === 'SI' ? 'NO' : 'SI' };
          def.campos.forEach(c => { datos[c.clave] = item[c.clave] || ''; });
          datos[def.id] = item[def.id];
          await cargar(def.accionGuardar, datos);
          invalidarDatos();
          cerrar();
          recargar();
        })
      }, item.activo === 'SI' ? 'Desactivar' : 'Reactivar') : null,
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
    ]);
  };

  poner(cont,
    h('button', { class: 'btn', onclick: () => editar(null) }, '+ Nuevo ' + def.singular),
    def.ayuda ? h('p', { class: 'suave chico' }, def.ayuda) : null,
    lista.length ? lista.map(item => h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' },
        h('span', { class: 'negrita crece' }, item[def.principal]),
        item.activo !== 'SI' ? h('span', { class: 'etiqueta inactiva' }, 'Inactivo') : null),
      item[def.secundario] ? h('div', { class: 'suave chico' }, item[def.secundario]) : null,
      h('div', { class: 'fila', style: { marginTop: '6px' } },
        item.telefono ? h('a', { href: 'tel:' + String(item.telefono).replace(/[^\d+]/g, ''), class: 'crece' }, '📞 ' + item.telefono) : h('span', { class: 'crece' }),
        h('button', { class: 'btn-link', onclick: () => editar(item) }, 'Editar'))))
      : vacio('Todavía no hay ' + def.plural + ' cargados.'));
}

export function pantallaServices(cont) {
  return pantallaContactos(cont, {
    ruta: 'admin/services', accionListar: 'listarServices', accionGuardar: 'guardarService', id: 'id_service',
    singular: 'service', plural: 'services', principal: 'empresa', secundario: 'especialidad',
    ayuda: 'Empresas o técnicos externos que atienden las máquinas. En la ficha de cada máquina elegís cuál es su service.',
    campos: [
      { clave: 'empresa', etiqueta: 'Empresa o técnico' }, { clave: 'contacto', etiqueta: 'Contacto' },
      { clave: 'telefono', etiqueta: 'Teléfono', tel: true }, { clave: 'especialidad', etiqueta: 'Especialidad (ej. Refrigeración)' },
      { clave: 'notas', etiqueta: 'Notas', largo: true }
    ]
  });
}

export function pantallaProveedores(cont) {
  return pantallaContactos(cont, {
    ruta: 'admin/proveedores', accionListar: 'listarProveedores', accionGuardar: 'guardarProveedor', id: 'id_proveedor',
    singular: 'proveedor', plural: 'proveedores', principal: 'nombre', secundario: 'rubro',
    ayuda: 'Casas de repuestos. Más adelante vas a poder elegir el proveedor al cargar el precio de un pedido.',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre' }, { clave: 'telefono', etiqueta: 'Teléfono', tel: true },
      { clave: 'rubro', etiqueta: 'Qué venden (ej. rodamientos, correas)' }, { clave: 'notas', etiqueta: 'Notas', largo: true }
    ]
  });
}

// ============================================================
//  Parámetros de los avisos automáticos
// ============================================================

const ETIQUETAS_CONFIG = {
  min_sin_atender: ['Falla sin atender', 'minutos sin que empiece la reparación', 'min'],
  min_reparacion_larga: ['Reparación muy larga', 'minutos de reparación abierta', 'min'],
  hora_total_no_cargado: ['Total diario no cargado', 'hora del aviso (si el mecánico trabajó ese día)', 'hora'],
  hora_resumen_semanal: ['Resumen semanal', 'hora del aviso de los lunes', 'hora'],
  dia_informe_mensual: ['Informe mensual (PDF)', 'día del mes en que llega (del mes anterior)', 'dia'],
  hora_informe_mensual: ['Informe mensual (PDF)', 'hora a la que llega', 'hora'],
  hora_preventivos_vencidos: ['Preventivos vencidos', 'hora del resumen diario', 'hora']
};

export async function pantallaAvisos(cont) {
  const config = await llamar('verConfig');
  const inputs = {};
  config.forEach(c => {
    const tipo = (ETIQUETAS_CONFIG[c.clave] || [])[2];
    inputs[c.clave] = tipo === 'hora'
      ? h('input', { type: 'time', value: c.valor })
      : h('input', { type: 'number', inputmode: 'numeric', min: 1, value: c.valor });
  });

  poner(cont,
    h('p', { class: 'suave' }, 'Cuándo te llegan los avisos automáticos por Telegram. Se revisan cada 15 minutos (se activan desde la planilla: menú Voglia › Activar avisos automáticos). Cada aviso llega una sola vez.'),
    config.map(c => {
      const et = ETIQUETAS_CONFIG[c.clave] || [c.clave, c.descripcion];
      return h('label', { class: 'campo' }, h('span', null, et[0]), inputs[c.clave],
        h('div', { class: 'suave chico', style: { marginTop: '4px' } }, et[1] +
          (c.clave === 'min_sin_atender' || c.clave === 'min_reparacion_larga' ? ' (60 = 1 hora, 480 = 8 horas)' : '')));
    }),
    h('button', {
      class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
        const valores = {};
        config.forEach(c => { valores[c.clave] = String(inputs[c.clave].value).trim(); });
        await cargar('guardarConfig', { valores });
        aviso('Parámetros guardados.', 'ok');
      })
    }, 'Guardar'));
}

// ============================================================
//  Visitas de services externos (solo admin: llevan costo)
// ============================================================

export async function pantallaVisitas(cont) {
  const [r, datos] = await Promise.all([llamar('listarVisitasService', {}), recargarDatos()]);
  const recargar = () => ir('registro/services');

  const nueva = () => {
    const maquina = h('select', null, h('option', { value: '' }, 'Elegí la máquina…'),
      [...datos.maquinas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
        .map(m => h('option', { value: m.id_maquina }, m.nombre)));
    const service = h('select', null, h('option', { value: '' }, 'Elegí el service…'),
      datos.services.map(s => h('option', { value: s.id_service }, s.empresa)));
    // Al elegir la máquina, se propone su service
    maquina.addEventListener('change', () => {
      const m = datos.maquinas.find(x => x.id_maquina === maquina.value);
      if (m && m.id_service) service.value = m.id_service;
    });
    const fecha = h('input', { type: 'date', value: hoyISO() });
    const tecnico = h('input', { type: 'text', maxlength: 80, placeholder: 'Opcional' });
    const trabajo = h('textarea', { maxlength: 2000, placeholder: 'Qué hizo el service' });
    const costo = h('input', { type: 'text', inputmode: 'numeric', placeholder: '$ 0',
      oninput: (ev) => { const n = Number(String(ev.target.value).replace(/\D/g, '')); ev.target.value = n ? n.toLocaleString('es-AR') : ''; } });
    abrirModal(cerrar => [
      h('h2', null, 'Registrar visita de service'),
      h('p', { class: 'suave chico' }, 'Para un service programado o una visita que no cierra una falla. Las fallas de Externas se cierran desde la máquina ("Registrar visita y cerrar").'),
      h('label', { class: 'campo' }, h('span', null, 'Máquina'), maquina),
      h('label', { class: 'campo' }, h('span', null, 'Service'), service),
      h('div', { class: 'opciones dos' },
        h('label', { class: 'campo' }, h('span', null, 'Fecha'), fecha),
        h('label', { class: 'campo' }, h('span', null, 'Costo ($)'), costo)),
      h('label', { class: 'campo' }, h('span', null, 'Técnico'), tecnico),
      h('label', { class: 'campo' }, h('span', null, 'Qué hizo'), trabajo),
      h('button', {
        class: 'btn', onclick: (ev) => conBoton(ev.currentTarget, async () => {
          const res = await cargar('guardarVisitaService', {
            id_maquina: maquina.value, id_service: service.value, fecha: fecha.value, tecnico: tecnico.value.trim(),
            trabajo: trabajo.value.trim(), costo: costo.value.replace(/\D/g, '')
          });
          aviso(res.mensaje, 'ok');
          cerrar();
          recargar();
        })
      }, 'Guardar'),
      h('button', { class: 'btn btn-secundario', onclick: cerrar }, 'Cancelar')
    ]);
  };

  poner(cont,
    h('button', { class: 'btn', onclick: nueva }, '+ Registrar visita'),
    h('div', { class: 'tarjeta' }, dato('Visitas', String(r.visitas.length)), dato('Total gastado', r.total_texto)),
    r.visitas.length ? r.visitas.map(v => h('div', { class: 'tarjeta' },
      h('div', { class: 'fila' }, h('span', { class: 'negrita crece' }, v.maquina), h('b', null, v.costo === '' ? '—' : pesos(v.costo))),
      h('div', null, v.service + (v.tecnico ? ' · ' + v.tecnico : '')),
      h('p', { class: 'chico' }, v.trabajo),
      h('div', { class: 'suave chico' }, fecha(v.fecha) + (v.id_incidente ? ' · cerró la falla ' + v.id_incidente : '') + ' · cargó ' + v.cargado_por)))
      : vacio('Todavía no hay visitas registradas.'));
}
