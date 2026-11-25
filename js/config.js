/**
 * ============================================================
 *  Voglia Mantenimiento — config.js
 *  Dirección del backend (Web App de Apps Script).
 *
 *  Esta URL NO es un secreto: el backend pide el PIN / token
 *  en cada acción y controla el rol. Los secretos de verdad
 *  (webhook de n8n, clave de los PINs) están en Apps Script.
 * ============================================================
 */

// URL de la implementación del Web App (termina en /exec)
const URL_PRODUCCION = 'PEGAR_ACA_LA_URL_EXEC';

// Si la app se abre desde la compu con el servidor de prueba
// (pruebas/frontend/servidor_local.js), usa el backend simulado.
const ES_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_URL = ES_LOCAL ? '/api' : URL_PRODUCCION;
export const MODO_PRUEBA = ES_LOCAL;
