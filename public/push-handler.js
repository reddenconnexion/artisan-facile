// Web Push event handler – imported by the generated service worker
// Runs even when the app is closed/killed on mobile

self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch {
        data = { title: 'Artisan Facile', body: event.data.text() };
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'Artisan Facile', {
            body: data.body || '',
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: data.tag || 'artisan-facile',
            renotify: true,
            data: { url: data.url || '/app/devis' },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/app/devis';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
