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
import { linkSetzen, terminSetzen, vorarbeitSetzen, type VorarbeitKey } from '../lib/videoAktionen'
import { mitPlattformen } from '../lib/postschritte'
import PostZeile from '../components/PostZeile'
import type { TagVideo } from '../components/PostSchritt'

type ProdVideo = TagVideo

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
    const liste = mitPlattformen((vRes.data ?? []) as unknown as ProdVideo[])
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

  async function vorarbeit(v: ProdVideo, key: VorarbeitKey, wert: boolean) {
    if (wert) { abhaken(v, key); return }
    const { patch, fehler } = await vorarbeitSetzen(v, key, false)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...patch } : x)))
  }

  async function verschieben(v: ProdVideo, datum: string) {
    const fehler = await terminSetzen(v.id, datum)
    if (fehler) { toast('Konnte nicht verschieben: ' + fehler); return }
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, scheduled_date: datum } : x)))
    toast('Verschoben ✓')
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

      <section className="heute-block">
        <header className="heute-kopf">
          <h2>Nächste Drehtage</h2>
          {drehtage.length > 0 && <span className="heute-zahl">{drehtage.length}</span>}
        </header>
        <div className="heute-liste">
          {drehtage.length === 0 ? (
            <div className="pz-leer">{loading ? 'Lade …' : 'Kein Drehtag geplant — im Kalender als „Drehtag“ anlegen.'}</div>
          ) : drehtage.map((d) => {
            const dran = videosAmDrehtag(d.id)
            const soll = d.planned_videos ?? 0
            const luecke = soll > 0 && dran < soll
            return (
              <button key={d.id} className={`heute-zeile ${luecke ? 'gelb' : ''}`} onClick={() => d.client_id && navigate(`/client/${d.client_id}`)}>
                <span className="heute-ic" aria-hidden>🎥</span>
                <span className="heute-text">
                  <span className="heute-titel">{d.clients?.name ?? d.title}</span>
                  <span className="heute-meta">
                    <span className="pz-datum">{kurzDatum(d.starts_on)}</span>
                    <span className="heute-grund">
                      {dran}{soll ? ` von ${soll}` : ''} Videos zugeordnet{luecke ? ` — ${soll - dran} fehlen noch` : ''}
                    </span>
                  </span>
                </span>
                <span className="heute-pfeil" aria-hidden>›</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="pz-reiter" role="tablist">
        {SPALTEN.map((sp) => (
          <button key={sp.key} role="tab" aria-selected={spalte === sp.key} className={spalte === sp.key ? 'on' : ''} onClick={() => setSpalte(sp.key)}>
            {sp.label}<span className="heute-zahl">{proSpalte[sp.key].length}</span>
          </button>
        ))}
      </div>

      <section className="heute-block">
        <div className="heute-liste">
          {liste.length === 0 ? (
            <div className="heute-leer">{loading ? 'Lade …' : `Nichts zu ${aktiv.label.toLowerCase()}. 🎉`}</div>
          ) : liste.map((v) => (
            <PostZeile
              key={v.id}
              video={v}
              frist={fristInfo(v, heuteIso)}
              heuteIso={heuteIso}
              zeigeDatum
              nurSchritt={aktiv.feld}
              onOeffnen={() => navigate(`/client/${v.client_id}`)}
              onPosten={() => {}}
              onLink={async (feld, url) => { await linkSetzen(v.id, feld, url); laden() }}
              onVorarbeit={(key, wert) => vorarbeit(v, key, wert)}
              onTermin={(d) => verschieben(v, d)}
            />
          ))}
        </div>
      </section>
    </>
  )
}
