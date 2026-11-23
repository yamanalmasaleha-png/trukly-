// BiteShark Pickup Pager Web Push Service Worker
//
// Security & Privacy Guarantees:
//   1. Registers ZERO `fetch` caching interceptors — `/api/*` and private responses
//      are NEVER cached or stored by this service worker.
//   2. Displays a lock-screen-safe visible notification on every `push` event
//      (satisfying WebKit/Safari 30-second visible notification enforcement).
//   3. Uses `tag` (`collapse_key`) to deduplicate at-least-once push retries.
//   4. Notification URLs use opaque `subscription_id` (`/#pager-ref=<id>`) rather
//      than exposing the private pager bearer UUID.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {};
  try {
    if (event.data) {
      data = event.data.json() || {};
    }
  } catch {
    data = {};
  }

  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title.trim().slice(0, 80)
    : 'BiteShark · Order Ready for Pickup';

  const body = typeof data.body === 'string' && data.body.trim()
    ? data.body.trim().slice(0, 180)
    : 'Your food order is ready at the pickup counter.';

  const subscriptionId = typeof data.subscription_id === 'string' ? data.subscription_id : null;
  const openUrl = typeof data.open_url === 'string' && data.open_url.startsWith('/') && !data.open_url.startsWith('//')
    ? data.open_url
    : (subscriptionId ? `/#pager-ref=${encodeURIComponent(subscriptionId)}` : '/#pager-ready');

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: typeof data.collapse_key === 'string' && data.collapse_key ? data.collapse_key : 'biteshark-pager-ready',
    renotify: false,
    requireInteraction: true,
    data: {
      subscription_id: subscriptionId,
      event_id: data.event_id || null,
      open_url: openUrl
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const subscriptionId = notifData.subscription_id || null;
  const targetRelUrl = typeof notifData.open_url === 'string' && notifData.open_url.startsWith('/') && !notifData.open_url.startsWith('//')
    ? notifData.open_url
    : '/';

  event.waitUntil(
    (async () => {
      const targetUrl = new URL(targetRelUrl, self.location.origin).href;
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of windowClients) {
        try {
          const clientOrigin = new URL(client.url).origin;
          if (clientOrigin === self.location.origin) {
            client.postMessage({
              type: 'BITESHARK_OPEN_PAGER_REF',
              subscription_id: subscriptionId,
              event_id: notifData.event_id || null
            });
            if (typeof client.focus === 'function') {
              await client.focus();
            }
            return;
          }
        } catch {}
      }

      if (typeof self.clients.openWindow === 'function') {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
