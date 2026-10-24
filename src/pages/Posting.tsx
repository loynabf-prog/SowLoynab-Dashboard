// Plan: was rausgeht -- und ob es rechtzeitig fertig wird.
// ---------------------------------------------------------------------------
// Statt einer langen Liste ein Wochenstreifen: jeder Tag mit einem Punkt
// in der Ampelfarbe seines schlimmsten Posts. Man tippt einen Tag an und
// sieht nur dessen Posts. Was hinterherhaengt oder ohne Link ist, steht als
// je ein Band oben und klappt erst auf, wenn man es braucht.
//
// Fristen (lib/fristen.ts): gedreht 21 Tage, geschnitten 3, eingeplant 1
// Tag vor dem Posting-Tag. Live: aendert Lion etwas, sieht man es sofort.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flame, Link2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { monatsKalender, monatPlus, monatName } from '../lib/monate'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGemerkt, istGemerkt } from '../lib/merken'
import { nachPause, type MitPause } from '../lib/pause'
import { celebrate } from '../lib/confetti'
import { useToast } from '../context/ToastContext'
import { type TagVideo } from '../components/PostSchritt'
import PostZeile from '../components/PostZeile'
import { heute, datumPlus } from '../lib/datum'
import { nachKunde, proKundeSatz } from '../lib/tageslage'
import { fristInfo, nachDringlichkeit, jetztUhrzeit } from '../lib/fristen'
import { fehlendeLinks, mitKundeLaden, mitPlattformen, postPhase } from '../lib/postschritte'
import {
  alsGepostet, linkSetzen, postenPatch, terminSetzen, vorarbeitSetzen,
  type LinkFeld, type VorarbeitKey,
} from '../lib/videoAktionen'

/** Wie weit nach vorn wir schauen. Etwas mehr als die Dreh-Frist. */
const VORAUS_TAGE = 70
/** Wie weit zurueck verpasste oder unvollstaendige Posts noch auftauchen. */
const RUECKBLICK_TAGE = 60

