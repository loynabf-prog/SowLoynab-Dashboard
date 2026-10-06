// Hausstil für Captions: einmal eintragen, immer angehängt.
// ---------------------------------------------------------------------------
// Wir benutzen ohnehin immer dieselben Hashtags. Statt sie jedes Mal
// mitzudiktieren, stehen sie hier -- die App hängt sie an jede Caption an
// und lässt dabei weg, was schon drinsteht.

import { useEffect, useState } from 'react'
import { getCaptionVorgabe, saveCaptionVorgabe, type CaptionVorgabe } from '../lib/captionVorgabe'
import { useToast } from '../context/ToastContext'

export default function CaptionVorgabeCard() {
  const { toast } = useToast()
  const [v, setV] = useState<CaptionVorgabe>({})
  const [busy, setBusy] = useState(false)
  const [geladen, setGeladen] = useState(false)

  useEffect(() => { getCaptionVorgabe().then((x) => { setV(x); setGeladen(true) }) }, [])

  async function speichern() {
    setBusy(true)
    try {
      await saveCaptionVorgabe({
        hashtags: (v.hashtags ?? '').trim() || undefined,
        tonalitaet: (v.tonalitaet ?? '').trim() || undefined,
      })
      toast('Gespeichert ✓')
    } catch (e: any) {
      toast('Fehler: ' + (e?.message ?? 'unbekannt'))
    }
    setBusy(false)
  }

  if (!geladen) return null

  return (
    <div className="settings-card" style={{ marginTop: 20 }}>
      <div className="info-box" style={{ marginBottom: 16 }}>
        ✍️ Gilt für jede Caption, die der Assistent schreibt. Einmal ausfüllen — danach
        musst du Hashtags nie wieder mitdiktieren.
      </div>

      <div className="stack">
        <div>
          <label htmlFor="cvh">Feste Hashtags</label>
          <textarea
            id="cvh"
            value={v.hashtags ?? ''}
            onChange={(e) => setV((x) => ({ ...x, hashtags: e.target.value }))}
            placeholder="#münster #foodmünster #sowloynab"
            style={{ minHeight: 70 }}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>
            Kommen ans Ende jeder Caption. Was die KI selbst schon geschrieben hat,
            wird nicht doppelt angehängt.
          </p>
        </div>

        <div>
          <label htmlFor="cvt">Ton <span className="muted">(optional)</span></label>
          <input
            id="cvt"
            value={v.tonalitaet ?? ''}
            onChange={(e) => setV((x) => ({ ...x, tonalitaet: e.target.value }))}
            placeholder="z. B. locker und direkt, nie werblich, kurze Sätze"
          />
        </div>

        <div className="modal-actions">
          <div className="spacer" />
          <button className="btn btn-primary" onClick={speichern} disabled={busy}>
            {busy ? 'Speichere …' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
