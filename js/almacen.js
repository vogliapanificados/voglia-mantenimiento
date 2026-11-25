/**
 * ============================================================
 *  Voglia Mantenimiento — almacen.js
 *  Guardado en el celular (IndexedDB) para trabajar sin señal:
 *   - "cola":     cargas que esperan ser enviadas (con sus fotos)
 *   - "lecturas": lo último que se vio de cada pantalla
 *  Si el navegador no tiene IndexedDB, se usa la memoria
 *  (se pierde al cerrar la app, pero la app sigue andando).
 * ============================================================
 */
const NOMBRE_BASE = 'voglia-mantenimiento';
const VERSION_BASE = 1;
export const COLA = 'cola';
export const LECTURAS = 'lecturas';

let abriendo = null;
const memoria = { [COLA]: new Map(), [LECTURAS]: new Map() };
const claves = { [COLA]: 'id_cliente', [LECTURAS]: 'clave' };

function abrir() {
  if (!('indexedDB' in window) || !window.indexedDB) return Promise.resolve(null);
  if (!abriendo) {
    abriendo = new Promise((resolver) => {
      let pedido;
      try { pedido = indexedDB.open(NOMBRE_BASE, VERSION_BASE); } catch (e) { resolver(null); return; }
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains(COLA)) db.createObjectStore(COLA, { keyPath: 'id_cliente' });
        if (!db.objectStoreNames.contains(LECTURAS)) db.createObjectStore(LECTURAS, { keyPath: 'clave' });
      };
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => resolver(null); // por ejemplo, Safari en modo privado
    });
  }
  return abriendo;
}

/** Ejecuta una operación sobre un almacén y devuelve su resultado. */
async function operar(almacen, modo, fn) {
  const db = await abrir();
  if (!db) { const r = fn(null); return r ? r.result : undefined; }
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(almacen, modo);
    const pedido = fn(tx.objectStore(almacen));
    tx.oncomplete = () => resolver(pedido ? pedido.result : undefined);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  });
}

export function guardar(almacen, objeto) {
  return operar(almacen, 'readwrite', (s) => s ? s.put(objeto) : void memoria[almacen].set(objeto[claves[almacen]], structuredCloneSeguro(objeto)));
}

export function leer(almacen, clave) {
  return operar(almacen, 'readonly', (s) => s ? s.get(clave) : { result: structuredCloneSeguro(memoria[almacen].get(clave)) });
}

export function todos(almacen) {
  return operar(almacen, 'readonly', (s) => s ? s.getAll() : { result: [...memoria[almacen].values()].map(structuredCloneSeguro) });
}

export function borrar(almacen, clave) {
  return operar(almacen, 'readwrite', (s) => s ? s.delete(clave) : void memoria[almacen].delete(clave));
}

export function vaciar(almacen) {
  return operar(almacen, 'readwrite', (s) => s ? s.clear() : void memoria[almacen].clear());
}

function structuredCloneSeguro(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}
