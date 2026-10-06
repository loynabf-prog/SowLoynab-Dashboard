// Der Assistent: Auftrag sagen, Plan sehen, bestätigen.
// ---------------------------------------------------------------------------
// Drei Zustände, mehr braucht es nicht:
//
//   eingabe  -- der Auftrag, in Alltagssprache. Diktieren geht mit der
//               Mikrofontaste der Handytastatur.
//   plan     -- was passieren WIRD, Schritt für Schritt. Nichts ist bisher
//               geschehen. Einzelne Schritte lassen sich abwählen.
//   ergebnis -- was passiert IST, Schritt für Schritt, mit Haken oder Fehler.
//
// Der Plan-Schritt ist der wichtigste. Bei zwölf Videokarten will man vorher
// sehen, ob der Rhythmus stimmt -- hinterher ist es Aufräumarbeit.

import { useEffect, useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import { beschreibe, fuehreAus, pruefe, type Schritt, type SchrittErgebnis } from '../lib/assistent'

type Phase = 'eingabe' | 'denkt' | 'plan' | 'laeuft' | 'ergebnis'
interface Kunde { id: string; name: string; monthly_quota: number | null }

const BEISPIELE = [
  'Neuer Kunde Pizzeria Bella, 1.200 € im Monat, 12 Videos ab November, immer am 1., 3., 5.',
  'Für Schleckofatz im November 16 Videos, aber am 17. und 18. nicht.',
  'Trag mir Freitag ab 16 Uhr Arbeitszeit ein.',
  'Drei Leads: Café Nord in Münster, angeschrieben. Burger Base, im Gespräch, 800 € möglich. Eisdiele Luna, Angebot raus.',
]

export default function AssistentPanel({ onClose, onFertig }: { onClose: () => void; onFertig: () => void }) {
  const { user } = useAuth()
  const { members } = useTeam()
  const [phase, setPhase] = useState<Phase>('eingabe')
  const [text, setText] = useState('')
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [leads, setLeads] = useState<{ id: string; name: string }[]>([])
  const [schritte, setSchritte] = useState<Schritt[]>([])
  const [aktiv, setAktiv] = useState<boolean[]>([])
  const [antwort, setAntwort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [beanstandet, setBeanstandet] = useState<string[]>([])
  const [ergebnis, setErgebnis] = useState<SchrittErgebnis[]>([])

  useEffect(() => {
    supabase.from('clients').select('id, name, monthly_quota').is('deleted_at', null).order('name')
      .then(({ data }) => setKunden((data ?? []) as Kunde[]))
    supabase.from('leads').select('id, name').is('deleted_at', null).order('name')
      .then(({ data }) => setLeads((data ?? []) as { id: string; name: string }[]))
  }, [])

  /** Name eines Kunden für die Vorschau -- auch für noch gar nicht angelegte. */
  function kundenName(b: { client_id?: string | null; client_ref?: string | null }): string {
    if (b.client_id) return kunden.find((k) => k.id === b.client_id)?.name ?? 'diesen Kunden'
    if (b.client_ref) {
      const neu = schritte.find((s) => s.art === 'kunde_anlegen' && (s as any).ref === b.client_ref)
      return neu ? `„${(neu as any).name}"` : 'den neuen Kunden'
    }
    return 'ohne Kunde'
  }

  async function planen() {
    if (!text.trim()) return
    setPhase('denkt')
    setFehler(null)
    const { data, error } = await supabase.functions.invoke('assistent', {
      body: {
        text: text.trim(),
        context: {
          today: new Date().toISOString().slice(0, 10),
          clients: kunden,
          leads,
          members: members.map((m) => ({ id: m.id, name: m.name })),
        },
      },
    })
    if (error || (data as any)?.error) {
      setFehler((data as any)?.error ?? error?.message ?? 'Der Assistent antwortet nicht.')
      setPhase('eingabe')
      return
    }
    const s = ((data as any).schritte ?? []) as Schritt[]
    setAntwort(String((data as any).text ?? ''))
    setSchritte(s)
    setAktiv(s.map(() => true))
    setBeanstandet(pruefe(s))
    setPhase(s.length === 0 ? 'eingabe' : 'plan')
    if (s.length === 0 && !((data as any).text)) setFehler('Daraus konnte ich keinen Plan machen. Sag es gerne anders.')
  }

  async function ausfuehren() {
    const gewaehlt = schritte.filter((_, i) => aktiv[i])
    if (gewaehlt.length === 0) return
    setPhase('laeuft')
    const r = await fuehreAus(gewaehlt, user?.id ?? null)
    setErgebnis(r)
    setPhase('ergebnis')
    if (r.some((x) => x.ok)) onFertig()
  }

  const gewaehlteAnzahl = aktiv.filter(Boolean).length

  return (
    <Modal title="✨ Assistent" onClose={onClose}>
      <div className="stack">
        {fehler && <div className="error-box">{fehler}</div>}

        {(phase === 'eingabe' || phase === 'denkt') && (
          <>
            <p className="info-box" style={{ fontSize: 13 }}>
              Sag, was passieren soll — ruhig mehrere Sachen in einem Satz. Du siehst
              den Plan, bevor etwas angelegt wird.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="z. B. Neuer Kunde Pizzeria Bella, 1.200 € im Monat, 12 Videos ab November …"
              style={{ minHeight: 110 }}
              autoFocus
              disabled={phase === 'denkt'}
            />
            {phase === 'eingabe' && (
              <div className="as-beispiele">
                {BEISPIELE.map((b) => (
                  <button key={b} type="button" className="as-beispiel" onClick={() => setText(b)}>{b}</button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
              <div className="spacer" />
              <button type="button" className="btn btn-primary" onClick={planen} disabled={phase === 'denkt' || !text.trim()}>
                {phase === 'denkt' ? 'Überlegt …' : 'Plan zeigen'}
              </button>
            </div>
          </>
        )}

        {(phase === 'plan' || phase === 'laeuft') && (
          <>
            {antwort && <p className="info-box" style={{ fontSize: 13 }}>{antwort}</p>}

            <div>
              <label>Das würde passieren <span className="muted">— noch ist nichts geschehen</span></label>
              <div className="as-liste">
                {schritte.map((s, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`as-schritt ${aktiv[i] ? 'on' : 'aus'}`}
                    onClick={() => setAktiv((a) => a.map((x, j) => (j === i ? !x : x)))}
                    disabled={phase === 'laeuft'}
                  >
                    <span className="as-nr">{aktiv[i] ? '✓' : '○'}</span>
                    <span className="as-text">{beschreibe(s, kundenName)}</span>
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Schritt antippen, um ihn wegzulassen.
              </p>
            </div>

            {beanstandet.length > 0 && (
              <div className="warn-box" style={{ fontSize: 12.5 }}>
                {beanstandet.map((b, i) => <div key={i}>⚠ {b}</div>)}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPhase('eingabe')} disabled={phase === 'laeuft'}>
                Zurück
              </button>
              <div className="spacer" />
              <button
                type="button"
                className="btn btn-primary"
                onClick={ausfuehren}
                disabled={phase === 'laeuft' || gewaehlteAnzahl === 0 || beanstandet.length > 0}
              >
                {phase === 'laeuft' ? 'Legt an …' : `${gewaehlteAnzahl} ausführen`}
              </button>
            </div>
          </>
        )}

        {phase === 'ergebnis' && (
          <>
            <div className="as-liste">
              {ergebnis.map((r, i) => (
                <div className={`as-schritt ${r.ok ? 'fertig' : 'kaputt'}`} key={i}>
                  <span className="as-nr">{r.ok ? '✓' : '✕'}</span>
                  <span className="as-text">{r.text}</span>
                </div>
              ))}
            </div>
            {ergebnis.some((r) => !r.ok) && (
              <div className="warn-box" style={{ fontSize: 12.5 }}>
                Beim ersten Fehler wurde abgebrochen — alles davor ist angelegt, alles
                danach nicht. So bleibt klar, wo du weitermachen musst.
              </div>
            )}
            <div className="modal-actions">
              <div className="spacer" />
              <button type="button" className="btn" onClick={() => { setText(''); setErgebnis([]); setSchritte([]); setPhase('eingabe') }}>
                Noch etwas
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>Fertig</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
