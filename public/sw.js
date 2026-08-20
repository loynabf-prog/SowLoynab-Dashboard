/* Service Worker für Sow & Loynab Board — Handy-Push (Web Push) */

// Push empfangen -> System-Benachrichtigung anzeigen
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Sow & Loynab'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { link: data.link || '/' },
    vibrate: [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Antippen -> App öffnen bzw. fokussieren und zur verlinkten Stelle springen
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus()
          client.postMessage({ type: 'nudge-open', link })
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link)
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('install', () => {
  self.skipWaiting()
})
