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

/* ---- Offline-Cache (App öffnet auch ohne Netz) ---- */
const CACHE = 'sl-cache-v1'

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Network-first mit Cache-Fallback: online immer frisch, offline letzter Stand.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // nur eigene Assets/Seiten
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {})
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        // Navigations-Fallback -> Startseite aus Cache
        if (req.mode === 'navigate') {
          const shell = await caches.match('/')
          if (shell) return shell
        }
        throw new Error('offline, kein Cache')
      }),
  )
})
