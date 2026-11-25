/**
 * Total diario del mecánico.
 * PRIVACIDAD: una vez enviado, la app no guarda ni muestra el monto.
 * El backend tampoco lo devuelve (ver Pagos.gs).
 */
import { h, poner, aviso, conBoton, confirmar, pesos, leerMonto, fecha } from '../ui.js';
import { cargar } from '../api.js';

export async function pantallaTotal(cont) {
  const monto = h('input', {
    type: 'text', inputmode: 'numeric', placeholder: '$ 0', autocomplete: 'off',
    style: { fontSize: '28px', fontWeight: '700', textAlign: 'center' },
    oninput: (ev) => {
      // Muestra los puntos de miles mientras se escribe: 45000 → 45.000
      const n = leerMonto(ev.target.value);
      ev.target.value = isNaN(n) ? '' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
    }
  });
  const observacion = h('textarea', { placeholder: 'Observación (opcional)', maxlength: 500, style: { minHeight: '80px' } });
  const resultado = h('div');

  async function enviar(boton) {
    const total = leerMonto(monto.value);
    if (isNaN(total) || total <= 0) return aviso('Escribí el total del día.', 'error');

    const ok = await confirmar({
      titulo: 'Enviar total del día',
      texto: h('div', null,
        h('p', { style: { fontSize: '26px', fontWeight: '700', textAlign: 'center' } }, pesos(total)),
        h('p', null, 'Fecha: ' + fecha(new Date())),
        h('p', { class: 'suave' }, 'Revisalo bien: una vez enviado no lo vas a poder ver ni cambiar. Si te equivocás, avisale a Juan.')),
      si: 'Enviar'
    });
    if (!ok) return;

    await conBoton(boton, async () => {
      try {
        const r = await cargar('cargarTotalDiario', { total, observacion: observacion.value.trim() });
        monto.value = '';
        observacion.value = '';
        poner(resultado, h('div', { class: 'tarjeta', style: { background: 'var(--verde-claro)' } },
          h('p', { class: 'negrita' }, '✅ ' + (r.mensaje || 'Total enviado.')),
          h('p', { class: 'chico' }, 'Le llegó el aviso a Juan.')));
      } catch (e) {
        if (e.codigo === 'TOTAL_YA_CARGADO') {
          monto.value = '';
          poner(resultado, h('div', { class: 'tarjeta', style: { background: 'var(--amarillo-claro)' } },
            h('p', { class: 'negrita' }, e.message)));
          return;
        }
        throw e;
      }
    });
  }

  poner(cont,
    h('p', null, 'Al terminar el día, cargá el valor total de los trabajos que hiciste.'),
    h('p', { class: 'suave chico' }, 'Se carga una sola vez por día. Después de enviarlo no se puede ver.'),
    h('label', { class: 'campo' }, h('span', null, 'Total del día ($)'), monto),
    h('label', { class: 'campo' }, h('span', null, 'Observación'), observacion),
    h('button', { class: 'btn btn-verde', onclick: (ev) => enviar(ev.currentTarget) }, '💰 Enviar total'),
    resultado);
}
