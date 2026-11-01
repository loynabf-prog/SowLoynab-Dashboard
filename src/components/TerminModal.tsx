// Einen Termin anlegen oder aendern: Arbeitszeit, Spiel, sonstiger Termin.
// ---------------------------------------------------------------------------
// Alles, was den Tag belegt, aber weder Video noch Aufgabe ist. Ohne das
// weiss der eine nie, wann der andere kann.
//
// "Für wen" ist die wichtigste Angabe und steht deshalb weit oben:
// niemand ausgewaehlt heisst "fuer alle" -- der haeufigere Fall, fuer den
// man nichts tun muss.

import { useEffect, useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import type { CalEventRow, EventKind } from '../lib/types'
import { heute } from '../lib/datum'
import { KATEGORIEN, kategorieVon, type Kategorie } from '../lib/kalender'


export default function TerminModal({
  termin,
  datum,
  kunde,
  artVorgabe,
  werVorgabe,
  zeitVorgabe,
  userId,
  onClose,
  onSaved,
}: {
  termin: CalEventRow | null
  /** Vorbelegtes Datum, wenn man im Kalender auf einen Tag getippt hat. */
  datum?: string
  /** Vorbelegter Kunde, wenn man von einer Kundenseite kommt. */
  kunde?: { id: string; name: string }
  artVorgabe?: EventKind
  /** Vorbelegt "fuer wen" (Tipp in eine Kalenderspalte): [] = Agentur. */
  werVorgabe?: string[]
  /** Vorbelegte Uhrzeit (Tipp in die Zeitleiste), "HH:MM". */
  zeitVorgabe?: string
  userId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { members } = useTeam()
  const [kunden, setKunden] = useState<{ id: string; name: string }[]>([])
  const [clientId, setClientId] = useState<string>(termin?.client_id ?? kunde?.id ?? '')
  const [title, setTitle] = useState(termin?.title ?? '')
  // Alte Drehtag-Termine (kind 'dreh') werden als normaler Termin bearbeitet.
  const [kind, setKind] = useState<EventKind>(termin?.kind === 'dreh' ? 'termin' : (termin?.kind ?? artVorgabe ?? 'termin'))
  const [von, setVon] = useState(termin?.starts_on ?? datum ?? heute())
  const [bis, setBis] = useState(termin?.ends_on ?? '')
  const [startZeit, setStartZeit] = useState(termin?.starts_at?.slice(0, 5) ?? zeitVorgabe ?? '')
  const [endZeit, setEndZeit] = useState(termin?.ends_at?.slice(0, 5) ?? (zeitVorgabe ? `${String(Number(zeitVorgabe.slice(0, 2)) + 1).padStart(2, '0')}${zeitVorgabe.slice(2)}` : ''))
  const [wer, setWer] = useState<string[]>(termin?.member_ids ?? werVorgabe ?? [])
  const [notes, setNotes] = useState(termin?.notes ?? '')
  const [kategorie, setKategorie] = useState<Kategorie>(() => kategorieVon({ kategorie: termin?.kategorie, kind: termin?.kind ?? artVorgabe, client_id: termin?.client_id ?? kunde?.id }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name')
      .then(({ data }) => setKunden((data ?? []) as { id: string; name: string }[]))
  }, [])

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
      client_id: clientId || null,
      kategorie,
    }
    const { error: e1 } = termin
      ? await supabase.from('events').update(daten).eq('id', termin.id)
      : await supabase.from('events').insert({ ...daten, created_by: userId })
    setBusy(false)
    if (e1) {
      setError(/client_id|planned_videos/i.test(e1.message)
        ? 'Dafür fehlt noch das Skript 0034 in der Datenbank.'
        : /does not exist|schema cache/i.test(e1.message)
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
          <label>Kategorie</label>
          <div className="wer-wahl">
            {KATEGORIEN.map((k) => (
              <button
                type="button"
                key={k.key}
                className={`wer-btn ${kategorie === k.key ? 'on' : ''}`}
                style={kategorie === k.key ? { background: k.farbe, borderColor: k.farbe, color: '#fff' } : { borderColor: k.farbe, color: k.farbe }}
                onClick={() => { setKategorie(k.key); setKind(k.key === 'sport' ? 'spiel' : k.key === 'arbeit' ? 'arbeit' : 'termin') }}
              >
                {k.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="tmtitle">Was? *</label>
          <input
            id="tmtitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'arbeit' ? 'z. B. Spätschicht' : kind === 'spiel' ? 'z. B. Auswärtsspiel' : 'z. B. Drehtag Hajo'}
            autoFocus
            required
          />
        </div>

        <div>
          <label htmlFor="tmkunde">Kunde <span className="muted">(optional)</span></label>
          <select id="tmkunde" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— kein Kunde, interner Termin —</option>
            {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>

        {/* Für wen steht weit oben: das ist die Angabe, die entscheidet, wer
            es im Handy-Kalender sieht. */}
        <div>
          <label>Wessen Termin?</label>
          <div className="wer-wahl">
            {members.map((m) => {
              const an = wer.length === 1 && wer[0] === m.id
              return (
                <button
                  type="button"
                  key={m.id}
                  className={`wer-btn ${an ? 'on' : ''}`}
                  style={an ? { background: m.color, borderColor: m.color, color: '#fff' } : undefined}
                  onClick={() => setWer([m.id])}
                >
                  {(m.name ?? '').split(' ')[0]}
                </button>
              )
            })}
            <button
              type="button"
              className={`wer-btn ${wer.length !== 1 ? 'on' : ''}`}
              style={wer.length !== 1 ? { background: '#ff6a1f', borderColor: '#ff6a1f', color: '#fff' } : undefined}
              onClick={() => setWer([])}
            >
              Agentur
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>
            {wer.length === 1
              ? `Privat / eigener Termin von ${members.find((m) => m.id === wer[0])?.name?.split(' ')[0] ?? '—'} — die Person ist da nicht frei.`
              : 'Agentur-Termin — betrifft euch beide.'}
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
