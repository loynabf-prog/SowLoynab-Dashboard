import { useState } from 'react'
import { compactNum, PLATFORM_ICON, type Platform } from '../lib/apify'
import type { Inspiration } from '../lib/types'

interface Opt { id: string; name: string }

// Eine gemerkte Fremd-Video-Karte. Wird auf der Kundenseite (Reiter
// „Inspiration") und auf der Seite „Inspirationen" gleich dargestellt.
export default function InspirationCard({
  item,
  clients,
  onAssign,
  onDelete,
}: {
  item: Inspiration
  clients?: Opt[]
  onAssign?: (clientId: string | null) => void
  onDelete: () => void
}) {
  // Die Vorschaubilder liegen auf den CDNs von TikTok/Instagram und laufen
  // nach einiger Zeit ab. Kaputte Bilder blenden wir einfach aus.
  const [imgOk, setImgOk] = useState(true)
  const platform = (item.platform ?? 'other') as Platform
  const zahlen = item.views != null || item.likes != null || item.comments != null

  return (
    <div className="insp-card">
      <a className="insp-thumb" href={item.url} target="_blank" rel="noreferrer" title="Video öffnen">
        {item.thumbnail_url && imgOk ? (
          <>
            <img src={item.thumbnail_url} alt="" loading="lazy" onError={() => setImgOk(false)} />
            {/* Plattform-Kennung nur ueber dem Bild -- ohne Bild steht sie
                schon gross in der Mitte, sonst haetten wir sie doppelt. */}
            <span className="insp-badge">{PLATFORM_ICON[platform]}</span>
          </>
        ) : (
          <span className="insp-thumb-fallback">{PLATFORM_ICON[platform]}</span>
        )}
      </a>

      <div className="insp-body">
        <div className="insp-head">
          <div className="insp-title">{item.title || 'Ohne Titel'}</div>
          <button className="pool-x" onClick={onDelete} title="löschen">✕</button>
        </div>

        {item.author && <div className="insp-author">@{item.author.replace(/^@/, '')}</div>}

        {zahlen ? (
          <div className="insp-stats">
            <span title="Aufrufe">▶ {compactNum(item.views)}</span>
            <span title="Likes">❤ {compactNum(item.likes)}</span>
            <span title="Kommentare">💬 {compactNum(item.comments)}</span>
          </div>
        ) : (
          <div className="insp-stats muted">Keine Zahlen abrufbar</div>
        )}

        {item.notes && <div className="insp-notes">{item.notes}</div>}

        <div className="insp-foot">
          <a className="btn btn-sm" href={item.url} target="_blank" rel="noreferrer">Ansehen ↗</a>
          {onAssign && clients && (
            <select
              className="insp-assign"
              value={item.client_id ?? ''}
              onChange={(e) => onAssign(e.target.value || null)}
              title="Kunde zuordnen"
            >
              <option value="">— allgemein —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}
