// Eine Video-Zeile auf der Startseite -- mit dem Schritt, der jetzt dran ist.
// ---------------------------------------------------------------------------
// Heute geht es ums Posten und danach um die beiden Adressen. Erst wenn
// beide stehen, ist der Tag fuer dieses Video durch: ohne sie holt der
// Nachtlauf nie Zahlen, das Video waere fuer uns unsichtbar.
//
// Morgen und spaeter geht es um die Vorarbeit -- gedreht, geschnitten,
// eingeplant. Damit laesst sich der naechste Tag heute schon leerraeumen.

import { useState } from 'react'
import type { Video } from '../lib/types'
import { fehlendeLinks, postPhase, vorarbeit, vorarbeitStand } from '../lib/postschritte'

export type TagVideo = Video & { clients?: { name: string } | null }

export default function PostSchritt({
  video,
  modus,
  zeit,
  onOeffnen,
  onPosten,
  onLink,
  onVorarbeit,
}: {
  video: TagVideo
  /** 'heute' = posten und Links, 'vorher' = Vorarbeit abhaken. */
  modus: 'heute' | 'vorher'
  zeit: string | null
  onOeffnen: () => void
  onPosten: () => void
  onLink: (feld: 'tiktok_url' | 'instagram_url', url: string) => Promise<void>
  onVorarbeit: (key: 'prep_shot' | 'prep_edited' | 'prep_scheduled', wert: boolean) => void
}) {
  const phase = postPhase(video)
  const fehlt = fehlendeLinks(video)
  const stand = vorarbeitStand(video)

  return (
    <div className={`ps-karte ${phase === 'fertig' ? 'fertig' : ''}`}>
      <div className="ps-kopf">
        <span className="ps-ic">{phase === 'fertig' ? '✅' : '🎬'}</span>
        <button className="ps-main" onClick={onOeffnen}>
          <span className="ps-titel">{video.title}</span>
          <span className="ps-meta">
            {zeit && <span className="jetzt-zeit">{zeit}</span>}
            {video.clients?.name && <span className="chip">{video.clients.name}</span>}
            {modus === 'vorher' && stand < 3 && <span className="ps-stand">{stand}/3 vorbereitet</span>}
          </span>
        </button>

        {modus === 'heute' && phase === 'offen' && (
          <button className="btn btn-sm btn-primary" onClick={onPosten}>✓ Gepostet</button>
        )}
        {modus === 'heute' && phase === 'fertig' && <span className="ps-fertig">erledigt</span>}
      </div>

      {/* Gepostet, aber noch nicht abgeschlossen: hier kommen die Adressen
          rein. Ein Feld verschwindet, sobald es ausgefuellt ist -- es soll
          nur da sein, solange es gebraucht wird. */}
      {modus === 'heute' && phase === 'gepostet' && (
        <div className="ps-links">
          <div className="ps-links-hinweis">
            Noch {fehlt.length === 2 ? 'beide Adressen' : 'eine Adresse'} eintragen — ohne sie bekommen wir nie Zahlen.
          </div>
          {fehlt.includes('tiktok') && (
            <LinkFeld icon="🎵" label="TikTok-Link" onSave={(u) => onLink('tiktok_url', u)} />
          )}
          {fehlt.includes('instagram') && (
            <LinkFeld icon="📸" label="Instagram-Link" onSave={(u) => onLink('instagram_url', u)} />
          )}
        </div>
      )}

      {/* Vorarbeit: drei Haekchen, in der Reihenfolge, in der gearbeitet
          wird -- aber ohne Zwang. Wer zuerst schneidet, hakt eben anders ab. */}
      {modus === 'vorher' && (
        <div className="ps-vorarbeit">
          {vorarbeit(video).map((s) => (
            <button
              key={s.key}
              className={`ps-schritt ${s.erledigt ? 'on' : ''}`}
              aria-pressed={s.erledigt}
              onClick={() => onVorarbeit(s.key, !s.erledigt)}
            >
              {s.erledigt ? '✓ ' : ''}{s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Ein Link-Feld, das sich selbst leert, sobald gespeichert wurde. */
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
    <div className="ps-linkfeld">
      <span className="ps-linkic">{icon}</span>
      <input
        type="url"
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') los() }}
        placeholder={label}
        aria-label={label}
        inputMode="url"
      />
      <button className="btn btn-sm" onClick={los} disabled={busy || !wert.trim()}>
        {busy ? '…' : 'Sichern'}
      </button>
    </div>
  )
}
