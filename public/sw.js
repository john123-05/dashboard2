// Push notification service worker for the staff/operator area. Registered
// from the Einstellungen page once a staff member opts in — this file has
// no dependency on the React app, it just needs to exist at the site root
// so its scope covers the whole origin.

const LOGO_URL = 'https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test/Liftpicutures%20Logo%20alt.jpg';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Liftpictures Operator-Tools', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Liftpictures Operator-Tools';
  const options = {
    body: data.body || '',
    icon: LOGO_URL,
    badge: LOGO_URL,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
