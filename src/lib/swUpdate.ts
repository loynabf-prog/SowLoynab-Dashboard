// Service-Worker-Registrierung + Erkennung neuer Versionen.
// Wenn eine neue Version deployt wurde, wird das der App gemeldet, damit sie
// eine „Aktualisieren"-Leiste zeigt (kein manuelles App-Schließen mehr nötig).

let updated = false
const subs = new Set<() => void>()

export function subscribeUpdate(cb: () => void): () => void {
  subs.add(cb)
  if (updated) cb()
  return () => { subs.delete(cb) }
}

function fire() {
  updated = true
  subs.forEach((c) => c())
}

export function registerSW() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      // Schon eine wartende Version vorhanden?
      if (reg.waiting && navigator.serviceWorker.controller) fire()

      // Neue Version wird installiert -> melden, sobald sie bereit ist
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) fire()
        })
      })

      // Regelmäßig + beim Zurückkehren zur App nach Updates schauen
      setInterval(() => reg.update().catch(() => {}), 60_000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    })
    .catch(() => {})
}
