// Zahlen -- Umsatz. Nur Ergebnis: was diesen Monat gestellt, bezahlt und
// offen ist, die Meilensteine, die letzten Monate. Rechnet lib/spiel.ts
// (umsatzStand), dieselbe Logik wie im Spiel.

import { useEffect, useMemo, useState } from 'react'
import { Euro } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { heute as heuteIso } from '../lib/datum'
import { MEILENSTEINE, monatName, umsatzStand, type SKunde, type SPlan, type UmsatzStand } from '../lib/spiel'
import '../styles/umsatz.css'

const euro = (v: number) => `${Math.round(v).toLocaleString('de-DE')} €`

export default function Umsatz() {
  const [kunden, setKunden] = useState<SKunde[]>([])
  const [plaene, setPlaene] = useState<SPlan[]>([])
  const [laedt, setLaedt] = useState(true)
  const heute = heuteIso()

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, name, client_type, monthly_fee, monthly_quota, active, pausiert_seit, logo_url, brand_color').is('deleted_at', null),
      supabase.from('client_month_plans').select('client_id, month_key, zahlstatus, betrag, quota, status, dabei'),
    ]).then(([k, p]) => { setKunden((k.data ?? []) as SKunde[]); setPlaene((p.data ?? []) as SPlan[]); setLaedt(false) })
  }, [])

  const u: UmsatzStand = useMemo(() => umsatzStand(kunden, plaene, heute), [kunden, plaene, heute])

  // Letzte sechs Monate: gestellt und bezahlt
  const monate = useMemo(() => {
    const m = new Map<string, { gestellt: number; bezahlt: number }>()
    for (const p of plaene) {
      if (p.dabei === false || !p.client_id) continue
      const b = Number(p.betrag ?? 0) || 0
      if (b <= 0) continue
      const e = m.get(p.month_key) ?? { gestellt: 0, bezahlt: 0 }
      e.gestellt += b; if (p.zahlstatus === 'bezahlt') e.bezahlt += b
      m.set(p.month_key, e)
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6)
  }, [plaene])
  const max = Math.max(1, ...monate.map(([, m]) => m.gestellt), u.gestellt)

  if (laedt) return <div className="um"><div className="um-leer">Lade …</div></div>
  return (
    <div className="um">
      <section className="um-karte um-haupt">
        <div className="um-kopf"><Euro strokeWidth={2.2} /><span>{monatName(u.monat)}</span></div>
        <div className="um-gross">{euro(u.gestellt)}</div>
        <div className="um-balken"><i style={{ width: `${Math.round(u.fortschritt * 100)}%` }} /></div>
        <div className="um-klein">
          <span><b>{euro(u.bezahlt)}</b> bezahlt</span>
          <span><b>{euro(u.offen)}</b> offen</span>
          <span>{u.naechster ? <>nächstes Ziel <b>{euro(u.naechster)}</b></> : 'alle Ziele erreicht'}</span>
        </div>
        <div className="um-meilensteine">
          {MEILENSTEINE.map((m) => <span key={m} className={u.erreicht.includes(m) ? 'da' : m === u.naechster ? 'naechster' : ''}>{m >= 1000 ? `${m / 1000}k` : m}</span>)}
        </div>
      </section>

      <section className="um-karte">
        <h2>Je Kunde</h2>
        <ul className="um-liste">
          {u.proKunde.map((k) => (
            <li key={k.id}>
              <span><strong>{k.name}</strong><small>{k.geschaetzt ? 'ohne Monatsplan · Honorar angenommen' : k.zahlstatus === 'bezahlt' ? 'bezahlt' : k.zahlstatus === 'rechnung' ? 'Rechnung raus' : 'offen'}</small></span>
              <b className={k.zahlstatus === 'bezahlt' ? 'gruen' : ''}>{euro(k.betrag)}</b>
            </li>
          ))}
          {u.proKunde.length === 0 && <li className="leer">Noch kein Umsatz in diesem Monat eingetragen.</li>}
        </ul>
      </section>

      <section className="um-karte">
        <h2>Die letzten Monate</h2>
        <div className="um-monate">
          {monate.map(([key, m]) => (
            <div key={key} className="um-monat">
              <span className="um-monat-name">{monatName(key).replace(/ \d{4}$/, '')}</span>
              <div className="um-monat-balken">
                <i className="gestellt" style={{ width: `${(m.gestellt / max) * 100}%` }} />
                <i className="bezahlt" style={{ width: `${(m.bezahlt / max) * 100}%` }} />
              </div>
              <span className="um-monat-zahl">{euro(m.gestellt)}</span>
            </div>
          ))}
          {monate.length === 0 && <div className="um-leer">Noch keine Monatspläne mit Beträgen.</div>}
        </div>
        <p className="um-fuss">Dunkel = gestellt, orange = davon bezahlt. Bisher bezahlt insgesamt: <b>{euro(u.gesamtBezahlt)}</b>{u.bester ? <> · bester Monat {monatName(u.bester.key)} mit <b>{euro(u.bester.betrag)}</b></> : null}.</p>
      </section>
    </div>
  )
}
