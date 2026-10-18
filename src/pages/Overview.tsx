// Heute: die eine Seite, die beim Aufmachen sagt, was jetzt dran ist.
// ---------------------------------------------------------------------------
// Drei Blöcke, in genau dieser Reihenfolge — sie beantworten die drei Fragen,
// die man morgens hat:
//
//   Brennt      Was ist schon gerissen? Fristen, Posts, Aufgaben.
//   Heute       Termine, Drehtage, Posts, Fristen, die heute enden.
//   Vorarbeit   Nichts Dringendes — was können wir schon wegarbeiten?
//
// Die Seite entscheidet nichts selbst: die Einstufung kommt aus tageslage.ts,
// die Fristen aus fristen.ts. Hier wird nur gezeigt und weitergeleitet. Wer
// wirklich arbeiten will, landet mit einem Klick in Posting oder Produktion.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { useIdentity } from '../context/IdentityContext'
import { celebrate } from '../lib/confetti'
import { alsGepostet, vorarbeitSetzen, type VorarbeitKey } from '../lib/videoAktionen'
import { useTeam } from '../context/TeamContext'
import { heute as heuteIso } from '../lib/datum'
import { jetztUhrzeit } from '../lib/fristen'
import { tagesLage, lageSatz, type LageAufgabe, type LageTermin, type LageVideo, type Punkt } from '../lib/tageslage'

function gruss(): string {
  const h = Number(jetztUhrzeit().slice(0, 2))
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

const ICON: Record<Punkt['art'], string> = {
  termin: '📍', drehtag: '🎥', posten: '📣',
  dreh: '🎬', schnitt: '✂️', planung: '🗓', aufgabe: '✓',
}

const WOFUER: Record<Punkt['art'], string> = {
  termin: 'Termin', drehtag: 'Drehtag', posten: 'Posten',
  dreh: 'Drehen', schnitt: 'Schneiden', planung: 'Einplanen', aufgabe: 'Aufgabe',
}

export default function Overview() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const [videos, setVideos] = useState<LageVideo[]>([])
  const [termine, setTermine] = useState<LageTermin[]>([])
  const [aufgaben, setAufgaben] = useState<LageAufgabe[]>([])
  const [laedt, setLaedt] = useState(true)

  const tag = heuteIso()

  useEffect(() => {
    async function laden() {
      // Alle offenen Videos, nicht nur die von heute: welche heute Arbeit
      // machen, entscheidet die Frist, nicht der Posting-Tag.
      const [v, e, a] = await Promise.all([
        supabase.from('videos')
          .select('id, title, status, scheduled_date, scheduled_time, prep_shot, prep_edited, prep_scheduled, client_id, shoot_event_id, clients(name)')
          .is('deleted_at', null).neq('status', 'posted').limit(500),
        supabase.from('events')
          .select('id, title, kind, starts_on, starts_at, planned_videos, client_id, clients(name)')
          .is('deleted_at', null).eq('starts_on', tag),
        supabase.from('tasks')
          .select('id, title, due_date, due_time, priority, clients(name), leads(name)')
          .eq('done', false).is('deleted_at', null)
          .not('due_date', 'is', null).lte('due_date', tag),
      ])
      // Haengt ein Video an einem Drehtag, zaehlt dessen Datum: dann ist
      // "noch nicht gedreht" kein Versaeumnis, sondern ein Plan.
      const roh = (v.data ?? []) as unknown as (LageVideo & { shoot_event_id?: string | null })[]
      const drehIds = [...new Set(roh.map((x) => x.shoot_event_id).filter(Boolean))] as string[]
      let drehTage: Record<string, string> = {}
      if (drehIds.length > 0) {
        const { data: d } = await supabase.from('events').select('id, starts_on').in('id', drehIds)
        drehTage = Object.fromEntries(((d ?? []) as { id: string; starts_on: string }[]).map((x) => [x.id, x.starts_on]))
      }
      setVideos(roh.map((x) => ({ ...x, drehtag: x.shoot_event_id ? drehTage[x.shoot_event_id] ?? null : null })))
      setTermine((e.data ?? []) as unknown as LageTermin[])
      setAufgaben((a.data ?? []) as unknown as LageAufgabe[])
      setLaedt(false)
    }
    laden()
  }, [tag])

  // Die beiden Aktionen, die taeglich anfallen, gehen direkt von hier --
  // dafuer soll niemand erst auf eine andere Seite springen muessen.
  async function posten(id: string) {
    const v = videos.find((x) => x.id === id)
    if (!v) return
    celebrate()
    setVideos((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'posted' as const } : x)))
    const fehler = await alsGepostet({ id })
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); setVideos((prev) => prev.map((x) => (x.id === id ? v : x))); return }
    toast('Gepostet — stark! 🎉')
  }

  async function abhaken(id: string, key: VorarbeitKey) {
    const v = videos.find((x) => x.id === id)
    if (!v) return
    const { patch, fehler } = await vorarbeitSetzen({ id, status: v.status }, key, true)
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); return }
    setVideos((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    toast('Abgehakt ✓')
  }

  const lage = useMemo(
    () => tagesLage({ videos, termine, aufgaben }, tag, jetztUhrzeit()),
    [videos, termine, aufgaben, tag],
  )

  const name = ((memberId ? byId(memberId)?.name : '') ?? '').trim().split(' ')[0]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{gruss()}{name ? `, ${name}` : ''}</h1>
          <span className="sub">{laedt ? 'Lade …' : lageSatz(lage)}</span>
        </div>
      </div>

      {laedt ? (
        <div className="heute-leer">Lade …</div>
      ) : (
        <>
          {lage.brennt.length > 0 && (
            <Block
              titel="Brennt"
              ton="rot"
              hinweis="Fristen gerissen — das zuerst."
              punkte={lage.brennt}
              onKlick={(p) => navigate(p.ziel)}
              onPosten={posten}
              onAbhaken={abhaken}
            />
          )}

          {lage.heute.length > 0 && (
            <Block
              titel="Heute"
              ton="normal"
              punkte={lage.heute}
              onKlick={(p) => navigate(p.ziel)}
              onPosten={posten}
              onAbhaken={abhaken}
            />
          )}

          {lage.ruhig && (
            <div className="heute-ruhig">
              <span className="heute-ruhig-ic">✓</span>
              <div>
                <strong>Heute brennt nichts.</strong>
                <span>
                  {lage.vorarbeit.length > 0
                    ? 'Gute Gelegenheit, den nächsten Tagen Arbeit abzunehmen.'
                    : 'Keine offenen Fristen. Genieß den Tag.'}
                </span>
              </div>
            </div>
          )}

          {lage.vorarbeit.length > 0 && (
            <Block
              titel="Vorarbeiten"
              ton="leise"
              hinweis="Noch nicht fällig, aber schon machbar."
              punkte={lage.vorarbeit.slice(0, 8)}
              mehr={lage.vorarbeit.length > 8 ? lage.vorarbeit.length - 8 : 0}
              onMehr={() => navigate('/produktion')}
              onKlick={(p) => navigate(p.ziel)}
              onAbhaken={abhaken}
            />
          )}

          {!lage.ruhig && lage.vorarbeit.length === 0 && lage.heute.length === 0 && lage.brennt.length === 0 && (
            <div className="heute-leer">Nichts offen. 🎉</div>
          )}
        </>
      )}
    </>
  )
}

