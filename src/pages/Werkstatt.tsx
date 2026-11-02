// Werkstatt -- Schneiden (Fassie, 01.11.2026)
// ---------------------------------------------------------------------------
// "Eine Oberflaeche, wo ich entscheiden kann, mit welchem Video ich anfange
//  zu schneiden -- oder mehrere anklicke. Das Schneiden will ich dann im
//  Chat machen."
//
// Oben: was gerade im Schnitt ist (ein Chat pro Video, videos.chat_url).
// Darunter: alle Videos, die Material haben und noch nicht geschnitten sind,
// je Kunde. Anhaken -> "Im Chat schneiden" oeffnet einen Claude-Chat mit dem
// fertigen Auftrag. Der Chat meldet sich selbst im CRM an (ofen_belegen),
// darum taucht das Video danach oben unter "Im Schnitt" auf.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, ExternalLink, Film, MessageCircle, Scissors, Square, CheckSquare } from 'lucide-react'
import LogoFrame from '../components/LogoFrame'
import { supabase } from '../lib/supabase'
import { chatLink as chatLinkRoh } from '../lib/backstube'
import '../styles/werkstatt.css'

interface V {
  id: string
  title: string | null
  client_id: string
  status: string
  produktion_stufe: string | null
  prep_shot: boolean | null
  dropbox_pfad: string | null
  archiv_pfad?: string | null
  chat_url: string | null
  scheduled_date: string | null
  clients: { name: string; logo_url: string | null; active: boolean | null; pausiert_seit: string | null; deleted_at: string | null } | null
}

const chatLink = (v: Pick<V, 'id' | 'title' | 'clients' | 'chat_url'>) => chatLinkRoh({ id: v.id, title: v.title ?? 'Video', chat_url: v.chat_url, clients: v.clients ? { id: v.id, name: v.clients.name } : null })

interface Auftrag { video_id: string; status: string; gestartet_am: string | null; wunsch: string }

/** Auftrag fuer einen Chat, der mehrere Videos nacheinander schneidet. */
export function sammelAuftrag(videos: Pick<V, 'id' | 'title' | 'clients'>[]): string {
  const zeilen = videos.map((v, i) => `${i + 1}. ${v.clients?.name ?? 'Kunde'} – ${v.title ?? 'Video'} (video_id ${v.id})`)
  return [
    `🍕 Schneiden: ${videos.length} Videos`,
    ...zeilen,
    '',
    '1. Lade den Skill sowloynab-crm.',
    '2. Merk dir diesen Chat im CRM: recent_chats(n=1) → dessen url → update videos set chat_url = \'<url>\' where id in (…alle oben…).',
    '3. Nimm das erste Video: im Ofen anmelden (ofen_belegen), Material aus videos.dropbox_pfad (sonst archiv_pfad), schneiden, Vorschau hier zeigen.',
    '4. Ich sage dir meine Änderungen. Sage ich „passt“, servierst du (Pipeline.md, Abschnitt 3.5) und nimmst das nächste Video.',
  ].join('\n')
}

