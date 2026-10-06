// Einen Termin anlegen oder aendern: Arbeitszeit, Spiel, sonstiger Termin.
// ---------------------------------------------------------------------------
// Alles, was den Tag belegt, aber weder Video noch Aufgabe ist. Ohne das
// weiss der eine nie, wann der andere kann.
//
// "Für wen" ist die wichtigste Angabe und steht deshalb weit oben:
// niemand ausgewaehlt heisst "fuer alle" -- der haeufigere Fall, fuer den
// man nichts tun muss.

import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import type { CalEventRow, EventKind } from '../lib/types'

const ARTEN: { key: EventKind; icon: string; label: string; hinweis: string }[] = [
  { key: 'arbeit', icon: '💼', label: 'Arbeitszeit', hinweis: 'Hauptjob, Schicht — da geht nichts anderes.' },
  { key: 'spiel', icon: '⚽', label: 'Spiel', hinweis: 'Spielplan, Training.' },
  { key: 'termin', icon: '📍', label: 'Termin', hinweis: 'Alles andere: Kundentermin, Arzt, privat.' },
]

export default function TerminModal({
  termin,
  datum,
  userId,
  onClose,
  onSaved,
}: {
  termin: CalEventRow | null
  /** Vorbelegtes Datum, wenn man im Kalender auf einen Tag getippt hat. */
  datum?: string
  userId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { members } = useTeam()
  const [title, setTitle] = useState(termin?.title ?? '')
  const [kind, setKind] = useState<EventKind>(termin?.kind ?? 'termin')
  const [von, setVon] = useState(termin?.starts_on ?? datum ?? new Date().toISOString().slice(0, 10))
  const [bis, setBis] = useState(termin?.ends_on ?? '')
  const [startZeit, setStartZeit] = useState(termin?.starts_at?.slice(0, 5) ?? '')
  const [endZeit, setEndZeit] = useState(termin?.ends_at?.slice(0, 5) ?? '')
  const [wer, setWer] = useState<string[]>(termin?.member_ids ?? [])
  const [notes, setNotes] = useState(termin?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !von) return
    setBusy(true)
    setError(null)
    const daten = {
      title: title.trim(),
      kind,
      starts_on: von,
      ends_on: bis && bis !== von ? bis : null,
      starts_at: startZeit || null,
      ends_at: endZeit || null,
      member_ids: wer,
      notes: notes.trim() || null,
    }
    const { error: e1 } = termin
      ? await supabase.from('events').update(daten).eq('id', termin.id)
      : await supabase.from('events').insert({ ...daten, created_by: userId })
    setBusy(false)
    if (e1) {
      setError(/does not exist|schema cache/i.test(e1.message)
        ? 'Dafür fehlt noch das Skript 0032 in der Datenbank.'
        : e1.message)
      return
    }
    onSaved()
  }

  async function loeschen() {
    if (!termin) return
    if (!confirm(`„${termin.title}" löschen?`)) return
    await supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', termin.id)
    onSaved()
  }

  return (
    <Modal title={termin ? 'Termin bearbeiten' : 'Neuer Termin'} onClose={onClose}>
      <form className="stack" onSubmit={speichern}>
        {error && <div className="error-box">{error}</div>}

        <div>
          <label>Art</label>
          <div className="art-wahl">
            {ARTEN.map((a) => (
              <button
                type="button"
                key={a.key}
                className={`art-btn ${kind === a.key ? 'on' : ''}`}
                onClick={() => setKind(a.key)}
              >
                <span className="art-icon">{a.icon}</span>
                <span className="art-name">{a.label}</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>
            {ARTEN.find((a) => a.key === kind)?.hinweis}
          </p>
        </div>

        <div>
          <label htmlFor="tmtitle">Was? *</label>
          <input
            id="tmtitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'arbeit' ? 'z. B. Spätschicht' : kind === 'spiel' ? 'z. B. Auswärtsspiel' : 'z. B. Zahnarzt'}
            autoFocus
            required
          />
        </div>

        {/* Für wen steht weit oben: das ist die Angabe, die entscheidet, wer
            es im Handy-Kalender sieht. */}
        <div>
          <label>Für wen?</label>
          <div className="wer-wahl">
            <button
              type="button"
              className={`wer-btn ${wer.length === 0 ? 'on' : ''}`}
              onClick={() => setWer([])}
            >
              Für alle
            </button>
            {members.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`wer-btn ${wer.includes(m.id) ? 'on' : ''}`}
                style={wer.includes(m.id) ? { background: m.color, borderColor: m.color, color: '#fff' } : undefined}
                onClick={() => setWer((w) => (w.includes(m.id) ? w.filter((x) => x !== m.id) : [...w, m.id]))}
              >
                {m.name}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>
            {wer.length === 0
              ? 'Steht in beiden Handy-Kalendern.'
              : `Steht nur im Kalender von ${members.filter((m) => wer.includes(m.id)).map((m) => m.name).join(' und ') || '—'}.`}
          </p>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="tmvon">Von *</label>
            <input id="tmvon" type="date" value={von} onChange={(e) => setVon(e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="tmbis">Bis <span className="muted">(optional)</span></label>
            <input id="tmbis" type="date" value={bis} min={von} onChange={(e) => setBis(e.target.value)} />
          </div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="tmvz">Ab</label>
            <input id="tmvz" type="time" value={startZeit} onChange={(e) => setStartZeit(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="tmbz">Bis</label>
            <input id="tmbz" type="time" value={endZeit} onChange={(e) => setEndZeit(e.target.value)} />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
          Beide Zeiten leer = ganztägig.
        </p>

        <div>
          <label htmlFor="tmnotes">Notiz <span className="muted">(optional)</span></label>
          <input id="tmnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="modal-actions">
          {termin && (
            <button type="button" className="btn btn-sm btn-danger" onClick={loeschen}>Löschen</button>
          )}
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy ? 'Speichere …' : 'Speichern'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
