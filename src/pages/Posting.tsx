// Posting-Bereich: das, was der Kunde von uns sieht.
// ---------------------------------------------------------------------------
// Eine Seite, eine Frage: kommt jedes Video rechtzeitig raus?
//
//   Brennt        Fristen gerissen (ausser heute/morgen -- die stehen unten)
//   Heute         posten, danach beide Links
//   Morgen        letzte Vorarbeit
//   Naechste Wochen  alles bis 4 Wochen voraus, mit Ampel
//
// Die Ampel rechnet rueckwaerts vom Posting-Tag (siehe lib/fristen.ts):
// gedreht 21 Tage vorher, geschnitten 3, eingeplant 1.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { celebrate } from '../lib/confetti'
import { useToast } from '../context/ToastContext'
import PostSchritt, { type TagVideo as BasisVideo } from '../components/PostSchritt'

type TagVideo = BasisVideo & { drehtag?: string | null }
import { heute, datumPlus } from '../lib/datum'
import { fristInfo, nachDringlichkeit, FRISTEN, type FristInfo } from '../lib/fristen'
import { alsGepostet, linkSetzen, vorarbeitSetzen, type LinkFeld, type VorarbeitKey } from '../lib/videoAktionen'

/** Wie weit nach vorn wir schauen. Etwas mehr als die Dreh-Frist. */
const VORAUS_TAGE = 28
/** Wie weit zurueck verpasste, nie gepostete Videos noch auftauchen. */
const RUECKBLICK_TAGE = 14

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
  const heuteIso = heute()
  const morgenIso = datumPlus(heuteIso, 1)

  const laden = useCallback(async () => {
    const von = datumPlus(heute(), -RUECKBLICK_TAGE)
    const bis = datumPlus(heute(), VORAUS_TAGE)
    const [res, offen] = await Promise.all([
      supabase
        .from('videos')
        .select('*, clients(name)')
        .is('deleted_at', null)
        .gte('scheduled_date', von)
        .lte('scheduled_date', bis)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true, nullsFirst: false }),
      supabase
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .is('scheduled_date', null)
        .neq('status', 'posted'),
    ])
    if (res.error) toast('Konnte Videos nicht laden: ' + res.error.message)
    const liste = (res.data ?? []) as unknown as TagVideo[]
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

  // Vergangene, bereits gepostete Videos interessieren hier nicht mehr.
  const relevant = useMemo(
    () => videos.filter((v) => (v.scheduled_date ?? '') >= heuteIso || v.status !== 'posted'),
    [videos, heuteIso],
  )

  const heuteListe = relevant.filter((v) => v.scheduled_date === heuteIso)
  const morgenListe = relevant.filter((v) => v.scheduled_date === morgenIso)
  const rest = relevant.filter((v) => v.scheduled_date !== heuteIso && v.scheduled_date !== morgenIso)
  const brennt = nachDringlichkeit(rest.filter((v) => fristInfo(v, heuteIso).ampel === 'rot'), heuteIso)
  const spaeter = rest.filter((v) => (v.scheduled_date ?? '') > morgenIso && fristInfo(v, heuteIso).ampel !== 'rot')

  const alle = relevant.filter((v) => v.status !== 'posted').map((v) => fristInfo(v, heuteIso))
  const zahl = (a: string) => alle.filter((f) => f.ampel === a).length

  // Nach Posting-Tag gruppieren, damit die naechsten Wochen lesbar bleiben.
  const nachTag = useMemo(() => {
    const m = new Map<string, TagVideo[]>()
    for (const v of spaeter) {
      const k = v.scheduled_date!
      m.set(k, [...(m.get(k) ?? []), v])
    }
    return [...m.entries()]
  }, [spaeter])

  async function posten(v: TagVideo) {
    const jetzt = new Date()
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: 'posted', posted_at: jetzt.toISOString(), link_fetch_state: 'offen' } : x)))
    celebrate()
    await alsGepostet(v.id, jetzt)
    toast('Gepostet — stark! 🎉')
  }

  async function link(v: TagVideo, feld: LinkFeld, url: string) {
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, [feld]: url } : x)))
    const fehler = await linkSetzen(v.id, feld, url)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    toast('Gespeichert ✓')
  }

  async function vorarbeit(v: TagVideo, key: VorarbeitKey, wert: boolean) {
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, [key]: wert } : x)))
    const fehler = await vorarbeitSetzen(v.id, key, wert)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden() }
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
        hinweis={<AmpelChip f={fristInfo(v, heuteIso)} />}
      />
    )
  }

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
          {ohneTermin > 0 && <span><strong>{ohneTermin}</strong> ohne Posting-Tag</span>}
        </div>
      )}

      {brennt.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">🔥 Brennt</h2>
          <div className="jetzt-liste">{brennt.map((v) => karte(v, 'vorher'))}</div>
        </div>
      )}

      <div className="section-block">
        <h2 className="section-title">Heute</h2>
        {heuteListe.length === 0
          ? <div className="col-empty">Heute steht kein Post an.</div>
          : <div className="jetzt-liste">{heuteListe.map((v) => karte(v, 'heute'))}</div>}
      </div>

      <div className="section-block">
        <h2 className="section-title">Morgen</h2>
        {morgenListe.length === 0
          ? <div className="col-empty">Morgen steht kein Post an.</div>
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
    </>
  )
}
