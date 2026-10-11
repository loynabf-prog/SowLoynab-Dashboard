// Ein Drehtag: was heute entsteht, und wie es gedreht wird.
// ---------------------------------------------------------------------------
// Der Drehtag ist nicht der Posting-Tag. Fünf Videos entstehen an einem
// Nachmittag und gehen über zwei Wochen verteilt raus. Hier steht, was an
// diesem einen Nachmittag zu tun ist.
//
// Aufbau in Lesereihenfolge: oben der Tagesplan (was zuerst, was danach),
// darunter die Videos. Ein Video antippen klappt sein Skript auf.

import { useCallback, useEffect, useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import {
  drehStand, haengeAn, ladeDrehVideos, ladeFreieVideos, schreibeSkripte,
  speichereSkript, type DrehVideo,
} from '../lib/drehtag'
import type { CalEventRow, Video } from '../lib/types'

export default function DrehtagModal({
  termin,
  kundenName,
  briefing,
  onClose,
  onGeaendert,
}: {
  termin: CalEventRow
  kundenName: string
  briefing?: string | null
  onClose: () => void
  onGeaendert: () => void
}) {
  const { toast } = useToast()
  const [videos, setVideos] = useState<DrehVideo[]>([])
  const [frei, setFrei] = useState<Video[]>([])
  const [offen, setOffen] = useState<string | null>(null)
  const [entwurf, setEntwurf] = useState('')
  const [schreibt, setSchreibt] = useState(false)
  const [laedt, setLaedt] = useState(true)
  const [zuordnen, setZuordnen] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(async () => {
    setVideos(await ladeDrehVideos(termin.id))
    if (termin.client_id) setFrei(await ladeFreieVideos(termin.client_id))
    setLaedt(false)
  }, [termin.id, termin.client_id])

  useEffect(() => { laden() }, [laden])

  const stand = drehStand(termin, videos)

  async function anhaengen(v: Video) {
    const { error } = await haengeAn(v.id, termin.id)
    if (error) { setFehler(error.message); return }
    await laden()
    onGeaendert()
  }

  async function abhaengen(v: DrehVideo) {
    const { error } = await haengeAn(v.id, null)
    if (error) { setFehler(error.message); return }
    await laden()
    onGeaendert()
  }

  async function skriptSpeichern(v: DrehVideo) {
    const { error } = await speichereSkript(v.id, entwurf)
    if (error) { setFehler(error.message); return }
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, script: entwurf } : x)))
    setOffen(null)
    toast('Skript gespeichert ✓')
  }

  /** Alle Skripte des Tages auf einmal — damit die KI zusammenfassen kann. */
  async function alleSchreiben() {
    if (videos.length === 0) return
    setSchreibt(true)
    setFehler(null)
    try {
      const { skripte, tagesplan } = await schreibeSkripte({
        videos: videos.map((v) => ({ id: v.id, titel: v.title, idee: v.caption ?? null })),
        kunde: kundenName,
        briefing: briefing ?? '',
        datum: termin.starts_on,
      })
      for (const s of skripte) await speichereSkript(s.id, s.script)
      if (tagesplan.trim()) {
        await supabase.from('events').update({ notes: tagesplan.trim() }).eq('id', termin.id)
      }
      await laden()
      onGeaendert()
      toast(`${skripte.length} Skripte geschrieben ✓`)
    } catch (e: any) {
      setFehler(e?.message ?? 'Das hat nicht geklappt.')
    }
    setSchreibt(false)
  }

  const tagesplan = (termin.notes ?? '').trim()

  return (
    <Modal title={`🎥 ${termin.title}`} onClose={onClose}>
      <div className="stack">
        {fehler && <div className="error-box">{fehler}</div>}

        <div className="dt-kopf">
          <div>
            <div className="dt-datum">
              {new Date(termin.starts_on + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
              {termin.starts_at && ` · ab ${termin.starts_at.slice(0, 5)} Uhr`}
            </div>
            <div className="dt-kunde">{kundenName}</div>
          </div>
          <div className="dt-zahl">
            <strong>{stand.dran}</strong>
            <span>{stand.dran === 1 ? 'Video' : 'Videos'}{stand.soll > 0 && ` von ${stand.soll}`}</span>
          </div>
        </div>

        {tagesplan && (
          <div className="dt-plan">
            <div className="dt-plan-kopf">Ablauf</div>
            <div className="dt-plan-text">{tagesplan}</div>
          </div>
        )}

        {laedt ? (
          <p className="muted" style={{ fontSize: 13 }}>Lade …</p>
        ) : videos.length === 0 ? (
          <div className="col-empty" style={{ padding: 22 }}>
            Noch kein Video für diesen Tag. Unten eins zuordnen.
          </div>
        ) : (
          <div className="dt-liste">
            {videos.map((v, i) => {
              const hatSkript = (v.script ?? '').trim() !== ''
              const auf = offen === v.id
              return (
                <div className={`dt-video ${v.prep_shot ? 'gedreht' : ''}`} key={v.id}>
                  <button
                    className="dt-video-kopf"
                    onClick={() => { setOffen(auf ? null : v.id); setEntwurf(v.script ?? '') }}
                  >
                    <span className="dt-nr">{i + 1}</span>
                    <span className="dt-titel">{v.title}</span>
                    <span className={`dt-marke ${hatSkript ? 'ok' : ''}`}>
                      {v.prep_shot ? '✓ gedreht' : hatSkript ? 'Skript da' : 'kein Skript'}
                    </span>
                    <span className="dt-pfeil">{auf ? '▾' : '▸'}</span>
                  </button>

                  {auf && (
                    <div className="dt-skript">
                      <textarea
                        value={entwurf}
                        onChange={(e) => setEntwurf(e.target.value)}
                        placeholder={'SO SOLL ES AUSSEHEN\n0–3 s  …\n\nSO DREHEN WIR DAS\n…'}
                        style={{ minHeight: 220 }}
                      />
                      <div className="dt-aktionen">
                        <button className="btn btn-sm btn-ghost" onClick={() => abhaengen(v)}>
                          Vom Drehtag nehmen
                        </button>
                        <div className="spacer" />
                        <button
                          className={`btn btn-sm ${v.prep_shot ? 'btn-ghost' : ''}`}
                          onClick={async () => {
                            await supabase.from('videos').update({ prep_shot: !v.prep_shot }).eq('id', v.id)
                            laden()
                          }}
                        >
                          {v.prep_shot ? 'Doch nicht gedreht' : '✓ Gedreht'}
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={() => skriptSpeichern(v)}>
                          Speichern
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {videos.length > 0 && (
          <button className="btn btn-primary" onClick={alleSchreiben} disabled={schreibt}>
            {schreibt
              ? 'Schreibt …'
              : stand.ohneSkript > 0
                ? `✍️ Skripte für alle ${videos.length} schreiben`
                : '✍️ Skripte neu schreiben'}
          </button>
        )}
        {videos.length > 1 && !schreibt && (
          <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
            Alle zusammen — so kann zusammengefasst werden, was am selben Ort passiert,
            statt fünfmal denselben Aufbau zu beschreiben.
          </p>
        )}

        <div className="dt-zuordnen">
          <button className="btn btn-sm" onClick={() => setZuordnen((z) => !z)}>
            {zuordnen ? '▴ Zuordnen schließen' : `＋ Video zuordnen${stand.fehlen > 0 ? ` (${stand.fehlen} fehlen)` : ''}`}
          </button>
          {zuordnen && (
            frei.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                Alle Videos dieses Kunden hängen schon an einem Drehtag oder sind gepostet.
                Neue legst du im Monatsplan an.
              </p>
            ) : (
              <div className="dt-frei">
                {frei.map((v) => (
                  <button className="dt-frei-zeile" key={v.id} onClick={() => anhaengen(v)}>
                    <span className="dt-frei-titel">{v.title}</span>
                    {v.scheduled_date && (
                      <span className="dt-frei-datum">
                        postet {new Date(v.scheduled_date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                    <span className="dt-frei-plus">＋</span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        <div className="modal-actions">
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>Fertig</button>
        </div>
      </div>
    </Modal>
  )
}
