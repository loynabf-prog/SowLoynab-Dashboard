// Eine Video-Zeile fuer Plan und Produktion.
// ---------------------------------------------------------------------------
// Links das Symbol des naechsten Schritts, in der Mitte Titel und Grund,
// rechts genau EIN Knopf fuer den naechsten Handgriff. Alles Weitere
// (Stand, Verschieben, Links, Kundenakte) klappt erst beim Antippen auf.

import { useState } from 'react'
import { Video, Scissors, CalendarClock, Send, Link2, CheckCircle2, Circle, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TagVideo } from './PostSchritt'
import type { FristInfo } from '../lib/fristen'
import { fehlendeLinks, postPhase, vorarbeit } from '../lib/postschritte'
import type { LinkFeld, VorarbeitKey } from '../lib/videoAktionen'

const SYMBOL: Record<string, { icon: LucideIcon; farbe: string }> = {
  dreh: { icon: Video, farbe: 'lila' },
  schnitt: { icon: Scissors, farbe: 'blau' },
  planung: { icon: CalendarClock, farbe: 'gelb' },
  posten: { icon: Send, farbe: 'glut' },
  links: { icon: Link2, farbe: 'gelb' },
  fertig: { icon: CheckCircle2, farbe: 'gruen' },
  ohne: { icon: Circle, farbe: 'grau' },
}

const KNOPF: Record<VorarbeitKey, string> = {
  prep_shot: 'Gedreht',
  prep_edited: 'Geschnitten',
  prep_scheduled: 'Eingeplant',
}

