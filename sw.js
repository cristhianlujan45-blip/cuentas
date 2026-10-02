/* Vento · avisos de pagos con la app cerrada (Web Push).
   Solo maneja notificaciones: NO intercepta la carga de páginas (no hay «fetch»), así que no cambia
   cómo abre ni cómo se actualiza Vento. */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = { titulo: '💜 Vento', cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || '💜 Vento', {
    body: d.cuerpo || '',
    icon: 'icons/vento-192.png',
    badge: 'icons/vento-64.png',
    tag: d.tag || 'vento-pago',
    renotify: true,
    vibrate: [150, 80, 150],
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(lista){
    for(var i = 0; i < lista.length; i++){ if('focus' in lista[i]) return lista[i].focus(); }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
