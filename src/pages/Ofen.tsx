// Videos -- die einfache Produktionsseite (Fassie, 01.11.2026)
// ---------------------------------------------------------------------------
// "Einfach einen Bereich, wo alle fertigen Videos sind, dann weise ich mir die
//  zu, dann bearbeite ich die. Dann sind sie bereit zum Posten, und wenn sie
//  gepostet sind, sind sie gepostet. Es ist alles zu viel gerade."
//
// Drei Stufen, sonst nichts:
//   Fertig     Claude hat geschnitten (produktion_stufe pruefung/feinschliff)
//              -> "Ich nehm's" (bearbeiter_id), bearbeiten, "Bereit"
//   Bereit     produktion_stufe fertig / status ready|planned -> "Gepostet"
//   Gepostet   status posted, letzte 30 Tage
// Was Claude gerade noch schneidet, steht nur als eine kleine Zeile oben.
// Die Pizza-Logik (lib/backstube.ts) bleibt fuer die Automatik bestehen.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Hand, Play, RefreshCw, Scissors, Send, CheckCircle2, Undo2 } from 'lucide-react'
import LogoFrame from '../components/LogoFrame'
import { supabase } from '../lib/supabase'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { useToast } from '../context/ToastContext'
import { celebrate } from '../lib/confetti'
import { alsGepostet } from '../lib/videoAktionen'
import { dropbox } from '../lib/medien'
import { vorschauPfad } from '../lib/freigabe'
import '../styles/videos.css'

type Reiter = 'fertig' | 'bereit' | 'gepostet'

interface V {
  id: string
  title: string | null
  client_id: string
  status: string
  produktion_stufe: string | null
  bearbeiter_id: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  posted_at: string | null
  dropbox_pfad: string | null
  clients: { name: string; logo_url: string | null; active: boolean | null; pausiert_seit: string | null; deleted_at: string | null } | null
}

export function reiterVon(v: Pick<V, 'status' | 'produktion_stufe'>): Reiter | null {
  if (v.status === 'posted') return 'gepostet'
  if (v.produktion_stufe === 'fertig' || v.status === 'ready' || v.status === 'planned') return 'bereit'
  if (v.produktion_stufe === 'pruefung' || v.produktion_stufe === 'feinschliff') return 'fertig'
  return null
}

const datum = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : null)

