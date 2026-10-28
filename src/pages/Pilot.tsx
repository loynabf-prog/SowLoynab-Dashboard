// /pilot: die Lage aller Kunden und alles, was der Pilot vorschlaegt.
// ---------------------------------------------------------------------------
// Oben jeder Kunde mit Monatsbalken (gepostet gegen Ziel, Marke = Soll
// heute), Prognose und den Pizza-Stufen. Darunter die Empfehlungen, meine
// zuerst. Die Regeln stehen in lib/pilot.ts, die Knoepfe in
// components/Pilot.tsx.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass, BookOpen } from 'lucide-react'
import { useIdentity } from '../context/IdentityContext'
import { meine, pilotSatz } from '../lib/pilot'
import { KundenZeile, PilotListe, usePilot } from '../components/Pilot'

export default function PilotSeite() {
  const { memberId } = useIdentity()
  const { pilot, fehler, neu } = usePilot()
  const [wer, setWer] = useState<'meine' | 'alle'>('meine')

  const liste = useMemo(() => {
    if (!pilot) return []
    return wer === 'meine' ? meine(pilot.empfehlungen, memberId) : pilot.empfehlungen
  }, [pilot, wer, memberId])

  const lagen = useMemo(() => (pilot?.lagen ?? []).filter((l) => l.kunde.client_type !== 'eigen'), [pilot])

  return (
    <div className="page">
      <div className="pl-kopf">
        <span className="pl-marke"><Compass strokeWidth={2.2} /></span>
        <div>
          <h1>Pilot</h1>
          <p>{pilot ? pilotSatz(liste) : 'Rechnet …'}</p>
        </div>
      </div>

      {fehler && <div className="error-box" style={{ marginBottom: 16 }}>{fehler}</div>}

      <div className="n-segment" role="tablist">
        <button className={wer === 'meine' ? 'on' : ''} onClick={() => setWer('meine')}>Meine <small>{pilot ? meine(pilot.empfehlungen, memberId).length : ''}</small></button>
        <button className={wer === 'alle' ? 'on' : ''} onClick={() => setWer('alle')}>Alle <small>{pilot?.empfehlungen.length ?? ''}</small></button>
      </div>

      {pilot && (
        <PilotListe liste={liste} onNeu={neu} leer={<div className="pl-leer">Nichts offen. Der Pilot hat keine Einwände.</div>} />
      )}

      <div className="n-abschnitt"><h2>Lage je Kunde</h2><span>{lagen.length}</span></div>
      {lagen.map((l) => <KundenZeile key={l.kunde.client_id} l={l} />)}

      <div className="n-abschnitt"><h2>So denkt der Pilot</h2></div>
      <div className="n-gruppe" style={{ padding: '14px 16px', fontSize: 14.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>
        <p style={{ margin: '0 0 8px' }}>Jeden Kunden misst er am Monatsziel: wo er heute nach Plan stehen müsste, und wie viele Videos bei diesem Tempo am Monatsende da sind. Dann schaut er 30 Tage voraus: Reicht, was in der Backstube liegt (Teller, Ofen, Zutaten)? Wenn nicht, braucht es einen Drehtag — und dafür Ideen.</p>
        <p style={{ margin: 0 }}>Jede Empfehlung hat genau einen Knopf. <Link to="/anleitung" style={{ color: 'var(--glut)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><BookOpen size={14} /> Anleitung lesen</Link></p>
      </div>
    </div>
  )
}
