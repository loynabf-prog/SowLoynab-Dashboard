import { useEffect, useState } from 'react'
import { subscribeUpdate } from '../lib/swUpdate'

// Dezente Leiste unten: „Neue Version verfügbar → Aktualisieren".
// Nimmt den PWA-Cache-Reibungspunkt raus (kein App-Schließen mehr nötig).
export default function UpdatePrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => subscribeUpdate(() => setShow(true)), [])

  if (!show) return null
  return (
    <div className="update-toast" role="status">
      <span className="update-dot" />
      <span className="update-text">Neue Version verfügbar</span>
      <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>Aktualisieren</button>
      <button className="update-x" onClick={() => setShow(false)} aria-label="später">✕</button>
    </div>
  )
}
