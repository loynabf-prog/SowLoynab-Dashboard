// Posting-Bereich: das, was der Kunde von uns sieht.
// ---------------------------------------------------------------------------
// Eine Seite, eine Frage: kommt jedes Video rechtzeitig raus?
//
//   Brennt           Fristen gerissen oder Posting verpasst (ausser heute/
//                    morgen -- die stehen darunter)
//   Heute            posten, danach die Links
//   Morgen           letzte Vorarbeit
//   Naechste Wochen  alles bis 4 Wochen voraus, mit Ampel
//   Links fehlen     gepostet, aber ohne Link -- ohne Link keine Zahlen
//
// Die Ampel rechnet rueckwaerts vom Posting-Tag (siehe lib/fristen.ts):
// gedreht 21 Tage vorher, geschnitten 3, eingeplant 1. Heute nach der
// geplanten Uhrzeit wird ein offener Post rot.
//
// Live: aendert Lion auf seinem Handy etwas, sieht man es hier sofort.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { celebrate } from '../lib/confetti'
import { useToast } from '../context/ToastContext'
import PostSchritt, { type TagVideo } from '../components/PostSchritt'
import { heute, datumPlus } from '../lib/datum'
import { fristInfo, nachDringlichkeit, jetztUhrzeit, FRISTEN, type FristInfo } from '../lib/fristen'
import { fehlendeLinks, mitKundeLaden, mitPlattformen, postPhase } from '../lib/postschritte'
import {
  alsGepostet, linkSetzen, postenPatch, terminSetzen, vorarbeitSetzen,
  type LinkFeld, type VorarbeitKey,
} from '../lib/videoAktionen'

/** Wie weit nach vorn wir schauen. Etwas mehr als die Dreh-Frist. */
const VORAUS_TAGE = 28
/** Wie weit zurueck verpasste oder unvollstaendige Posts noch auftauchen. */
const RUECKBLICK_TAGE = 60