// Welcher Schritt laesst sich direkt hier abhaken?
const HAKEN: Partial<Record<Punkt['art'], { feld: VorarbeitKey; label: string }>> = {
  dreh: { feld: 'prep_shot', label: '✓ Gedreht' },
  schnitt: { feld: 'prep_edited', label: '✓ Geschnitten' },
  planung: { feld: 'prep_scheduled', label: '✓ Eingeplant' },
}

function Block({
  titel, ton, hinweis, punkte, mehr, onMehr, onKlick, onPosten, onAbhaken,
}: {
  titel: string
  ton: 'rot' | 'normal' | 'leise'
  hinweis?: string
  punkte: Punkt[]
  mehr?: number
  onMehr?: () => void
  onKlick: (p: Punkt) => void
  onPosten?: (id: string) => void
  onAbhaken?: (id: string, key: VorarbeitKey) => void
}) {
  return (
    <section className={`heute-block ${ton}`}>
      <header className="heute-kopf">
        <h2>{titel}</h2>
        <span className="heute-zahl">{punkte.length}</span>
        {hinweis && <span className="heute-hinweis">{hinweis}</span>}
      </header>
      <div className="heute-liste">
        {punkte.map((p) => {
          const haken = HAKEN[p.art]
          return (
            <div key={p.key} className={`heute-zeile ${p.ampel}`}>
              <button className="heute-klick" onClick={() => onKlick(p)}>
                <span className="heute-ic" aria-hidden>{ICON[p.art]}</span>
                <span className="heute-text">
                  <span className="heute-titel">{p.titel}</span>
                  <span className="heute-meta">
                    <span className="heute-art">{WOFUER[p.art]}</span>
                    {p.kunde && <span className="heute-kunde">{p.kunde}</span>}
                    <span className="heute-grund">{p.text}</span>
                  </span>
                </span>
                {p.zeit && <span className="heute-zeit">{p.zeit}</span>}
              </button>
              {p.art === 'posten' && onPosten ? (
                <button className="heute-tun stark" onClick={() => onPosten(p.id)}>✓ Gepostet</button>
              ) : haken && onAbhaken ? (
                <button className="heute-tun" onClick={() => onAbhaken(p.id, haken.feld)}>{haken.label}</button>
              ) : (
                <span className="heute-pfeil" aria-hidden>›</span>
              )}
            </div>
          )
        })}
      </div>
      {!!mehr && mehr > 0 && (
        <button className="heute-mehr" onClick={onMehr}>
          + {mehr} weitere in der Produktion
        </button>
      )}
    </section>
  )
}
