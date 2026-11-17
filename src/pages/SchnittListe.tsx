// Schnitt-Raum: Liste (17.11.2026).
// ---------------------------------------------------------------------------
// Alle offenen Videos -- nach Kunde gruppiert, darin nach Deadline; oder als
// eine Liste nach Deadline. Tipp oeffnet den Korrektur-Player (/schnitt/:id).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, MessageSquareText } from 'lucide-react'
import LogoFrame from '../components/LogoFrame'
import { supabase } from '../lib/supabase'
import { heute as heuteIso } from '../lib/datum'
import { deadlineLage, deadlineText } from '../lib/schnitt'
import '../styles/schnitt.css'

interface V {
  id: string
  title: string | null
  client_id: string
  status: string
  produktion_stufe: string | null
  scheduled_date: string | null
  dropbox_pfad: string | null
  clients: { name: string; logo_url: string | null; active: boolean | null; pausiert_seit: string | null; deleted_at: string | null } | null
}

export const STUFE: Record<string, { text: string; klasse: string }> = {
  pruefung: { text: 'Zur Freigabe', klasse: 'freigabe' },
  feinschliff: { text: 'Korrektur läuft', klasse: 'laeuft' },
  roh: { text: 'Im Schnitt', klasse: 'laeuft' },
  fertig: { text: 'Fertig', klasse: 'fertig' },
}
function stufe(v: Pick<V, 'status' | 'produktion_stufe' | 'dropbox_pfad'>) {
  if (v.status === 'planned') return { text: 'Eingeplant', klasse: 'fertig' }
  if (v.produktion_stufe && STUFE[v.produktion_stufe]) return STUFE[v.produktion_stufe]
  return v.dropbox_pfad ? { text: 'Material da', klasse: 'offen' } : { text: 'Noch nicht gedreht', klasse: 'leise' }
}

type Ansicht = 'kunden' | 'deadline'

export default function SchnittListe() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState<V[]>([])
  const [offen, setOffen] = useState<Map<string, number>>(new Map())
  const [ansicht, setAnsicht] = useState<Ansicht>(() => (localStorage.getItem('schnitt-ansicht') as Ansicht) || 'kunden')
  const [nurFreigabe, setNurFreigabe] = useState(false)
  const [laedt, setLaedt] = useState(true)
  const tag = heuteIso()

  useEffect(() => {
    (async () => {
      const [{ data: vs }, { data: ks }] = await Promise.all([
        supabase.from('videos')
          .select('id, title, client_id, status, produktion_stufe, scheduled_date, dropbox_pfad, clients(name, logo_url, active, pausiert_seit, deleted_at)')
          .is('deleted_at', null).neq('status', 'posted'),
        supabase.from('video_kommentare').select('video_id').eq('erledigt', false),
      ])
      const lebend = ((vs ?? []) as unknown as V[]).filter((v) => v.clients && v.clients.active !== false && !v.clients.deleted_at && !v.clients.pausiert_seit)
      setVideos(lebend)
      const m = new Map<string, number>()
      for (const k of (ks ?? []) as { video_id: string }[]) m.set(k.video_id, (m.get(k.video_id) ?? 0) + 1)
      setOffen(m)
      setLaedt(false)
    })()
  }, [])

  useEffect(() => { try { localStorage.setItem('schnitt-ansicht', ansicht) } catch { /* egal */ } }, [ansicht])

  const sortiert = useMemo(() => {
    const liste = nurFreigabe ? videos.filter((v) => v.produktion_stufe === 'pruefung') : videos
    return [...liste].sort((a, b) => (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999') || (a.title ?? '').localeCompare(b.title ?? ''))
  }, [videos, nurFreigabe])

  const gruppen = useMemo(() => {
    const m = new Map<string, V[]>()
    for (const v of sortiert) m.set(v.client_id, [...(m.get(v.client_id) ?? []), v])
    // Kunde mit der dringendsten Deadline zuerst
    return [...m.values()].sort((a, b) => (a[0].scheduled_date ?? '9999').localeCompare(b[0].scheduled_date ?? '9999'))
  }, [sortiert])

  const freigabeAnzahl = videos.filter((v) => v.produktion_stufe === 'pruefung').length

  const Zeile = ({ v, mitKunde }: { v: V; mitKunde: boolean }) => {
    const s = stufe(v)
    const lage = deadlineLage(v.scheduled_date, tag)
    const n = offen.get(v.id) ?? 0
    return (
      <button className="sl-zeile" onClick={() => navigate(`/schnitt/${v.id}`)}>
        {mitKunde && <LogoFrame name={v.clients?.name ?? ''} logoUrl={v.clients?.logo_url ?? null} className="sl-logo" />}
        <span className="sl-text">
          <strong>{v.title || 'Ohne Titel'}</strong>
          <small>
            <span className={`sl-stufe ${s.klasse}`}>{s.text}</span>
            {mitKunde && <> · {v.clients?.name}</>}
          </small>
        </span>
        {n > 0 && <span className="sl-anm" title={`${n} offene Anmerkungen`}><MessageSquareText size={14} />{n}</span>}
        <span className={`sl-frist ${lage}`}>{deadlineText(v.scheduled_date, tag)}</span>
        <ChevronRight size={16} className="sl-pfeil" />
      </button>
    )
  }

  return (
    <div className="sl">
      <div className="sl-kopf">
        <div className="seg">
          <button className={`seg-btn ${ansicht === 'kunden' ? 'on' : ''}`} onClick={() => setAnsicht('kunden')}>Nach Kunden</button>
          <button className={`seg-btn ${ansicht === 'deadline' ? 'on' : ''}`} onClick={() => setAnsicht('deadline')}>Nach Deadline</button>
        </div>
        <button className={`sl-filter ${nurFreigabe ? 'an' : ''}`} onClick={() => setNurFreigabe((x) => !x)}>
          Zur Freigabe{freigabeAnzahl ? ` · ${freigabeAnzahl}` : ''}
        </button>
      </div>

      {!laedt && sortiert.length === 0 && <div className="sl-leer">{nurFreigabe ? 'Nichts wartet auf Freigabe.' : 'Keine offenen Videos.'}</div>}

      {ansicht === 'kunden' ? (
        gruppen.map((g) => (
          <section key={g[0].client_id} className="sl-gruppe">
            <div className="sl-gruppe-kopf">
              <LogoFrame name={g[0].clients?.name ?? ''} logoUrl={g[0].clients?.logo_url ?? null} className="sl-logo" />
              <h2>{g[0].clients?.name}</h2>
              <span>{g.length}</span>
            </div>
            <div className="sl-liste">{g.map((v) => <Zeile key={v.id} v={v} mitKunde={false} />)}</div>
          </section>
        ))
      ) : (
        <div className="sl-liste">{sortiert.map((v) => <Zeile key={v.id} v={v} mitKunde />)}</div>
      )}
    </div>
  )
}
