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
import { Camera, ChevronRight } from 'lucide-react'
import ProduktionKopf from '../components/ProduktionKopf'
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

  const [alle, setAlle] = useState(false)
  const GRENZE = 12
  const sichtbar = alle ? liste : liste.slice(0, GRENZE)

  return (
    <>
      <ProduktionKopf unter="Drehen, schneiden, einplanen" />

      <div className="n-chips" role="tablist" aria-label="Schritt">
        {SPALTEN.map((sp) => (
          <button key={sp.key} role="tab" className={spalte === sp.key ? 'on' : ''} onClick={() => { setSpalte(sp.key); setAlle(false) }} aria-selected={spalte === sp.key}>
            {sp.label}<small>{proSpalte[sp.key].length}</small>
          </button>
        ))}
      </div>

      <div className="n-gruppe">
        {liste.length === 0 ? (
          <div className="n-leer">{loading ? 'Lade …' : `Nichts zu ${aktiv.label.toLowerCase()}.`}</div>
        ) : sichtbar.map((v) => (
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
      {liste.length > GRENZE && (
        <div className="n-abschnitt" style={{ marginTop: 12 }}>
          <button className="n-mehr-link" style={{ marginLeft: 0 }} onClick={() => setAlle((x) => !x)}>
            {alle ? 'Weniger anzeigen' : `Alle ${liste.length} anzeigen`}
          </button>
        </div>
      )}

      <div className="n-abschnitt"><h2>Nächste Drehtage</h2></div>
      <div className="n-gruppe">
        {drehtage.length === 0 ? (
          <div className="n-leer">{loading ? 'Lade …' : 'Kein Drehtag geplant. Leg ihn im Kalender als Drehtag an.'}</div>
        ) : drehtage.map((d) => {
          const dran = videosAmDrehtag(d.id)
          const soll = d.planned_videos ?? 0
          const luecke = soll > 0 && dran < soll
          return (
            <button key={d.id} className="n-zeile" onClick={() => d.client_id && navigate(`/client/${d.client_id}`)}>
              <span className={`n-ic ${luecke ? 'gelb' : 'lila'}`}><Camera strokeWidth={2.2} /></span>
              <span className="n-text">
                <span className="n-titel">{d.clients?.name ?? d.title}</span>
                <span className="n-unter">
                  {kurzDatum(d.starts_on)} · {dran}{soll ? ` von ${soll}` : ''} Videos{luecke ? <span className="gelb"> · {soll - dran} fehlen</span> : null}
                </span>
              </span>
              <ChevronRight className="n-chevron" />
            </button>
          )
        })}
      </div>
    </>
  )
}
