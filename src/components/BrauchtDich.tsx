// "Braucht dich" -- das Cockpit auf Heute (15.11.2026, CRM auf 10/10).
// ---------------------------------------------------------------------------
// Alles, was sonst im Kopf oder auf fuenf Seiten liegt, als eine kurze Liste.
// Es steht nur da, was wirklich wartet -- sonst eine Zeile "Alles im Griff".
//   - Videos, die auf Freigabe warten (produktion_stufe = pruefung)
//   - Schnitt-Auftraege, die seit ueber 24 h haengen
//   - ueberfaellige Rechnungen
//   - Leads, die dran sind (Follow-up faellig oder neu ohne naechsten Schritt)
//   - kein Job gestempelt (zur Arbeitszeit) -- damit die Zeiterfassung lebt

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Eye, Flame, ReceiptEuro, Target, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { heute as heuteIso } from '../lib/datum'
import { useIdentity } from '../context/IdentityContext'
import { useLaufend } from '../lib/jobs'

interface Punkt { key: string; icon: LucideIcon; farbe: 'rot' | 'gelb' | 'glut' | 'blau' | 'grau'; text: string; sub?: string; ziel: string | (() => void) }

const tageSeit = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400_000))
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function BrauchtDich() {
  const navigate = useNavigate()
  const { memberId } = useIdentity()
  const { laufend } = useLaufend(memberId)
  const [punkte, setPunkte] = useState<Punkt[] | null>(null)

  const laden = useCallback(async () => {
    const tag = heuteIso()
    const gestern = new Date(Date.now() - 86400_000).toISOString()
    const [freigabe, auftraege, rechnungen, leads, kunden] = await Promise.all([
      supabase.from('videos').select('id, client_id').eq('produktion_stufe', 'pruefung').is('deleted_at', null).neq('status', 'posted'),
      supabase.from('produktion_auftraege').select('id, client_id, updated_at, schritt').in('status', ['wartet', 'laeuft']).is('deleted_at', null).lt('updated_at', gestern),
      supabase.from('invoices').select('id, number, client_id, gross, amount, open_amount, due_date, recipient').eq('status', 'sent').lt('due_date', tag),
      supabase.from('leads').select('id, name, stage, next_followup').is('deleted_at', null).in('stage', ['new', 'contacted', 'talking']),
      supabase.from('clients').select('id, name'),
    ])
    const name = new Map(((kunden.data ?? []) as any[]).map((k) => [k.id, k.name as string]))
    const p: Punkt[] = []

    // Freigaben je Kunde
    const jeKunde = new Map<string, number>()
    for (const v of (freigabe.data ?? []) as any[]) jeKunde.set(v.client_id, (jeKunde.get(v.client_id) ?? 0) + 1)
    for (const [cid, n] of jeKunde) {
      p.push({ key: 'f' + cid, icon: Eye, farbe: 'glut', text: `${name.get(cid) ?? 'Kunde'}: ${n} ${n === 1 ? 'Video wartet' : 'Videos warten'} auf Freigabe`, sub: 'Vorschau ansehen, Korrekturen im Chat', ziel: '/schnitt' })
    }
    for (const a of (auftraege.data ?? []) as any[]) {
      p.push({ key: 'a' + a.id, icon: Flame, farbe: 'rot', text: `Schnitt hängt seit ${tageSeit(a.updated_at)} ${tageSeit(a.updated_at) === 1 ? 'Tag' : 'Tagen'}: ${name.get(a.client_id) ?? 'Kunde'}`, sub: a.schritt ?? undefined, ziel: '/ofen' })
    }
    for (const r of (rechnungen.data ?? []) as any[]) {
      const betrag = Number(r.open_amount ?? r.gross ?? r.amount ?? 0)
      p.push({ key: 'r' + r.id, icon: ReceiptEuro, farbe: 'rot', text: `Rechnung ${r.number ?? ''} überfällig – ${name.get(r.client_id) ?? r.recipient ?? ''}`.trim(), sub: `${betrag ? euro(betrag) + ' · ' : ''}seit ${tageSeit(r.due_date)} Tagen fällig`, ziel: '/rechnungen' })
    }
    const ls = (leads.data ?? []) as any[]
    const faellig = ls.filter((l) => l.next_followup && l.next_followup <= tag)
    const ohneSchritt = ls.filter((l) => !l.next_followup && l.stage === 'new')
    if (faellig.length) {
      p.push({ key: 'lf', icon: Target, farbe: 'gelb', text: `${faellig.length} ${faellig.length === 1 ? 'Lead ist' : 'Leads sind'} heute dran`, sub: faellig.slice(0, 3).map((l) => l.name).join(', ') + (faellig.length > 3 ? ' …' : ''), ziel: '/leads' })
    }
    if (ohneSchritt.length) {
      p.push({ key: 'ln', icon: Target, farbe: 'grau', text: `${ohneSchritt.length} neue Leads ohne nächsten Schritt`, sub: 'Ansprechen oder Follow-up-Datum setzen', ziel: '/leads' })
    }
    setPunkte(p)
  }, [])

  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    const neu = () => laden()
    window.addEventListener('daten-geaendert', neu)
    const t = window.setInterval(laden, 5 * 60_000)
    return () => { window.removeEventListener('daten-geaendert', neu); window.clearInterval(t) }
  }, [laden])

  if (!punkte) return null
  const stunde = new Date().getHours()
  const alle: Punkt[] = [...punkte]
  if (memberId && !laufend && stunde >= 8 && stunde < 20) {
    alle.push({ key: 'job', icon: Timer, farbe: 'blau', text: 'Kein Job aktiv', sub: 'Antippen und einstempeln – sonst zählt die Zeit nicht mit', ziel: () => window.dispatchEvent(new Event('open-stempeluhr')) })
  }

  return (
    <section className={`st-block ${alle.length ? 'da' : 'leer'} bd`}>
      <div className="st-kopf">
        <span className="st-ic"><Flame strokeWidth={2.2} /></span>
        <h2>Braucht dich</h2>
        {alle.length ? <span className="st-zahl">{alle.length}</span> : <span className="st-nichts"><Check strokeWidth={2.6} /> Alles im Griff</span>}
      </div>
      {alle.length > 0 && (
        <div className="st-liste">
          {alle.map((x) => (
            <button key={x.key} className="bd-zeile" onClick={() => (typeof x.ziel === 'string' ? navigate(x.ziel) : x.ziel())}>
              <span className={`bd-ic ${x.farbe}`}><x.icon size={16} strokeWidth={2.3} /></span>
              <span className="bd-text"><strong>{x.text}</strong>{x.sub && <small>{x.sub}</small>}</span>
              <ChevronRight size={16} className="bd-pfeil" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
