/**
 * ============================================================
 *  Voglia Mantenimiento — sw.js (service worker)
 *  Guarda la app en el celular para que abra sin señal.
 *
 *  - Al instalarse guarda todos los archivos de la app.
 *  - Los archivos de la app salen de lo guardado (abre al instante
 *    y sin señal). Los datos NO pasan por acá: van al backend
 *    (Apps Script) y la cola sin señal está en js/cola.js.
 *  - VERSION y ARCHIVOS los escribe herramientas/actualizar_sw.js
 *    (correrlo antes de publicar): si cambia un archivo cambia la
 *    versión, y los celulares bajan la app nueva solos.
 * ============================================================
 */
// <<GENERADO: no editar a mano — node herramientas/actualizar_sw.js>>
const VERSION = '4038314bfad0';
const ARCHIVOS = [
  './',
  'css/estilos.css',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icono-192.png',
  'icons/icono-512.png',
  'icons/icono-maskable-512.png',
  'icons/logo-voglia.png',
  'img/plano-planta.svg',
  'index.html',
  'js/ajustes-cola.js',
  'js/almacen.js',
  'js/api.js',
  'js/app.js',
  'js/cola.js',
  'js/config.js',
  'js/datos/planos.js',
  'js/estado.js',
  'js/fotos.js',
  'js/graficos.js',
  'js/instalar.js',
  'js/pantallas/admin.js',
  'js/pantallas/cuenta.js',
  'js/pantallas/falla.js',
  'js/pantallas/fallas.js',
  'js/pantallas/historial.js',
  'js/pantallas/indicadores.js',
  'js/pantallas/ingreso.js',
  'js/pantallas/inicio.js',
  'js/pantallas/maquinas.js',
  'js/pantallas/pendientes.js',
  'js/pantallas/planta.js',
  'js/pantallas/preventivo.js',
  'js/pantallas/registro.js',
  'js/pantallas/reparacion.js',
  'js/pantallas/reportar.js',
  'js/pantallas/repuestos.js',
  'js/pantallas/tareas.js',
  'js/pantallas/total.js',
  'js/pantallas/trabajos.js',
  'js/repuestos-ui.js',
  'js/ui.js',
  'manifest.json'
];
// <</GENERADO>>

const CACHE = 'voglia-app-' + VERSION;

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  // Borra las versiones viejas de la app
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('voglia-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const pedido = ev.request;
  if (pedido.method !== 'GET') return; // el backend se llama con POST: no se toca
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return; // fotos de Drive, backend, etc.

  // Abrir la app (cualquier dirección dentro de la app) → index.html guardado
  if (pedido.mode === 'navigate') {
    ev.respondWith(caches.match('index.html').then((r) => r || fetch(pedido)));
    return;
  }
  // Archivos de la app: primero lo guardado; si no está, de internet (y se guarda)
  ev.respondWith(
    caches.match(pedido, { ignoreSearch: true }).then((guardado) => guardado || fetch(pedido).then((resp) => {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(pedido, copia));
      }
      return resp;
    }))
  );
});
