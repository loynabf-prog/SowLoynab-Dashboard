// Eine Video-Zeile im Stil der Startseite -- fuer Posting und Produktion.
// ---------------------------------------------------------------------------
// Ruhig wie die Startseite: Farbstreifen links fuer die Dringlichkeit, rechts
// genau EIN Knopf fuer den naechsten Handgriff. Alles Weitere (alle drei
// Schritte, Verschieben, Links, Kundenakte) klappt erst beim Antippen auf --
// so bleibt die Liste lesbar, auch wenn 25 Sachen brennen.

import { useState } from 'react'
import type { TagVideo } from './PostSchritt'
import type { FristInfo } from '../lib/fristen'
import { fehlendeLinks, postPhase, vorarbeit } from '../lib/postschritte'
import type { LinkFeld, VorarbeitKey } from '../lib/videoAktionen'

const ICON: Record<string, string> = {
  dreh: '🎬', schnitt: '✂️', planung: '🗓', posten: '📣', links: '🔗', fertig: '✅', ohne: '·',
}

const KNOPF: Record<VorarbeitKey, string> = {
  prep_shot: '✓ Gedreht',
  prep_edited: '✓ Geschnitten',
  prep_scheduled: '✓ Eingeplant',
}

/** "Heute", "Morgen" oder "Mo., 26.10." */
function tagName(iso: string, heuteIso: string): string {
  if (iso === heuteIso) return 'Heute'
  const m = new Date(heuteIso + 'T12:00:00Z'); m.setUTCDate(m.getUTCDate() + 1)
  if (iso === m.toISOString().slice(0, 10)) return 'Morgen'
  return kurzDatum(iso)
}

function kurzDatum(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function PostZeile({
  video, frist, heuteIso, zeigeDatum, nurSchritt,
  onPosten, onLink, onVorarbeit, onTermin, onOeffnen,
}: {
  video: TagVideo
  frist: FristInfo
  heuteIso: string
  /** Posting-Tag in der Meta-Zeile zeigen (wenn die Liste nicht nach Tag gruppiert ist). */
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

  // Was ist der eine naechste Handgriff?
  let knopf: { text: string; stark?: boolean; tun: () => void } | null = null
  if (phase === 'gepostet') {
    knopf = { text: '🔗 Link', tun: () => setOffen(true) }
  } else if (phase === 'offen') {
    if (nurSchritt) knopf = { text: KNOPF[nurSchritt], tun: () => onVorarbeit(nurSchritt, true) }
    // Kraeftig nur fuer heute -- verpasste Tage sollen nicht die ganze Liste blau faerben.
    else if (faellig || !naechster) knopf = { text: '✓ Gepostet', stark: video.scheduled_date === heuteIso, tun: onPosten }
    else knopf = { text: KNOPF[naechster.key], tun: () => onVorarbeit(naechster.key, true) }
    // Noch nichts faellig und alles vorbereitet: nichts zu tun.
    if (!faellig && !naechster && !nurSchritt) knopf = null
  }

  const icon = phase === 'fertig' ? ICON.fertig
    : phase === 'gepostet' ? ICON.links
    : frist.schritt ? ICON[frist.schritt] : ICON.ohne

  const grund = phase === 'gepostet'
    ? `Gepostet — ${fehlt.length === 2 ? 'beide Links fehlen' : `${fehlt[0] === 'tiktok' ? 'TikTok' : 'Instagram'}-Link fehlt`}`
    : phase === 'fertig' ? 'Gepostet, alle Links da' : frist.text

  const ampel = phase === 'offen' ? frist.ampel : phase === 'gepostet' ? 'gelb' : ''
  const zeit = video.scheduled_time ? video.scheduled_time.slice(0, 5) : null

  return (
    <div className={`pz ${offen ? 'auf' : ''}`}>
      <div className={`heute-zeile ${ampel}`}>
        <button className="heute-klick" onClick={() => setOffen((o) => !o)} aria-expanded={offen}>
          <span className="heute-ic" aria-hidden>{icon}</span>
          <span className="heute-text">
            <span className="heute-titel">{video.title}</span>
            <span className="heute-meta">
              {video.clients?.name && <span className="heute-kunde">{video.clients.name}</span>}
              {/* Bei "Posting verpasst (12.10.)" steht das Datum schon im Grund. */}
              {zeigeDatum && video.scheduled_date && !(phase === 'offen' && video.scheduled_date < heuteIso) && (
                <span className="pz-datum">{tagName(video.scheduled_date, heuteIso)}</span>
              )}
              <span className="heute-grund">{grund}</span>
            </span>
          </span>
          {zeit && <span className="heute-zeit">{zeit}</span>}
        </button>
        {knopf
          ? <button className={`heute-tun ${knopf.stark ? 'stark' : ''}`} onClick={knopf.tun}>{knopf.text}</button>
          : <span className={`heute-pfeil pz-pfeil ${offen ? 'auf' : ''}`} aria-hidden>›</span>}
      </div>

      {offen && (
        <div className="pz-details">
          {phase === 'offen' && (
            <div className="pz-reihe">
              <span className="pz-label">Stand</span>
              <div className="pz-schritte">
                {schritte.map((s) => (
                  <button
                    key={s.key}
                    className={`pz-schritt ${s.erledigt ? 'on' : ''}`}
                    aria-pressed={s.erledigt}
                    onClick={() => onVorarbeit(s.key, !s.erledigt)}
                  >
                    {s.erledigt ? '✓ ' : ''}{s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === 'gepostet' && fehlt.map((p) => (
            <LinkFeld
              key={p}
              icon={p === 'tiktok' ? '🎵' : '📸'}
              label={p === 'tiktok' ? 'TikTok-Link einfügen' : 'Instagram-Link einfügen'}
              onSave={(u) => onLink(p === 'tiktok' ? 'tiktok_url' : 'instagram_url', u)}
            />
          ))}

          {phase === 'offen' && <Termin datum={video.scheduled_date} onSave={onTermin} />}

          <button className="pz-akte" onClick={onOeffnen}>Kundenakte öffnen ›</button>
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
    <div className="pz-reihe">
      <span className="pz-label">Posting-Tag</span>
      <div className="pz-feld">
        <input type="date" value={wert} onChange={(e) => setWert(e.target.value)} aria-label="Posting-Tag" />
        <button className="heute-tun" onClick={los} disabled={busy || !wert || wert === datum}>
          {busy ? '…' : 'Verschieben'}
        </button>
      </div>
    </div>
  )
}

function LinkFeld({ icon, label, onSave }: { icon: string; label: string; onSave: (url: string) => Promise<void> }) {
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
    <div className="pz-feld">
      <span className="pz-linkic" aria-hidden>{icon}</span>
      <input
        type="url"
        inputMode="url"
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') los() }}
        placeholder={label}
        aria-label={label}
      />
      <button className="heute-tun stark" onClick={los} disabled={busy || !wert.trim()}>{busy ? '…' : 'Sichern'}</button>
    </div>
  )
}
