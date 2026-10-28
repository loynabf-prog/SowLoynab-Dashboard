// Pilot in der Kundenakte: Monatsbalken, Prognose, Stufen und die
// Vorschlaege nur fuer diesen Kunden.

import { useMemo } from 'react'
import { Compass } from 'lucide-react'
import { LageBalken, PilotListe, Stufen, usePilot } from './Pilot'

export default function PilotStreifen({ clientId }: { clientId: string }) {
  const { pilot, neu } = usePilot()
  const lage = useMemo(() => pilot?.lagen.find((l) => l.kunde.client_id === clientId) ?? null, [pilot, clientId])
  const liste = useMemo(() => (pilot?.empfehlungen ?? []).filter((e) => e.clientId === clientId), [pilot, clientId])
  if (!pilot || !lage) return null
  const k = lage.kunde
  return (
    <section className="pl-streifen" aria-label="Pilot">
      <div className="pl-streifen-kopf">
        <Compass strokeWidth={2.4} /> Pilot
        {k.ziel > 0 && !lage.pausiert && <span className={`pl-prognose ${lage.ampel}`}>Prognose {lage.prognose} von {k.ziel}</span>}
      </div>
      <LageBalken l={lage} />
      <span className="pl-satz">{lage.satz}</span>
      <Stufen k={k} />
      <PilotListe liste={liste} onNeu={neu} ohneKunde />
    </section>
  )
}