function wochentag(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function Posting() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [videos, setVideos] = useGemerkt<TagVideo[]>('plan.videos', [])
  const [ohneTermin, setOhneTermin] = useGemerkt('plan.ohneTermin', 0)
  // Pausierte Kunden (0045) stehen nicht im Plan -- nur ein Hinweis darauf.
  const [pausiert, setPausiert] = useGemerkt<string[]>('plan.pausiert', [])
  const [loading, setLoading] = useState(() => !istGemerkt('plan.videos'))
  // Datum und Uhrzeit laufen mit: wer die Seite ueber Mitternacht oder
  // ueber die Post-Uhrzeit offen hat, sieht trotzdem den richtigen Stand.
  const [jetzt, setJetzt] = useState(() => ({ tag: heute(), zeit: jetztUhrzeit() }))
  const heuteIso = jetzt.tag
  const morgenIso = datumPlus(heuteIso, 1)

  const laden = useCallback(async () => {
    const tag = heute()
    const [res, offen] = await Promise.all([
      mitKundeLaden((kunde) => supabase
        .from('videos')
        .select(`*, ${kunde}`)
        .is('deleted_at', null)
        .gte('scheduled_date', datumPlus(tag, -RUECKBLICK_TAGE))
        .lte('scheduled_date', datumPlus(tag, VORAUS_TAGE))
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true, nullsFirst: false })),
      supabase
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .is('scheduled_date', null)
        .neq('status', 'posted'),
    ])
    if (res.error) { toast('Konnte Videos nicht laden: ' + res.error.message); setLoading(false); return }
    const liste = mitPlattformen((res.data ?? []) as unknown as TagVideo[])
    // Drehtage dazuholen: ein vergangener Drehtag heisst "gedreht".
    const ids = [...new Set(liste.map((v) => v.shoot_event_id).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: ev } = await supabase.from('events').select('id, starts_on').in('id', ids)
      const datum = new Map((ev ?? []).map((e: { id: string; starts_on: string }) => [e.id, e.starts_on]))
      for (const v of liste) if (v.shoot_event_id) v.drehtag = datum.get(v.shoot_event_id) ?? null
    }
    const { laufend, pausiert: weg } = nachPause(liste as (TagVideo & { clients?: MitPause | null })[])
    setVideos(laufend as TagVideo[])
    setPausiert([...new Set(weg.map((v) => (v.clients as { name?: string } | null)?.name).filter(Boolean))] as string[])
    setOhneTermin(offen.count ?? 0)
    setLoading(false)
  }, [toast])

  useEffect(() => { laden() }, [laden])

  // Live-Abgleich: jede Aenderung an Videos -> kurz gesammelt neu laden.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const neu = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => laden(), 600)
    }
    const ch = supabase
      .channel('posting-videos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, neu)
      .subscribe()
    // Zurueck in die App (Handy entsperrt, Tab gewechselt): frisch laden.
    const sichtbar = () => {
      if (document.visibilityState !== 'visible') return
      setJetzt({ tag: heute(), zeit: jetztUhrzeit() })
      laden()
    }
    document.addEventListener('visibilitychange', sichtbar)
    const uhr = setInterval(() => setJetzt({ tag: heute(), zeit: jetztUhrzeit() }), 60_000)
    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', sichtbar)
      clearInterval(uhr)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [laden])

  // ---- Einteilen -----------------------------------------------------------
  const f = useCallback((v: TagVideo) => fristInfo(v, heuteIso, jetzt.zeit), [heuteIso, jetzt.zeit])
  const [wahl, setWahl] = useState<string | null>(null)
  const [band, setBand] = useState<'brennt' | 'links' | null>(null)
  const gewaehlt = wahl ?? heuteIso

  const einteilung = useMemo(() => {
    const vergangen = videos.filter((v) => (v.scheduled_date ?? '') < heuteIso)
    const offen = videos.filter((v) => v.status !== 'posted')
    const verpasst = vergangen.filter((v) => v.status !== 'posted')
    const linksFehlen = vergangen
      .filter((v) => postPhase(v) === 'gepostet')
      .sort((a, b) => (b.scheduled_date ?? '').localeCompare(a.scheduled_date ?? ''))
      .slice(0, 15)
    const brennt = nachDringlichkeit(offen.filter((v) => f(v).ampel === 'rot'), heuteIso, jetzt.zeit)

    // Pro Tag: alle Posts und die schlimmste Ampel.
    const proTag = new Map<string, TagVideo[]>()
    for (const v of videos) if (v.scheduled_date) proTag.set(v.scheduled_date, [...(proTag.get(v.scheduled_date) ?? []), v])
    const RANG = { rot: 3, gelb: 2, gruen: 1 } as Record<string, number>
    const ampelTag = (tag: string): string | null => {
      const l = proTag.get(tag)
      if (!l || l.length === 0) return null
      let schlimm = 'gruen'
      for (const v of l) {
        if (v.status === 'posted') continue
        const a = f(v).ampel
        if ((RANG[a] ?? 0) > (RANG[schlimm] ?? 0)) schlimm = a
      }
      return schlimm
    }

    const zahlen = offen.map(f)
    return {
      brennt, verpasst, linksFehlen, proTag, ampelTag,
      zahl: (a: string) => zahlen.filter((x) => x.ampel === a).length,
    }
  }, [videos, heuteIso, jetzt.zeit, f])

  // ---- Ansicht: Tag / 3 Tage / Woche / Monat -- immer ab heute, nie zurueck.
  const [ansicht, setAnsichtRoh] = useState<'tag' | '3' | 'woche' | 'monat'>(() => {
    try { const a = localStorage.getItem('sl-plan-ansicht'); if (a === 'tag' || a === '3' || a === 'woche' || a === 'monat') return a } catch { /* egal */ }
    return '3'
  })
  const setAnsicht = (a: typeof ansicht) => { setAnsichtRoh(a); try { localStorage.setItem('sl-plan-ansicht', a) } catch { /* egal */ } }
  const [monatKey, setMonatKey] = useState(() => heuteIso.slice(0, 7))
  const zeigeTag = (t: string) => { setWahl(t); setAnsicht('tag'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const tageAb = (n: number) => Array.from({ length: n }, (_, i) => datumPlus(heuteIso, i))

  // ---- Aktionen ------------------------------------------------------------
  async function posten(v: TagVideo) {
    const zeit = new Date()
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...(postenPatch({ ...v, posted_at: null }, zeit) as Partial<TagVideo>) } : x)))
    celebrate()
    const fehler = await alsGepostet(v, zeit)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    toast('Gepostet — stark!')
  }

  async function link(v: TagVideo, feld: LinkFeld, url: string) {
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, [feld]: url } : x)))
    const fehler = await linkSetzen(v.id, feld, url)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    toast(fehlendeLinks({ ...v, [feld]: url }).length === 0 ? 'Alle Links drin — erledigt' : 'Gespeichert')
  }

  async function vorarbeit(v: TagVideo, key: VorarbeitKey, wert: boolean) {
    const { patch, fehler } = await vorarbeitSetzen(v, key, wert)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...patch } : x)))
  }

  async function verschieben(v: TagVideo, datum: string) {
    const fehler = await terminSetzen(v.id, datum)
    if (fehler) { toast('Konnte nicht verschieben: ' + fehler); return }
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, scheduled_date: datum } : x)))
    toast(`Verschoben auf ${wochentag(datum)}`)
  }

  function zeile(v: TagVideo, zeigeDatum = false) {
    return (
      <PostZeile
        key={v.id}
        video={v}
        frist={f(v)}
        heuteIso={heuteIso}
        zeigeDatum={zeigeDatum}
        onOeffnen={() => navigate(`/client/${v.client_id}`)}
            onKunde={() => navigate(`/client/${v.client_id}`)}
            onVideo={() => navigate(`/client/${v.client_id}?video=${v.id}&open=1`)}
        onPosten={() => posten(v)}
        onLink={(feld, url) => link(v, feld, url)}
        onVorarbeit={(key, wert) => vorarbeit(v, key, wert)}
        onTermin={(d) => verschieben(v, d)}
      />
    )
  }

  const { brennt, linksFehlen, proTag, zahl } = einteilung
  const tagListe = proTag.get(gewaehlt) ?? []
  const monat = new Date(gewaehlt + 'T12:00:00').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  const tagTitel = gewaehlt === heuteIso ? 'Heute' : gewaehlt === morgenIso ? 'Morgen'
    : new Date(gewaehlt + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <div className="h-datum">{monat}</div>
      <h1 className="h-gruss">Plan</h1>

      {loading ? (
        <div className="n-leer">Lade …</div>
      ) : (
        <>
          <div className="p-lage" role="list">
            <button className={zahl('rot') ? 'rot' : 'null'} role="listitem" onClick={() => setBand(band === 'brennt' ? null : 'brennt')}><strong>{zahl('rot')}</strong><span>verpasst</span></button>
            <button className={zahl('gelb') ? 'gelb' : 'null'} role="listitem" onClick={() => setAnsicht('3')}><strong>{zahl('gelb')}</strong><span>bald fällig</span></button>
            <button className="gruen" role="listitem" onClick={() => setAnsicht('monat')}><strong>{zahl('gruen')}</strong><span>im Plan</span></button>
          </div>

          {brennt.length > 0 && (
            <>
              <button className="p-band" onClick={() => setBand(band === 'brennt' ? null : 'brennt')} aria-expanded={band === 'brennt'}>
                <span className="n-ic rot"><Flame strokeWidth={2.2} /></span>
                <span className="n-text">
                  <strong>{brennt.length} {brennt.length === 1 ? 'Post hängt' : 'Posts hängen'} hinterher</strong>
                  <span>{proKundeSatz(brennt.map((v) => v.clients?.name))}</span>
                </span>
                <ChevronDown className="n-chevron" style={{ transform: band === 'brennt' ? 'rotate(180deg)' : undefined }} />
              </button>
              {band === 'brennt' && nachKunde(brennt, (v) => v.clients?.name).map((g) => (
                <div key={g.kunde} style={{ marginBottom: 10 }}>
                  <div className="n-zwischen">{g.kunde} · {g.eintraege.length}</div>
                  <div className="n-gruppe">{g.eintraege.map((v) => zeile(v, true))}</div>
                </div>
              ))}
            </>
          )}

          {linksFehlen.length > 0 && (
            <>
              <button className="p-band" onClick={() => setBand(band === 'links' ? null : 'links')} aria-expanded={band === 'links'}>
                <span className="n-ic gelb"><Link2 strokeWidth={2.2} /></span>
                <span className="n-text">
                  <strong>{linksFehlen.length} ohne Link</strong>
                  <span>Ohne Link kommen keine Zahlen</span>
                </span>
                <ChevronDown className="n-chevron" style={{ transform: band === 'links' ? 'rotate(180deg)' : undefined }} />
              </button>
              {band === 'links' && <div className="n-gruppe" style={{ marginBottom: 10 }}>{linksFehlen.map((v) => zeile(v, true))}</div>}
            </>
          )}

          <div className="n-segment" role="tablist" aria-label="Ansicht" style={{ marginTop: 6 }}>
            <button className={ansicht === 'tag' ? 'on' : ''} onClick={() => setAnsicht('tag')}>Tag</button>
            <button className={ansicht === '3' ? 'on' : ''} onClick={() => setAnsicht('3')}>3 Tage</button>
            <button className={ansicht === 'woche' ? 'on' : ''} onClick={() => setAnsicht('woche')}>Woche</button>
            <button className={ansicht === 'monat' ? 'on' : ''} onClick={() => setAnsicht('monat')}>Monat</button>
          </div>

          {ansicht === 'tag' && (
            <>
              <div className="pl-tagkopf">
                <button className="pl-pfeil" onClick={() => setWahl(datumPlus(gewaehlt, -1))} disabled={gewaehlt <= heuteIso} aria-label="Vorheriger Tag"><ChevronLeft /></button>
                <div className="pl-tagtitel">
                  <strong>{tagTitel}</strong>
                  <span>{tagListe.length ? `${tagListe.length} ${tagListe.length === 1 ? 'Post' : 'Posts'}` : 'nichts geplant'}</span>
                </div>
                <button className="pl-pfeil" onClick={() => setWahl(datumPlus(gewaehlt, 1))} aria-label="Nächster Tag"><ChevronRight /></button>
              </div>
              <div className="n-gruppe">
                {tagListe.length === 0
                  ? <div className="n-leer">An diesem Tag geht nichts raus.</div>
                  : tagListe.map((v) => zeile(v))}
              </div>
            </>
          )}

          {(ansicht === '3' || ansicht === 'woche') && tageAb(ansicht === '3' ? 3 : 7).map((t) => {
            const l = proTag.get(t) ?? []
            const d = new Date(t + 'T12:00:00')
            const titel = t === heuteIso ? 'Heute' : t === morgenIso ? 'Morgen' : d.toLocaleDateString('de-DE', { weekday: 'long' })
            return (
              <div key={t} className="pl-tag">
                <button className="pl-tag-kopf" onClick={() => zeigeTag(t)} aria-label={`${titel} groß ansehen`}>
                  <strong>{titel}</strong>
                  <span>{d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</span>
                  <em>{l.length ? `${l.length} ${l.length === 1 ? 'Post' : 'Posts'}` : 'frei'}</em>
                  <ChevronRight className="n-chevron" />
                </button>
                {l.length > 0 && <div className="n-gruppe">{l.map((v) => zeile(v))}</div>}
              </div>
            )
          })}

          {ansicht === 'monat' && (() => {
            const wochen = monatsKalender(monatKey, videos as never[], [])
            const kurz = (n?: string | null) => (n ?? '?').split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
            return (
              <>
                <div className="pl-tagkopf">
                  <button className="pl-pfeil" onClick={() => setMonatKey(monatPlus(monatKey, -1))} disabled={monatKey <= heuteIso.slice(0, 7)} aria-label="Vorheriger Monat"><ChevronLeft /></button>
                  <div className="pl-tagtitel"><strong>{monatName(monatKey)}</strong><span>Tag antippen zum Vergrößern</span></div>
                  <button className="pl-pfeil" onClick={() => setMonatKey(monatPlus(monatKey, 1))} aria-label="Nächster Monat"><ChevronRight /></button>
                </div>
                <div className="m-kal">
                  {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => <span key={w} className="m-kal-kopf">{w}</span>)}
                  {wochen.flat().map((tag) => {
                    const vorbei = tag.datum < heuteIso
                    const l = proTag.get(tag.datum) ?? []
                    return (
                      <button key={tag.datum} disabled={vorbei} onClick={() => zeigeTag(tag.datum)}
                        className={`m-kal-tag ${tag.imMonat && !vorbei ? '' : 'aussen'} ${tag.datum === heuteIso ? 'heute' : ''}`}>
                        <span className="m-kal-zahl">{Number(tag.datum.slice(8))}</span>
                        <span className="m-kal-inhalt">
                          {l.slice(0, 3).map((v) => {
                            const a = v.status === 'posted' ? 'gepostet' : f(v).ampel === 'rot' ? 'rot' : ''
                            return <i key={v.id} className={a}>{kurz(v.clients?.name)}</i>
                          })}
                          {l.length > 3 && <i className="mehr">+{l.length - 3}</i>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )
          })()}

          {pausiert.length > 0 && (
            <p className="p-fuss">Pausiert und hier ausgeblendet: {pausiert.join(', ')}.</p>
          )}
          {ohneTermin > 0 && (
            <p className="p-fuss">{ohneTermin} {ohneTermin === 1 ? 'Video hat' : 'Videos haben'} noch keinen Posting-Tag.</p>
          )}
          <p className="p-fuss">Die App verfolgt nur noch gepostet oder nicht gepostet. Drehen, Schneiden und Einplanen macht ihr selbst.</p>
        </>
      )}
    </>
  )
}
