// Pilot in der Kundenakte: Monatsbalken, Prognose, Stufen, Kontrollstempel
// und die Vorschlaege nur fuer diesen Kunden.

import { useMemo, useState } from 'react'
import { Compass, ClipboardCheck } from 'lucide-react'
import { LageBalken, PilotListe, Stufen, usePilot } from './Pilot'
import KontrolleSheet from './Kontrolle'
import { kurzDatum, monatName } from '../lib/pilot'

export default function PilotStreifen({ clientId }: { clientId: string }) {
  const { pilot, neu } = usePilot()
  const [kontrolle, setKontrolle] = useState(false)
  const lage = useMemo(() => pilot?.lagen.find((l) => l.kunde.client_id === clientId) ?? null, [pilot, clientId])
  const liste = useMemo(() => (pilot?.empfehlungen ?? []).filter((e) => e.clientId === clientId), [pilot, clientId])
  if (!pilot || !lage) return null
  const k = lage.kunde
  return (
    <section className={`pl-streifen ${lage.gruen ? 'gruen' : ''}`} aria-label="Pilot">
      <div className="pl-streifen-kopf">
        <Compass strokeWidth={2.4} /> Pilot
        {k.ziel > 0 && !lage.pausiert && !lage.gruen && <span className={`pl-prognose ${lage.ampel}`}>Prognose {lage.prognose} von {k.ziel}</span>}
        {lage.gruen && <span className="pl-prognose gruen">{monatName(k.monat)} ✓</span>}
      </div>
      <LageBalken l={lage} />
      <span className="pl-satz">{lage.satz}</span>
      <Stufen k={k} />
      <button className="pl-stempel" onClick={() => setKontrolle(true)}>
        <ClipboardCheck strokeWidth={2.2} />
        <span>
          <strong>{lage.gruen ? `${monatName(k.monat)} abgeschlossen` : lage.geprueftBis ? `Geprüft bis ${kurzDatum(lage.geprueftBis)}` : 'Noch nicht kontrolliert'}</strong>
          <small>{lage.gruen ? 'Alles bis Monatsende geprüft' : 'Posts im CRM, Links, Zahlen — dann Stempel setzen'}</small>
        </span>
        <em>{lage.gruen ? 'Ändern' : 'Kontrolle'}</em>
      </button>
      <PilotListe liste={liste} onNeu={neu} ohneKunde />
      {kontrolle && <KontrolleSheet clientId={clientId} kunde={k.name} onZu={() => setKontrolle(false)} onFertig={neu} />}
    </section>
  )
}
