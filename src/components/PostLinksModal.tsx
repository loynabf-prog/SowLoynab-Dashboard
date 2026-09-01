import { useState } from 'react'
import { klartext, lookupVideo, statsPatch } from '../lib/apify'
import { updateRow } from '../lib/db'
import { seit } from '../lib/format'
import type { Video } from '../lib/types'
import Modal from './Modal'

// Die Adresse des VEROEFFENTLICHTEN Beitrags erfassen — nicht zu verwechseln
// mit dem Video-Link auf der Karte, der auf die Videodatei zeigt
// (iCloud/Drive). Nur mit dieser Adresse hier kann die nächtliche Abfrage
// die Zahlen holen.
//
// Speichert selbst; die aufrufende Seite lädt danach nur neu. So ist der Weg
// von der Kundenseite und von der Startseite aus derselbe.
export default function PostLinksModal({
  video,
  onClose,
  onSaved,
}: {
  video: Video
  onClose: () => void
  onSaved: () => void
}) {
  const [tt, setTt] = useState(video.tiktok_url ?? '')
  const [ig, setIg] = useState(video.instagram_url ?? '')
  const [busy, setBusy] = useState<'holen' | 'speichern' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const urls = () => ({ tiktok_url: tt.trim() || null, instagram_url: ig.trim() || null })
  const hatLinks = !!(video.tiktok_url || video.instagram_url)

  async function speichern(patch: Record<string, unknown>) {
    await updateRow('videos', patch, 'id', video.id)
    onSaved()
  }

  async function holen() {
    if (!tt.trim() && !ig.trim()) { setErr('Bitte mindestens einen Link einfügen.'); return }
    setBusy('holen'); setErr(null)
    try {
      const res = await lookupVideo(urls())
      if (res.tiktok?.views == null && res.instagram?.views == null) {
        // Abruf lief, aber keine Plattform hat eine Aufrufzahl geliefert.
        // Vorhandene Zahlen NICHT mit Leere überschreiben.
        await speichern(urls())
        setErr('Der Abruf lief durch, aber weder TikTok noch Instagram haben eine Aufrufzahl herausgegeben. Bei frisch geposteten Videos dauert das teils ein paar Stunden — heute Nacht wird es automatisch erneut versucht.')
        return
      }
      await speichern({ ...urls(), ...statsPatch(res) })
      onClose()
    } catch (e) {
      // Abruf gescheitert — die Adressen trotzdem sichern, damit die nächste
      // Nacht es erneut versuchen kann.
      await speichern(urls())
      setErr(`${klartext((e as Error).message)} — die Adressen sind gespeichert, heute Nacht wird es erneut versucht.`)
    } finally {
      setBusy(null)
    }
  }

  async function nurSpeichern() {
    setBusy('speichern')
    await speichern(urls())
    setBusy(null)
    onClose()
  }

  return (
    <Modal title={hatLinks ? '📊 Zahlen jetzt holen' : '🔗 Wo ist es online?'} onClose={onClose}>
      <div className="stack">
        <div className="info-box" style={{ fontSize: 13 }}>
          {hatLinks ? (
            <>
              Holt die aktuellen Zahlen sofort — ohne auf die nächtliche Abfrage zu warten.
              Stimmt eine Adresse nicht, kannst du sie hier korrigieren.
              {video.stats_updated_at && <><br />Zuletzt geprüft: {seit(video.stats_updated_at)}.</>}
            </>
          ) : (
            <>
              Adresse des fertigen Postings einfügen — daran holt sich das Dashboard jede Nacht
              die Aufrufe. <strong>Ohne diese Adresse bleiben die Zahlen leer.</strong>
            </>
          )}
        </div>

        {err && <div className="warn-box">⚠ {err}</div>}

        <div>
          <label>🎵 TikTok-Link</label>
          <input type="url" value={tt} onChange={(e) => setTt(e.target.value)} autoFocus placeholder="https://www.tiktok.com/@…/video/…" />
        </div>
        <div>
          <label>📸 Instagram-Link</label>
          <input type="url" value={ig} onChange={(e) => setIg(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={!!busy}>Später</button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={nurSpeichern} disabled={!!busy}>
            {busy === 'speichern' ? 'Speichere …' : 'Nur merken'}
          </button>
          <button type="button" className="btn btn-primary" onClick={holen} disabled={!!busy}>
            {busy === 'holen' ? 'Hole Zahlen …' : '📊 Zahlen jetzt holen'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
