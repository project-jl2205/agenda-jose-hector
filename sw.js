// Service worker: guarda el esqueleto de la app para que abra rápido e instalable.
// Nunca guarda datos de Supabase (eso va siempre por la red, con su sesión).
// 7-nov-2026: la agenda es la v2 «Fluido» (v2/); index.html la abre y la de antes sigue en clasica.html.
const VERSION = 'agenda-jh-v3';
const ESQUELETO = [
  './v2/', './v2/index.html', './v2/css/fluido.css', './v2/js/app.js', './v2/js/motor.js',
  './v2/js/vistas/calendario.js', './v2/js/vistas/semana.js', './v2/js/vistas/hoy.js', './v2/js/vistas/notas.js',
  './v2/js/vistas/operaciones.js', './v2/vendor/lightweight-charts.standalone.production.js',
  './', './index.html', './clasica.html', './manifest.webmanifest', './css/base.css', './css/vistas.css',
  './js/app.js', './js/config.js', './js/db.js', './js/demo.js', './js/store.js', './js/fechas.js',
  './js/recurrencia.js', './js/ui.js',
  './js/vistas/semana.js', './js/vistas/dia.js', './js/vistas/mercado.js', './js/vistas/setups.js',
  './js/vistas/winrate.js', './js/vistas/ajustes.js', './js/vistas/tarea-editor.js', './js/vistas/comentarios.js',
  './iconos/icono-192.png', './iconos/icono-512.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(ESQUELETO)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;   // datos: siempre red
  if (url.origin === location.origin) {
    // propio: primero la red (cambios al instante); sin red, lo guardado
    // no-cache: pregunta siempre al servidor si hay versión nueva (GitHub hace que el navegador guarde 10 min)
    ev.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // librerías con versión fija: primero lo guardado
    ev.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    })));
  }
});