function AmpelChip({ f }: { f: FristInfo }) {
  if (f.ampel === 'erledigt' || f.ampel === 'ohne-termin') return null
  return <span className={`ampel ampel-${f.ampel}`}>{f.text}</span>
}

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

  const einteilung = useMemo(() => {
    const vergangen = videos.filter((v) => (v.scheduled_date ?? '') < heuteIso)
    const kommend = videos.filter((v) => (v.scheduled_date ?? '') >= heuteIso)

    const verpasst = vergangen.filter((v) => v.status !== 'posted')
    const linksFehlen = vergangen
      .filter((v) => postPhase(v) === 'gepostet')
      .sort((a, b) => (b.scheduled_date ?? '').localeCompare(a.scheduled_date ?? ''))
      .slice(0, 15)

    const heuteListe = kommend.filter((v) => v.scheduled_date === heuteIso)
    const morgenListe = kommend.filter((v) => v.scheduled_date === morgenIso)
    const spaeter = kommend.filter((v) => (v.scheduled_date ?? '') > morgenIso)
    const spaeterRot = spaeter.filter((v) => v.status !== 'posted' && f(v).ampel === 'rot')
    const spaeterRest = spaeter.filter((v) => !spaeterRot.includes(v))

    const brennt = [
      ...nachDringlichkeit(verpasst, heuteIso, jetzt.zeit),
      ...nachDringlichkeit(spaeterRot, heuteIso, jetzt.zeit),
    ]

    const nachTag = new Map<string, TagVideo[]>()
    for (const v of spaeterRest) nachTag.set(v.scheduled_date!, [...(nachTag.get(v.scheduled_date!) ?? []), v])

    const offen = [...verpasst, ...kommend.filter((v) => v.status !== 'posted')].map(f)
    return {
      brennt, heuteListe, morgenListe, linksFehlen, nachTag: [...nachTag.entries()],
      zahl: (a: string) => offen.filter((x) => x.ampel === a).length,
    }
  }, [videos, heuteIso, morgenIso, jetzt.zeit, f])

  // ---- Aktionen ------------------------------------------------------------
  async function posten(v: TagVideo) {
    const zeit = new Date()
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...(postenPatch({ ...v, posted_at: null }, zeit) as Partial<TagVideo>) } : x)))
    celebrate()
    const fehler = await alsGepostet(v, zeit)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    toast('Gepostet — stark! 🎉')
  }

  async function link(v: TagVideo, feld: LinkFeld, url: string) {
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, [feld]: url } : x)))
    const fehler = await linkSetzen(v.id, feld, url)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    toast(fehlendeLinks({ ...v, [feld]: url }).length === 0 ? 'Alle Links drin — erledigt ✓' : 'Gespeichert ✓')
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
    toast(`Verschoben auf ${wochentag(datum)} ✓`)
  }

  function karte(v: TagVideo, modus: 'heute' | 'vorher') {
    return (
      <PostSchritt
        key={v.id}
        video={v}
        modus={modus}
        zeit={v.scheduled_time ? v.scheduled_time.slice(0, 5) : null}
        onOeffnen={() => navigate(`/client/${v.client_id}`)}
        onPosten={() => posten(v)}
        onLink={(feld, url) => link(v, feld, url)}
        onVorarbeit={(key, wert) => vorarbeit(v, key, wert)}
        onTermin={(d) => verschieben(v, d)}
        hinweis={<AmpelChip f={f(v)} />}
      />
    )
  }

  // Verpasst = Posting-Tag vorbei: hier geht es ums Nachholen (posten oder
  // verschieben), nicht mehr um Vorarbeit.
  const modusFuer = (v: TagVideo): 'heute' | 'vorher' => ((v.scheduled_date ?? '') < heuteIso ? 'heute' : 'vorher')

  const { brennt, heuteListe, morgenListe, linksFehlen, nachTag, zahl } = einteilung

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Posting</h1>
          <span className="sub">
            {loading ? 'Lade …' : `Gedreht ${FRISTEN.dreh} Tage · geschnitten ${FRISTEN.schnitt} Tage · eingeplant ${FRISTEN.planung} Tag vorher`}
          </span>
        </div>
      </div>

      {!loading && (
        <div className="today-strip">
          <span className="hot"><strong>{zahl('rot')}</strong> brennt</span>
          <span className="warn"><strong>{zahl('gelb')}</strong> bald fällig</span>
          <span className="good"><strong>{zahl('gruen')}</strong> im Plan</span>
          {linksFehlen.length > 0 && <span><strong>{linksFehlen.length}</strong> ohne Link</span>}
          {ohneTermin > 0 && <span><strong>{ohneTermin}</strong> ohne Posting-Tag</span>}
        </div>
      )}

      {brennt.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">🔥 Brennt</h2>
          <div className="jetzt-liste">{brennt.map((v) => karte(v, modusFuer(v)))}</div>
        </div>
      )}

      <div className="section-block">
        <h2 className="section-title">Heute</h2>
        {heuteListe.length === 0
          ? <div className="col-empty">{loading ? 'Lade …' : 'Heute steht kein Post an.'}</div>
          : <div className="jetzt-liste">{heuteListe.map((v) => karte(v, 'heute'))}</div>}
      </div>

      <div className="section-block">
        <h2 className="section-title">Morgen</h2>
        {morgenListe.length === 0
          ? <div className="col-empty">{loading ? 'Lade …' : 'Morgen steht kein Post an.'}</div>
          : <div className="jetzt-liste">{morgenListe.map((v) => karte(v, 'vorher'))}</div>}
      </div>

      <div className="section-block">
        <h2 className="section-title">Nächste {Math.round(VORAUS_TAGE / 7)} Wochen</h2>
        {nachTag.length === 0 ? (
          <div className="col-empty">{loading ? 'Lade …' : 'Noch nichts geplant.'}</div>
        ) : (
          nachTag.map(([tag, liste]) => (
            <div key={tag} className="posting-tag">
              <div className="posting-tag-kopf">{wochentag(tag)}</div>
              <div className="jetzt-liste">{liste.map((v) => karte(v, 'vorher'))}</div>
            </div>
          ))
        )}
      </div>

      {linksFehlen.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">🔗 Links fehlen</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Gepostet, aber ohne Link — dafür kommen nie Zahlen.</p>
          <div className="jetzt-liste">{linksFehlen.map((v) => karte(v, 'heute'))}</div>
        </div>
      )}
    </>
  )
}