export default function Ofen() {
  const navigate = useNavigate()
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const { toast } = useToast()
  const [videos, setVideos] = useState<V[]>([])
  const [imSchnitt, setImSchnitt] = useState<Set<string>>(new Set())
  const [laedt, setLaedt] = useState(true)
  const [reiter, setReiter] = useState<Reiter>('fertig')
  const [bilder, setBilder] = useState<Map<string, string>>(new Map())

  const laden = useCallback(async () => {
    const seit = new Date(Date.now() - 30 * 86400_000).toISOString()
    const [v, a] = await Promise.all([
      supabase.from('videos')
        .select('id, title, client_id, status, produktion_stufe, bearbeiter_id, scheduled_date, scheduled_time, posted_at, dropbox_pfad, clients(name, logo_url, active, pausiert_seit, deleted_at)')
        .is('deleted_at', null)
        .or(`produktion_stufe.in.(pruefung,feinschliff,fertig),status.in.(ready,planned),and(status.eq.posted,posted_at.gte.${seit})`)
        .limit(600),
      supabase.from('video_aenderungen').select('video_id').is('deleted_at', null).in('status', ['offen', 'laeuft']),
    ])
    setVideos(((v.data ?? []) as unknown as V[]).filter((x) => x.clients && !x.clients.deleted_at && x.clients.active !== false))
    setImSchnitt(new Set(((a.data ?? []) as { video_id: string }[]).map((x) => x.video_id)))
    setLaedt(false)
  }, [])

  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    const ch = supabase.channel('videos-seite')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => laden())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_aenderungen' }, () => laden())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [laden])

  const listen = useMemo(() => {
    const l: Record<Reiter, V[]> = { fertig: [], bereit: [], gepostet: [] }
    for (const v of videos) {
      const r = reiterVon(v)
      if (!r) continue
      if (r === 'fertig' && imSchnitt.has(v.id)) continue // wird noch geschnitten
      if (r !== 'gepostet' && v.clients?.pausiert_seit) continue
      l[r].push(v)
    }
    // Fertig: meine zuerst, dann freie, dann die vom anderen
    const rang = (v: V) => (v.bearbeiter_id === memberId ? 0 : !v.bearbeiter_id ? 1 : 2)
    l.fertig.sort((a, b) => rang(a) - rang(b) || (a.clients?.name ?? '').localeCompare(b.clients?.name ?? ''))
    l.bereit.sort((a, b) => (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999') || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))
    l.gepostet.sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''))
    return l
  }, [videos, imSchnitt, memberId])

  // Standbilder fuer Fertig/Bereit
  useEffect(() => {
    const kand = [...listen.fertig, ...listen.bereit]
      .filter((v) => v.dropbox_pfad && !/\.mp4$/i.test(v.dropbox_pfad) && !bilder.has(v.id)).slice(0, 30)
    if (!kand.length) return
    dropbox.vorschauen(kand.map((v) => `${v.dropbox_pfad!.replace(/\/+$/, '')}/Standbild.jpg`))
      .then((r) => setBilder((alt) => { const n = new Map(alt); r.forEach((x, i) => n.set(kand[i].id, x.bild ?? '')); return n }))
      .catch(() => { /* ohne Bild geht es auch */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen])

  function lokal(id: string, patch: Partial<V>) { setVideos((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))) }

  async function speichern(id: string, patch: Partial<V>, meldung: string) {
    lokal(id, patch)
    const { error } = await supabase.from('videos').update(patch).eq('id', id)
    if (error) { toast('Konnte nicht speichern: ' + error.message); laden(); return }
    toast(meldung)
  }

  async function ansehen(v: V) {
    if (!v.dropbox_pfad) { navigate(`/client/${v.client_id}?video=${v.id}&open=1`); return }
    try {
      const pfad = /\.mp4$/i.test(v.dropbox_pfad) ? v.dropbox_pfad : vorschauPfad(v.dropbox_pfad)
      window.open(await dropbox.link(pfad), '_blank', 'noopener')
    } catch { navigate(`/client/${v.client_id}?video=${v.id}&open=1`) }
  }

  async function gepostet(v: V) {
    lokal(v.id, { status: 'posted', posted_at: new Date().toISOString() })
    celebrate()
    const f = await alsGepostet({ id: v.id })
    if (f) { toast('Konnte nicht speichern: ' + f); laden(); return }
    toast('Gepostet')
  }

  const vorname = (id: string | null) => (id ? (byId(id)?.name ?? '').split(' ')[0] : '')
  const liste = listen[reiter]

  return (
    <div className="vd">
      <div className="vd-kopf">
        <h1>Videos</h1>
        <button className="vd-neu-laden" onClick={() => { setLaedt(true); laden() }} aria-label="Aktualisieren"><RefreshCw strokeWidth={2.2} className={laedt ? 'dreht' : ''} /></button>
      </div>
      {imSchnitt.size > 0 && <p className="vd-schnitt"><Scissors strokeWidth={2.2} /> {imSchnitt.size} {imSchnitt.size === 1 ? 'Video wird' : 'Videos werden'} gerade geschnitten</p>}

      <div className="vd-reiter" role="tablist">
        {([['fertig', 'Fertig'], ['bereit', 'Bereit zum Posten'], ['gepostet', 'Gepostet']] as const).map(([k, name]) => (
          <button key={k} role="tab" aria-selected={reiter === k} className={reiter === k ? 'an' : ''} onClick={() => setReiter(k)}>
            {name}<span>{listen[k].length}</span>
          </button>
        ))}
      </div>

      {!laedt && liste.length === 0 && (
        <div className="vd-leer">
          {reiter === 'fertig' ? 'Keine fertigen Videos — alles verteilt.' : reiter === 'bereit' ? 'Nichts wartet aufs Posten.' : 'In den letzten 30 Tagen nichts gepostet.'}
        </div>
      )}

      <div className="vd-liste">
        {liste.map((v) => {
          const bild = bilder.get(v.id)
          const meins = v.bearbeiter_id === memberId
          return (
            <div key={v.id} className={`vd-karte ${reiter}`}>
              <button className="vd-bild" onClick={() => ansehen(v)} aria-label="Ansehen" style={bild ? { backgroundImage: `url(${bild})` } : undefined}>
                {!bild && <LogoFrame name={v.clients?.name ?? ''} logoUrl={v.clients?.logo_url ?? null} className="vd-logo" />}
                {reiter !== 'gepostet' && <span className="vd-play"><Play strokeWidth={2.4} /></span>}
              </button>
              <button className="vd-text" onClick={() => navigate(`/client/${v.client_id}?video=${v.id}&open=1`)}>
                <strong>{v.title || 'Video'}</strong>
                <small>{v.clients?.name}</small>
                {reiter === 'fertig' && <em className={meins ? 'meins' : v.bearbeiter_id ? 'anderer' : 'frei'}>{meins ? 'Du bearbeitest' : v.bearbeiter_id ? `${vorname(v.bearbeiter_id)} bearbeitet` : 'Noch frei'}</em>}
                {reiter === 'bereit' && <em>{v.scheduled_date ? `${datum(v.scheduled_date)}${v.scheduled_time ? ' · ' + v.scheduled_time.slice(0, 5) : ''}` : 'ohne Termin'}</em>}
                {reiter === 'gepostet' && <em>{datum(v.posted_at)}</em>}
              </button>
              <div className="vd-tun">
                {reiter === 'fertig' && !meins && (
                  <button className="vd-knopf leise" onClick={() => speichern(v.id, { bearbeiter_id: memberId }, 'Ist jetzt deins')}><Hand strokeWidth={2.4} /> Ich nehm's</button>
                )}
                {reiter === 'fertig' && meins && (
                  <button className="vd-knopf" onClick={() => speichern(v.id, { produktion_stufe: 'fertig', status: v.status === 'planned' ? 'planned' : 'ready' }, 'Bereit zum Posten')}><CheckCircle2 strokeWidth={2.4} /> Bereit</button>
                )}
                {reiter === 'bereit' && (
                  <button className="vd-knopf" onClick={() => gepostet(v)}><Send strokeWidth={2.4} /> Gepostet</button>
                )}
                {reiter === 'bereit' && (
                  <button className="vd-klein" title="Zurück zu Fertig" aria-label="Zurück zu Fertig" onClick={() => speichern(v.id, { produktion_stufe: 'feinschliff', status: 'todo' }, 'Zurück zu Fertig')}><Undo2 strokeWidth={2.2} /></button>
                )}
                {reiter === 'gepostet' && <span className="vd-haken"><Check strokeWidth={2.6} /></span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
