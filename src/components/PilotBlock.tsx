// Pilot auf Heute: dunkle Kachel mit den drei wichtigsten Vorschlaegen fuer
// mich -- und dem Weg zu allen (/pilot).

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Compass, ChevronRight } from 'lucide-react'
import { useIdentity } from '../context/IdentityContext'
import { meine } from '../lib/pilot'
import { PilotListe, usePilot } from './Pilot'

export default function PilotBlock() {
  const { memberId } = useIdentity()
  const { pilot, neu } = usePilot()
  const liste = useMemo(() => (pilot ? meine(pilot.empfehlungen, memberId) : []), [pilot, memberId])
  const top = liste.slice(0, 3)
  const rot = liste.filter((x) => x.ampel === 'rot').length

  return (
    <section className="pl-kachel" aria-label="Pilot">
      <div className="pl-kachel-kopf">
        <span className="pl-marke"><Compass strokeWidth={2.2} /></span>
        <div>
          <strong>Pilot</strong>
          <span>{!pilot ? 'Rechnet …' : liste.length === 0 ? 'Keine Einwände' : `${liste.length} ${liste.length === 1 ? 'Vorschlag' : 'Vorschläge'}${rot ? ` · ${rot} dringend` : ''}`}</span>
        </div>
        <Link to="/pilot" className="n-mehr-link">Alle <ChevronRight size={16} /></Link>
      </div>
      {pilot && (
        <PilotListe liste={top} onNeu={neu} kompakt leer={<div className="pl-ruhig">Alle Kunden im Plan, Vorrat reicht. Weiter so.</div>} />
      )}
    </section>
  )
}