/** "Heute", "Morgen" oder "Mo., 26.10." */
function tagName(iso: string, heuteIso: string): string {
  if (iso === heuteIso) return 'Heute'
  const m = new Date(heuteIso + 'T12:00:00Z'); m.setUTCDate(m.getUTCDate() + 1)
  if (iso === m.toISOString().slice(0, 10)) return 'Morgen'
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function PostZeile({
  video, frist, heuteIso, zeigeDatum, nurSchritt,
  onPosten, onLink, onVorarbeit, onTermin, onOeffnen,
}: {
  video: TagVideo
  frist: FristInfo
  heuteIso: string
  zeigeDatum?: boolean
  /** Produktion: der Knopf ist immer genau dieser Schritt. */
  nurSchritt?: VorarbeitKey
  onPosten: () => void
  onLink: (feld: LinkFeld, url: string) => Promise<void>
  onVorarbeit: (key: VorarbeitKey, wert: boolean) => void
  onTermin: (datum: string) => Promise<void>
  onOeffnen: () => void
}) {
  const [offen, setOffen] = useState(false)
  const phase = postPhase(video)
  const fehlt = fehlendeLinks(video)
  const schritte = vorarbeit(video)
  const naechster = schritte.find((s) => !s.erledigt)
  const faellig = (video.scheduled_date ?? '9999') <= heuteIso

  let knopf: { text: string; stark?: boolean; tun: () => void } | null = null
  if (phase === 'gepostet') knopf = { text: 'Link', tun: () => setOffen(true) }
  else if (phase === 'offen') {
    if (nurSchritt) knopf = { text: KNOPF[nurSchritt], tun: () => onVorarbeit(nurSchritt, true) }
    else if (faellig) knopf = { text: 'Gepostet', stark: video.scheduled_date === heuteIso, tun: onPosten }
    else if (naechster) knopf = { text: KNOPF[naechster.key], tun: () => onVorarbeit(naechster.key, true) }
  }

  const sym = phase === 'fertig' ? SYMBOL.fertig
    : phase === 'gepostet' ? SYMBOL.links
    : frist.schritt ? SYMBOL[frist.schritt] : SYMBOL.ohne
  const farbe = sym.farbe

  const grund = phase === 'gepostet'
    ? (fehlt.length === 2 ? 'Gepostet — beide Links fehlen' : `Gepostet — ${fehlt[0] === 'tiktok' ? 'TikTok' : 'Instagram'}-Link fehlt`)
    : phase === 'fertig' ? 'Gepostet' : frist.text
  const ton = phase === 'offen' ? (frist.ampel === 'rot' ? 'rot' : frist.ampel === 'gelb' ? 'gelb' : '') : phase === 'gepostet' ? 'gelb' : ''
  const datum = zeigeDatum && video.scheduled_date && !(phase === 'offen' && video.scheduled_date < heuteIso)
    ? tagName(video.scheduled_date, heuteIso) : null
  const zeit = video.scheduled_time ? video.scheduled_time.slice(0, 5) : null

  return (
    <div className="n-zeile-wrap">
      <div className="n-zeile" role="group">
        <button className="n-zeile-klick" onClick={() => setOffen((o) => !o)} aria-expanded={offen}>
          <span className={`n-ic ${farbe}`}><sym.icon strokeWidth={2.2} /></span>
          <span className="n-text">
            <span className="n-titel">{video.title}</span>
            {(video.clients?.name || datum) && (
              <span className="n-unter">{[video.clients?.name, datum].filter(Boolean).join(' · ')}</span>
            )}
            <span className={`n-grund ${ton}`}>{grund}</span>
          </span>
          {zeit && <span className="n-zeit">{zeit}</span>}
        </button>
        {knopf && <button className={`n-tun ${knopf.stark ? 'stark' : ''}`} onClick={knopf.tun}>{knopf.text}</button>}
      </div>

      {offen && (
        <div className="z-auf">
          {phase === 'offen' && (
            <div>
              <div className="z-label">Stand</div>
              <div className="z-schritte">
                {schritte.map((s) => (
                  <button key={s.key} className={`z-schritt ${s.erledigt ? 'on' : ''}`} aria-pressed={s.erledigt} onClick={() => onVorarbeit(s.key, !s.erledigt)}>
                    {s.erledigt && <Check strokeWidth={3} />}{s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === 'gepostet' && fehlt.map((p) => (
            <LinkFeld
              key={p}
              label={p === 'tiktok' ? 'TikTok-Link einfügen' : 'Instagram-Link einfügen'}
              onSave={(u) => onLink(p === 'tiktok' ? 'tiktok_url' : 'instagram_url', u)}
            />
          ))}

          {phase === 'offen' && <Termin datum={video.scheduled_date} onSave={onTermin} />}

          <button className="z-link" onClick={onOeffnen}>Kundenakte öffnen</button>
        </div>
      )}
    </div>
  )
}

function Termin({ datum, onSave }: { datum: string | null; onSave: (d: string) => Promise<void> }) {
  const [wert, setWert] = useState(datum ?? '')
  const [busy, setBusy] = useState(false)
  async function los() {
    if (!wert || busy || wert === datum) return
    setBusy(true)
    await onSave(wert)
    setBusy(false)
  }
  return (
    <div>
      <div className="z-label">Posting-Tag</div>
      <div className="z-feld">
        <input type="date" value={wert} onChange={(e) => setWert(e.target.value)} aria-label="Posting-Tag" />
        <button className="n-tun" onClick={los} disabled={busy || !wert || wert === datum}>{busy ? '…' : 'Verschieben'}</button>
      </div>
    </div>
  )
}

function LinkFeld({ label, onSave }: { label: string; onSave: (url: string) => Promise<void> }) {
  const [wert, setWert] = useState('')
  const [busy, setBusy] = useState(false)
  async function los() {
    const u = wert.trim()
    if (!u || busy) return
    setBusy(true)
    await onSave(u)
    setBusy(false)
    setWert('')
  }
  return (
    <div className="z-feld">
      <input
        type="url" inputMode="url" value={wert}
        onChange={(e) => setWert(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') los() }}
        placeholder={label} aria-label={label}
      />
      <button className="n-tun stark" onClick={los} disabled={busy || !wert.trim()}>{busy ? '…' : 'Sichern'}</button>
    </div>
  )
}
