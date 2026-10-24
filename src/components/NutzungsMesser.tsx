// Misst still mit, welche Seite wie lange offen ist (lib/nutzung.ts).
// Sitzt in der Schale (Layout) und rendert nichts.

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useIdentity } from '../context/IdentityContext'
import { aufrufVon, speichereAufruf } from '../lib/nutzung'

export default function NutzungsMesser() {
  const { pathname } = useLocation()
  const { memberId } = useIdentity()
  const stand = useRef<{ pfad: string; von: string | null; seit: number }>({ pfad: pathname, von: null, seit: Date.now() })
  const member = useRef<string | null>(memberId ?? null)
  member.current = memberId ?? null

  function abschliessen(jetzt = Date.now()) {
    const s = stand.current
    const a = aufrufVon({ memberId: member.current, pfad: s.pfad, von: s.von, seit: s.seit, jetzt, breite: window.innerWidth })
    if (a) void speichereAufruf(a)
  }

  // Seitenwechsel: alte Seite abschliessen, neue beginnen.
  useEffect(() => {
    if (stand.current.pfad === pathname) return
    abschliessen()
    stand.current = { pfad: pathname, von: stand.current.pfad, seit: Date.now() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // App in den Hintergrund (Handy wegtippen) oder Tab zu: aktuelle Seite
  // abschliessen; beim Zurueckkommen zaehlt die Zeit neu.
  useEffect(() => {
    const onSicht = () => {
      if (document.visibilityState === 'hidden') abschliessen()
      else stand.current = { ...stand.current, seit: Date.now() }
    }
    document.addEventListener('visibilitychange', onSicht)
    window.addEventListener('pagehide', onSicht)
    return () => { document.removeEventListener('visibilitychange', onSicht); window.removeEventListener('pagehide', onSicht) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
