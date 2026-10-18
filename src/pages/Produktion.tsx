// Produktion: unsere interne Werkbank.
// ---------------------------------------------------------------------------
// Der Posting-Bereich fragt "kommt es rechtzeitig raus?". Diese Seite fragt
// "was muss ich als Naechstes anfassen?" -- getrennt nach dem Schritt, der
// bei jedem Video offen ist:
//
//   Drehen      noch nicht gedreht
//   Schneiden   gedreht, noch nicht geschnitten
//   Einplanen   geschnitten, noch nicht eingeplant
//
// Innerhalb jedes Schritts nach Frist sortiert, das Dringendste oben.
// Oben stehen die naechsten Drehtage, weil die den Takt vorgeben.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { heute } from '../lib/datum'
import { fristInfo, nachDringlichkeit, stand, type Schritt } from '../lib/fristen'
import { vorarbeitSetzen, type VorarbeitKey } from '../lib/videoAktionen'
import type { Video } from '../lib/types'

type ProdVideo = Video & { clients?: { name: string } | null; drehtag?: string | null }

interface Drehtag {
  id: string
  title: string
  starts_on: string
  client_id: string | null
  planned_videos: number | null
  clients?: { name: string } | null
}

type Spalte = Extract<Schritt, 'dreh' | 'schnitt' | 'planung'>

const SPALTEN: { key: Spalte; label: string; aktion: string; feld: VorarbeitKey }[] = [
  { key: 'dreh', label: 'Drehen', aktion: '✓ Gedreht', feld: 'prep_shot' },
  { key: 'schnitt', label: 'Schneiden', aktion: '✓ Geschnitten', feld: 'prep_edited' },
  { key: 'planung', label: 'Einplanen', aktion: '✓ Eingeplant', feld: 'prep_scheduled' },
]

function offenerSchritt(v: ProdVideo, heuteIso: string): Spalte | null {
  const s = stand(v, heuteIso)
  if (s.gepostet || s.geplant) return null
  if (!s.gedreht) return 'dreh'
  if (!s.geschnitten) return 'schnitt'
  return 'planung'
}

