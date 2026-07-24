// === Service Worker для Push-уведомлений Mortis Play ===
const CACHE_NAME = 'mortisplay-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Слушаем сообщения от основного скрипта
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, tag, data } = event.data.payload;
    
    self.registration.showNotification(title, {
      body: body,
      icon: icon || '/assets/photo.jpg',
      badge: '/images/favicon.ico',
      tag: tag || 'community-notification',
      data: data || {},
      vibrate: [200, 100, 200],
      requireInteraction: true,
      silent: false
    });
  }
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Если уже есть открытая вкладка — фокусируем её
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Иначе открываем новую
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});