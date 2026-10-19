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
import { type TagVideo } from '../components/PostSchritt'
import PostZeile from '../components/PostZeile'
import { heute, datumPlus } from '../lib/datum'
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

  const einteilung = useMemo(() => {
    const vergangen = videos.filter((v) => (v.scheduled_date ?? '') < heuteIso)
    const kommend = videos.filter((v) => (v.scheduled_date ?? '') >= heuteIso)

    const verpasst = vergangen.filter((v) => v.status !== 'posted')
    const linksFehlen = vergangen
      .filter((v) => postPhase(v) === 'gepostet')
      .sort((a, b) => (b.scheduled_date ?? '').localeCompare(a.scheduled_date ?? ''))
      .slice(0, 15)

    // Alles Rote steht oben unter "Brennt" -- auch wenn es heute oder morgen
    // dran ist. So zaehlt die Kachel oben genau das, was der Block zeigt.
    const istRot = (v: TagVideo) => v.status !== 'posted' && f(v).ampel === 'rot'
    const kommendRot = kommend.filter(istRot)
    const kommendRest = kommend.filter((v) => !istRot(v))
    const heuteListe = kommendRest.filter((v) => v.scheduled_date === heuteIso)
    const morgenListe = kommendRest.filter((v) => v.scheduled_date === morgenIso)
    const spaeterRest = kommendRest.filter((v) => (v.scheduled_date ?? '') > morgenIso)

    const brennt = [
      ...nachDringlichkeit(verpasst, heuteIso, jetzt.zeit),
      ...nachDringlichkeit(kommendRot, heuteIso, jetzt.zeit),
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

  const { brennt, heuteListe, morgenListe, linksFehlen, nachTag, zahl } = einteilung
  const spaeterAnzahl = nachTag.reduce((n, [, l]) => n + l.length, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Posting</h1>
          <span className="sub">Was rausgeht — und ob es rechtzeitig fertig wird</span>
        </div>
      </div>

      {loading ? (
        <div className="heute-leer">Lade …</div>
      ) : (
        <>
          <div className="pz-zahlen" role="list">
            <div className={`pz-kachel rot ${zahl('rot') ? '' : 'null'}`} role="listitem">
              <strong>{zahl('rot')}</strong><span>brennt</span>
            </div>
            <div className={`pz-kachel gelb ${zahl('gelb') ? '' : 'null'}`} role="listitem">
              <strong>{zahl('gelb')}</strong><span>bald fällig</span>
            </div>
            <div className="pz-kachel gruen" role="listitem">
              <strong>{zahl('gruen')}</strong><span>im Plan</span>
            </div>
          </div>
          <p className="pz-regel">
            Vorlauf vor dem Posting-Tag: gedreht {FRISTEN.dreh} Tage · geschnitten {FRISTEN.schnitt} Tage · eingeplant {FRISTEN.planung} Tag
            {ohneTermin > 0 && <> · <strong>{ohneTermin}</strong> ohne Posting-Tag</>}
          </p>

          {brennt.length > 0 && (
            <Block titel="Brennt" ton="rot" hinweis="Frist gerissen oder Posting verpasst — das zuerst." anzahl={brennt.length}>
              {brennt.map((v) => zeile(v, true))}
            </Block>
          )}

          <Block titel="Heute" ton="normal" anzahl={heuteListe.length}>
            {heuteListe.length === 0
              ? <div className="pz-leer">Heute steht kein Post an.</div>
              : heuteListe.map((v) => zeile(v))}
          </Block>

          <Block titel="Morgen" ton="normal" anzahl={morgenListe.length}>
            {morgenListe.length === 0
              ? <div className="pz-leer">Morgen steht kein Post an.</div>
              : morgenListe.map((v) => zeile(v))}
          </Block>

          <Block titel={`Nächste ${Math.round(VORAUS_TAGE / 7)} Wochen`} ton="normal" anzahl={spaeterAnzahl}>
            {nachTag.length === 0 ? (
              <div className="pz-leer">Noch nichts geplant.</div>
            ) : (
              nachTag.map(([tag, liste]) => (
                <div key={tag} className="pz-tag">
                  <div className="pz-tag-kopf">{wochentag(tag)}</div>
                  {liste.map((v) => zeile(v))}
                </div>
              ))
            )}
          </Block>

          {linksFehlen.length > 0 && (
            <Block titel="Links fehlen" ton="leise" hinweis="Gepostet, aber ohne Link — dafür kommen nie Zahlen." anzahl={linksFehlen.length}>
              {linksFehlen.map((v) => zeile(v, true))}
            </Block>
          )}
        </>
      )}
    </>
  )
}

function Block({ titel, ton, hinweis, anzahl, children }: {
  titel: string
  ton: 'rot' | 'normal' | 'leise'
  hinweis?: string
  anzahl: number
  children: React.ReactNode
}) {
  return (
    <section className={`heute-block ${ton}`}>
      <header className="heute-kopf">
        <h2>{titel}</h2>
        {anzahl > 0 && <span className="heute-zahl">{anzahl}</span>}
        {hinweis && <span className="heute-hinweis">{hinweis}</span>}
      </header>
      <div className="heute-liste">{children}</div>
    </section>
  )
}