function kurzDatum(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function Produktion() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [videos, setVideos] = useState<ProdVideo[]>([])
  const [drehtage, setDrehtage] = useState<Drehtag[]>([])
  const [loading, setLoading] = useState(true)
  const [spalte, setSpalte] = useState<Spalte>('dreh')
  const heuteIso = heute()

  const laden = useCallback(async () => {
    const [vRes, dRes] = await Promise.all([
      supabase
        .from('videos')
        .select('*, clients(name)')
        .is('deleted_at', null)
        .neq('status', 'posted')
        .order('scheduled_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('events')
        .select('id, title, starts_on, client_id, planned_videos, clients(name)')
        .eq('kind', 'dreh')
        .is('deleted_at', null)
        .gte('starts_on', heute())
        .order('starts_on', { ascending: true })
        .limit(6),
    ])
    if (vRes.error) toast('Konnte Videos nicht laden: ' + vRes.error.message)
    const liste = (vRes.data ?? []) as unknown as ProdVideo[]
    const ids = [...new Set(liste.map((v) => v.shoot_event_id).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: ev } = await supabase.from('events').select('id, starts_on').in('id', ids)
      const datum = new Map((ev ?? []).map((e: { id: string; starts_on: string }) => [e.id, e.starts_on]))
      for (const v of liste) if (v.shoot_event_id) v.drehtag = datum.get(v.shoot_event_id) ?? null
    }
    setVideos(liste)
    setDrehtage((dRes.data ?? []) as unknown as Drehtag[])
    setLoading(false)
  }, [toast])

  useEffect(() => { laden() }, [laden])

  const proSpalte = useMemo(() => {
    const m: Record<Spalte, ProdVideo[]> = { dreh: [], schnitt: [], planung: [] }
    for (const v of videos) {
      const s = offenerSchritt(v, heuteIso)
      if (s) m[s].push(v)
    }
    for (const k of Object.keys(m) as Spalte[]) m[k] = nachDringlichkeit(m[k], heuteIso)
    return m
  }, [videos, heuteIso])

  const videosAmDrehtag = (id: string) => videos.filter((v) => v.shoot_event_id === id).length

  async function abhaken(v: ProdVideo, feld: VorarbeitKey) {
    const { patch, fehler } = await vorarbeitSetzen(v, feld, true)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...patch } : x)))
    toast('Erledigt ✓', {
      label: 'Rückgängig',
      onClick: async () => {
        // Zurueck auf genau den Stand von vorher -- inklusive Board-Status.
        await supabase.from('videos').update({
          prep_shot: !!v.prep_shot, prep_edited: !!v.prep_edited, prep_scheduled: !!v.prep_scheduled, status: v.status,
        }).eq('id', v.id)
        laden()
      },
    })
  }

  const aktiv = SPALTEN.find((s) => s.key === spalte)!
  const liste = proSpalte[spalte]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Produktion</h1>
          <span className="sub">{loading ? 'Lade …' : 'Was als Nächstes angefasst werden muss'}</span>
        </div>
      </div>

      <div className="section-block">
        <h2 className="section-title">Nächste Drehtage</h2>
        {drehtage.length === 0 ? (
          <div className="col-empty">{loading ? 'Lade …' : 'Kein Drehtag geplant. Im Kalender als „Drehtag“ anlegen.'}</div>
        ) : (
          <div className="prod-drehtage">
            {drehtage.map((d) => {
              const dran = videosAmDrehtag(d.id)
              const soll = d.planned_videos ?? 0
              return (
                <button key={d.id} className="prod-drehtag" onClick={() => d.client_id && navigate(`/client/${d.client_id}`)}>
                  <span className="prod-drehtag-datum">{kurzDatum(d.starts_on)}</span>
                  <span className="prod-drehtag-titel">{d.clients?.name ?? d.title}</span>
                  <span className={`prod-drehtag-zahl ${soll && dran < soll ? 'luecke' : ''}`}>
                    {dran}{soll ? `/${soll}` : ''} Videos
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="seg prod-seg">
        {SPALTEN.map((s) => (
          <button key={s.key} className={`seg-btn ${spalte === s.key ? 'on' : ''}`} onClick={() => setSpalte(s.key)}>
            {s.label} <span className="prod-zahl">{proSpalte[s.key].length}</span>
          </button>
        ))}
      </div>

      <div className="section-block">
        {liste.length === 0 ? (
          <div className="col-empty" style={{ padding: 20 }}>
            {loading ? 'Lade …' : `Nichts zu ${aktiv.label.toLowerCase()}. 🎉`}
          </div>
        ) : (
          <div className="jetzt-liste">
            {liste.map((v) => {
              const f = fristInfo(v, heuteIso)
              return (
                <div key={v.id} className="ps-karte">
                  <div className="ps-kopf">
                    <span className="ps-ic">🎬</span>
                    <button className="ps-main" onClick={() => navigate(`/client/${v.client_id}`)}>
                      <span className="ps-titel">{v.title}</span>
                      <span className="ps-meta">
                        {v.clients?.name && <span className="chip">{v.clients.name}</span>}
                        {v.scheduled_date
                          ? <span className="ps-stand">Post {kurzDatum(v.scheduled_date)}</span>
                          : <span className="ps-stand">ohne Posting-Tag</span>}
                        {f.ampel !== 'ohne-termin' && f.ampel !== 'erledigt' && (
                          <span className={`ampel ampel-${f.ampel}`}>{f.text}</span>
                        )}
                      </span>
                    </button>
                    <button className="btn btn-sm" onClick={() => abhaken(v, aktiv.feld)}>{aktiv.aktion}</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