export default function Werkstatt() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState<V[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [laedt, setLaedt] = useState(true)
  const [gewaehlt, setGewaehlt] = useState<string[]>([])

  const laden = useCallback(async () => {
    const [v, a] = await Promise.all([
      supabase.from('videos')
        .select('id, title, client_id, status, produktion_stufe, prep_shot, dropbox_pfad, archiv_pfad, chat_url, scheduled_date, clients(name, logo_url, active, pausiert_seit, deleted_at)')
        .is('deleted_at', null).neq('status', 'posted')
        .order('scheduled_date', { ascending: true, nullsFirst: false }).limit(500),
      supabase.from('video_aenderungen').select('video_id, status, gestartet_am, wunsch').is('deleted_at', null).in('status', ['offen', 'laeuft']),
    ])
    setVideos(((v.data ?? []) as unknown as V[]).filter((x) => x.clients && !x.clients.deleted_at && x.clients.active !== false && !x.clients.pausiert_seit))
    setAuftraege((a.data ?? []) as Auftrag[])
    setLaedt(false)
  }, [])
  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    const ch = supabase.channel('werkstatt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => laden())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_aenderungen' }, () => laden())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [laden])

  const imSchnitt = useMemo(() => {
    const ids = new Set(auftraege.map((a) => a.video_id))
    return videos.filter((v) => ids.has(v.id)).map((v) => ({ v, a: auftraege.find((a) => a.video_id === v.id)! }))
  }, [videos, auftraege])

  // Zum Schneiden: Material da, noch nicht geschnitten, nicht gerade im Schnitt
  const offen = useMemo(() => {
    const ids = new Set(auftraege.map((a) => a.video_id))
    return videos.filter((v) => !ids.has(v.id)
      && !['pruefung', 'feinschliff', 'fertig'].includes(v.produktion_stufe ?? '')
      && !['ready', 'planned'].includes(v.status))
  }, [videos, auftraege])

  const jeKunde = useMemo(() => {
    const m = new Map<string, { name: string; logo: string | null; liste: V[] }>()
    for (const v of offen) {
      if (!m.has(v.client_id)) m.set(v.client_id, { name: v.clients!.name, logo: v.clients!.logo_url, liste: [] })
      m.get(v.client_id)!.liste.push(v)
    }
    // Kunden mit Material zuerst
    return [...m.values()].sort((a, b) => Number(b.liste.some(hatMaterial)) - Number(a.liste.some(hatMaterial)) || a.name.localeCompare(b.name))
  }, [offen])

  function hatMaterial(v: V): boolean { return !!(v.dropbox_pfad || v.archiv_pfad || v.prep_shot) }
  function umschalten(id: string) { setGewaehlt((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id])) }

  function schneiden() {
    const liste = gewaehlt.map((id) => videos.find((v) => v.id === id)!).filter(Boolean)
    if (!liste.length) return
    const url = liste.length === 1 ? chatLink(liste[0]) : `https://claude.ai/new?q=${encodeURIComponent(sammelAuftrag(liste))}`
    window.open(url, '_blank', 'noopener')
    setGewaehlt([])
  }

  // Neu (02.11.2026): oben nur, was sich wirklich schneiden laesst -- flach,
  // nach Posting-Tag. Reine Ideen ohne Material eingeklappt je Kunde darunter.
  const bereit = useMemo(() => offen.filter(hatMaterial), [offen])
  const ideen = useMemo(() => jeKunde.map((k) => ({ ...k, liste: k.liste.filter((v) => !hatMaterial(v)) })).filter((k) => k.liste.length > 0), [jeKunde])
  const datum = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }) : null

  return (
    <div className="wk">
      {imSchnitt.length > 0 && (
        <section className="wk-block">
          <div className="wk-block-kopf"><Scissors strokeWidth={2.2} /><h2>Im Schnitt</h2><span>{imSchnitt.length}</span></div>
          <div className="wk-liste">
            {imSchnitt.map(({ v, a }) => (
              <a key={v.id} className="wk-zeile" href={chatLink(v)} target="_blank" rel="noopener">
                <LogoFrame name={v.clients?.name ?? ''} logoUrl={v.clients?.logo_url ?? null} className="wk-logo" />
                <span className="wk-text">
                  <strong>{v.title || 'Video'}</strong>
                  <small>{v.clients?.name} · {a.status === 'laeuft' ? 'Claude schneidet gerade' : 'wartet in der Schlange'}</small>
                </span>
                <span className="wk-chat"><MessageCircle strokeWidth={2.2} /> Chat</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="wk-block">
        <div className="wk-block-kopf"><Film strokeWidth={2.2} /><h2>Bereit zum Schneiden</h2><span>{bereit.length}</span></div>
        {!laedt && bereit.length === 0 && <div className="wk-leer">Nichts bereit. Sobald Material in der Dropbox liegt, steht das Video hier.</div>}
        {bereit.length > 0 && (
          <div className="wk-liste">
            {bereit.map((v) => {
              const an = gewaehlt.includes(v.id)
              return (
                <div key={v.id} className={`wk-zeile ${an ? 'an' : ''}`}>
                  <button className="wk-haken" onClick={() => umschalten(v.id)} aria-label={an ? 'Abwählen' : 'Auswählen'}>
                    {an ? <CheckSquare strokeWidth={2.2} /> : <Square strokeWidth={2} />}
                  </button>
                  <LogoFrame name={v.clients?.name ?? ''} logoUrl={v.clients?.logo_url ?? null} className="wk-logo klein" />
                  <button className="wk-text" onClick={() => umschalten(v.id)}>
                    <strong>{v.title || 'Video'}</strong>
                    <small>{v.clients?.name}{datum(v.scheduled_date) ? ` · Post ${datum(v.scheduled_date)}` : ''}{v.dropbox_pfad || v.archiv_pfad ? '' : ' · gedreht'}</small>
                  </button>
                  <button className="wk-auf" onClick={() => navigate(`/client/${v.client_id}?video=${v.id}&open=1`)} aria-label="Öffnen"><ExternalLink strokeWidth={2.2} /></button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {ideen.length > 0 && (
        <section className="wk-block wk-ideen">
          <div className="wk-block-kopf leise"><h2>Noch ohne Material</h2><span>{ideen.reduce((n, k) => n + k.liste.length, 0)}</span></div>
          {ideen.map((k) => (
            <details key={k.name} className="wk-klappe">
              <summary>
                <LogoFrame name={k.name} logoUrl={k.logo} className="wk-logo klein" />
                <strong>{k.name}</strong>
                <small>{k.liste.length} {k.liste.length === 1 ? 'Idee' : 'Ideen'}{datum(k.liste[0].scheduled_date) ? ` · nächste ${datum(k.liste[0].scheduled_date)}` : ''}</small>
                <ChevronRight className="wk-klappe-pfeil" />
              </summary>
              <div className="wk-liste">
                {k.liste.map((v) => (
                  <button key={v.id} className="wk-zeile ohne" onClick={() => navigate(`/client/${v.client_id}?video=${v.id}&open=1`)}>
                    <span className="wk-text">
                      <strong>{v.title || 'Video'}</strong>
                      <small>{datum(v.scheduled_date) ? `Post ${datum(v.scheduled_date)}` : 'ohne Termin'}</small>
                    </span>
                    <ChevronRight className="wk-klappe-pfeil" />
                  </button>
                ))}
              </div>
            </details>
          ))}
        </section>
      )}

      {gewaehlt.length > 0 && (
        <div className="wk-leiste">
          <span>{gewaehlt.length} {gewaehlt.length === 1 ? 'Video' : 'Videos'} gewählt</span>
          <button className="wk-los" onClick={schneiden}><Check strokeWidth={2.6} /> Im Chat schneiden</button>
        </div>
      )}
    </div>
  )
}
