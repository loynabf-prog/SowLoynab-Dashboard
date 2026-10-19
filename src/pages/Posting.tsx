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
import { Flame, Link2, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { celebrate } from '../lib/confetti'
import { useToast } from '../context/ToastContext'
import { type TagVideo } from '../components/PostSchritt'
import PostZeile from '../components/PostZeile'
import { heute, datumPlus } from '../lib/datum'
import { nachKunde, proKundeSatz } from '../lib/tageslage'
import { fristInfo, nachDringlichkeit, jetztUhrzeit, FRISTEN } from '../lib/fristen'
import { fehlendeLinks, mitKundeLaden, mitPlattformen, postPhase } from '../lib/postschritte'
import {
  alsGepostet, linkSetzen, postenPatch, terminSetzen, vorarbeitSetzen,
  type LinkFeld, type VorarbeitKey,
} from '../lib/videoAktionen'

/** Wie weit nach vorn wir schauen. Etwas mehr als die Dreh-Frist. */
const VORAUS_TAGE = 28
/** Wie weit zurueck verpasste oder unvollstaendige Posts noch auftauchen. */
const RUECKBLICK_TAGE = 60

function wochentag(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function Posting() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [videos, setVideos] = useState<TagVideo[]>([])
  const [ohneTermin, setOhneTermin] = useState(0)
  const [loading, setLoading] = useState(true)
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
    setVideos(liste)
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

  // Streifen: eine Woche zurueck bis vier Wochen voraus.
  const tage = useMemo(() => Array.from({ length: 7 + VORAUS_TAGE + 1 }, (_, i) => datumPlus(heuteIso, i - 7)), [heuteIso])
  const streifen = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = streifen.current?.querySelector('.p-tag.on') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [gewaehlt, loading])

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
        onPosten={() => posten(v)}
        onLink={(feld, url) => link(v, feld, url)}
        onVorarbeit={(key, wert) => vorarbeit(v, key, wert)}
        onTermin={(d) => verschieben(v, d)}
      />
    )
  }

  const { brennt, linksFehlen, proTag, ampelTag, zahl } = einteilung
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
            <div className={zahl('rot') ? 'rot' : 'null'} role="listitem"><strong>{zahl('rot')}</strong><span>brennt</span></div>
            <div className={zahl('gelb') ? 'gelb' : 'null'} role="listitem"><strong>{zahl('gelb')}</strong><span>bald fällig</span></div>
            <div className="gruen" role="listitem"><strong>{zahl('gruen')}</strong><span>im Plan</span></div>
          </div>

          <div className="p-woche" ref={streifen} role="tablist" aria-label="Tage">
            {tage.map((t) => {
              const d = new Date(t + 'T12:00:00')
              const a = ampelTag(t)
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === gewaehlt}
                  className={`p-tag ${t === gewaehlt ? 'on' : ''} ${t === heuteIso ? 'heute' : ''}`}
                  onClick={() => setWahl(t)}
                >
                  <small>{d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</small>
                  <strong>{d.getDate()}</strong>
                  <i className={a ?? ''} />
                </button>
              )
            })}
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

          <div className="n-abschnitt">
            <h2>{tagTitel}</h2>
            {tagListe.length > 0 && <span>{tagListe.length} {tagListe.length === 1 ? 'Post' : 'Posts'}</span>}
          </div>
          <div className="n-gruppe">
            {tagListe.length === 0
              ? <div className="n-leer">An diesem Tag geht nichts raus.</div>
              : tagListe.map((v) => zeile(v))}
          </div>

          {ohneTermin > 0 && (
            <p className="p-fuss">{ohneTermin} {ohneTermin === 1 ? 'Video hat' : 'Videos haben'} noch keinen Posting-Tag.</p>
          )}
          <p className="p-fuss">Vorlauf: gedreht {FRISTEN.dreh} Tage, geschnitten {FRISTEN.schnitt} Tage, eingeplant {FRISTEN.planung} Tag vor dem Posting-Tag.</p>
        </>
      )}
    </>
  )
}
