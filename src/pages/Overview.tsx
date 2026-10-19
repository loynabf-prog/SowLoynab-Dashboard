// Heute: die eine Seite, die sagt, was JETZT dran ist.
// ---------------------------------------------------------------------------
// Nie eine Wand aus Aufgaben. Oben die eine Sache, die jetzt dran ist, mit
// genau einem Knopf. Darunter drei, die danach kommen. Der Rest liegt hinter
// "Alle anzeigen". Ein Tagesring zaehlt bis zum Tagesziel (hoechstens fuenf
// Sachen) -- damit es immer etwas zu tun gibt, aber nie zu viel.
//
// Jeder sieht seinen Tag: was Lion zugeordnet ist, steht nicht bei Fassie.
// Was niemandem zugeordnet ist, sehen beide (lib/fokus.ts).
//
// Die Einstufung kommt aus tageslage.ts, die Fristen aus fristen.ts.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Video, Scissors, CalendarClock, CheckCircle2, MapPin, Camera,
  Clock, ArrowUpRight, Flame, Check, ChevronRight, Coffee,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { celebrate } from '../lib/confetti'
import { alsGepostet, vorarbeitSetzen, type VorarbeitKey } from '../lib/videoAktionen'
import { heute as heuteIso } from '../lib/datum'
import { jetztUhrzeit } from '../lib/fristen'
import { tagesLage, type LageAufgabe, type LageTermin, type LageVideo, type Punkt } from '../lib/tageslage'
import { gehoertMir, machTag, ringSatz } from '../lib/fokus'

function gruss(): string {
  const h = Number(jetztUhrzeit().slice(0, 2))
  if (h < 5) return 'Gute Nacht'
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

const SYMBOL: Record<Punkt['art'], { icon: LucideIcon; farbe: string }> = {
  posten: { icon: Send, farbe: 'glut' },
  dreh: { icon: Video, farbe: 'lila' },
  schnitt: { icon: Scissors, farbe: 'blau' },
  planung: { icon: CalendarClock, farbe: 'gelb' },
  aufgabe: { icon: CheckCircle2, farbe: 'grau' },
  termin: { icon: MapPin, farbe: 'gruen' },
  drehtag: { icon: Camera, farbe: 'lila' },
}

/** Was der eine Knopf tut -- und wie er heisst. */
const TUN: Record<Punkt['art'], { label: string; haken?: VorarbeitKey }> = {
  posten: { label: 'Gepostet' },
  dreh: { label: 'Gedreht', haken: 'prep_shot' },
  schnitt: { label: 'Geschnitten', haken: 'prep_edited' },
  planung: { label: 'Eingeplant', haken: 'prep_scheduled' },
  aufgabe: { label: 'Erledigt' },
  termin: { label: 'Öffnen' },
  drehtag: { label: 'Öffnen' },
}

type MeinVideo = LageVideo & { assignee_ids?: string[] | null; shoot_event_id?: string | null }
type MeinTermin = LageTermin & { member_ids?: string[] | null }
type MeineAufgabe = LageAufgabe & { assignee_ids?: string[] | null }

// Abgehakte Vorarbeit zaehlt mit zum Tagesziel. Sie steht nirgends mit
// Datum in der Datenbank, also merkt sich das Geraet den Tageszaehler.
function haekchenHeute(tag: string): number {
  try { return Number(localStorage.getItem('sl-haken-' + tag) ?? 0) || 0 } catch { return 0 }
}
function haekchenPlus(tag: string): void {
  try { localStorage.setItem('sl-haken-' + tag, String(haekchenHeute(tag) + 1)) } catch { /* egal */ }
}

/** Mitternacht in Ortszeit als ISO-Zeitpunkt. */
function tagesBeginn(tag: string): string {
  return new Date(tag + 'T00:00:00').toISOString()
}

export default function Overview() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const [videos, setVideos] = useState<MeinVideo[]>([])
  const [termine, setTermine] = useState<MeinTermin[]>([])
  const [aufgaben, setAufgaben] = useState<MeineAufgabe[]>([])
  const [erledigtDb, setErledigtDb] = useState(0)
  const [haken, setHaken] = useState(0)
  const [spaeter, setSpaeter] = useState<string[]>([])
  const [alle, setAlle] = useState(false)
  const [laedt, setLaedt] = useState(true)

  const tag = heuteIso()

  const laden = useCallback(async () => {
    const beginn = tagesBeginn(tag)
    // Alle offenen Videos, nicht nur die von heute: welche heute Arbeit
    // machen, entscheidet die Frist, nicht der Posting-Tag.
    const [v, e, a, gp, ge] = await Promise.all([
      supabase.from('videos')
        .select('id, title, status, scheduled_date, scheduled_time, prep_shot, prep_edited, prep_scheduled, client_id, shoot_event_id, assignee_ids, clients(name)')
        .is('deleted_at', null).neq('status', 'posted').limit(500),
      supabase.from('events')
        .select('id, title, kind, starts_on, starts_at, planned_videos, client_id, member_ids, clients(name)')
        .is('deleted_at', null).eq('starts_on', tag),
      supabase.from('tasks')
        .select('id, title, due_date, due_time, priority, assignee_ids, clients(name), leads(name)')
        .eq('done', false).is('deleted_at', null)
        .not('due_date', 'is', null).lte('due_date', tag),
      supabase.from('videos').select('id, assignee_ids')
        .is('deleted_at', null).eq('status', 'posted').gte('posted_at', beginn),
      supabase.from('tasks').select('id, assignee_ids')
        .is('deleted_at', null).eq('done', true).gte('updated_at', beginn),
    ])
    // Haengt ein Video an einem Drehtag, zaehlt dessen Datum: dann ist
    // "noch nicht gedreht" kein Versaeumnis, sondern ein Plan.
    const roh = (v.data ?? []) as unknown as MeinVideo[]
    const drehIds = [...new Set(roh.map((x) => x.shoot_event_id).filter(Boolean))] as string[]
    let drehTage: Record<string, string> = {}
    if (drehIds.length > 0) {
      const { data: d } = await supabase.from('events').select('id, starts_on').in('id', drehIds)
      drehTage = Object.fromEntries(((d ?? []) as { id: string; starts_on: string }[]).map((x) => [x.id, x.starts_on]))
    }
    setVideos(roh.map((x) => ({ ...x, drehtag: x.shoot_event_id ? drehTage[x.shoot_event_id] ?? null : null })))
    setTermine((e.data ?? []) as unknown as MeinTermin[])
    setAufgaben((a.data ?? []) as unknown as MeineAufgabe[])
    const mein = (r: { assignee_ids?: string[] | null }) => gehoertMir(r.assignee_ids, memberId)
    setErledigtDb(((gp.data ?? []) as { assignee_ids?: string[] | null }[]).filter(mein).length
      + ((ge.data ?? []) as { assignee_ids?: string[] | null }[]).filter(mein).length)
    setHaken(haekchenHeute(tag))
    setLaedt(false)
  }, [tag, memberId])

  useEffect(() => { laden() }, [laden])
  // Der Assistent oder ein anderes Fenster hat etwas geaendert.
  useEffect(() => {
    const neu = () => laden()
    window.addEventListener('daten-geaendert', neu)
    return () => window.removeEventListener('daten-geaendert', neu)
  }, [laden])

  // Nur, was mir gehoert.
  const lage = useMemo(() => tagesLage({
    videos: videos.filter((x) => gehoertMir(x.assignee_ids, memberId)),
    termine: termine.filter((x) => gehoertMir(x.member_ids, memberId)),
    aufgaben: aufgaben.filter((x) => gehoertMir(x.assignee_ids, memberId)),
  }, tag, jetztUhrzeit()), [videos, termine, aufgaben, tag, memberId])

  const geschafft = erledigtDb + haken
  const tagPlan = useMemo(() => machTag(lage, spaeter, geschafft), [lage, spaeter, geschafft])
  const satz = ringSatz(tagPlan)

  // --- Aktionen -------------------------------------------------------------
  async function tun(p: Punkt) {
    const was = TUN[p.art]
    if (p.art === 'termin' || p.art === 'drehtag') { navigate(p.ziel); return }

    if (p.art === 'aufgabe') {
      setAufgaben((prev) => prev.filter((x) => x.id !== p.id))
      const { error } = await supabase.from('tasks').update({ done: true }).eq('id', p.id)
      if (error) { toast('Konnte nicht speichern: ' + error.message); laden(); return }
      setErledigtDb((n) => n + 1)
      toast('Erledigt ✓')
      return
    }

    const v = videos.find((x) => x.id === p.id)
    if (!v) return
    if (p.art === 'posten') {
      celebrate()
      setVideos((prev) => prev.filter((x) => x.id !== p.id))
      const fehler = await alsGepostet({ id: p.id })
      if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
      setErledigtDb((n) => n + 1)
      toast('Gepostet — stark!')
      return
    }

    if (was.haken) {
      const { patch, fehler } = await vorarbeitSetzen({ id: p.id, status: v.status }, was.haken, true)
      if (fehler) { toast('Konnte nicht speichern: ' + fehler); return }
      setVideos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
      haekchenPlus(tag)
      setHaken((n) => n + 1)
      toast(`${was.label} ✓`)
    }
  }

  function spaeterMachen(p: Punkt) {
    setSpaeter((s) => [...s.filter((k) => k !== p.key), p.key])
  }

  // --- Darstellung ----------------------------------------------------------
  const name = ((memberId ? byId(memberId)?.name : '') ?? '').trim().split(' ')[0]
  const datum = new Date(tag + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  const anteil = Math.min(1, tagPlan.geschafft / tagPlan.ziel)
  const UMFANG = 2 * Math.PI * 27
  const f = tagPlan.fokus

  return (
    <>
      <div className="h-datum">{datum}</div>
      <h1 className="h-gruss">{gruss()}{name ? `, ${name}` : ''}</h1>

      {laedt ? (
        <div className="n-leer">Lade …</div>
      ) : (
        <>
          <div className="h-ring-zeile">
            <svg className="h-ring" viewBox="0 0 64 64" role="img" aria-label={satz.oben}>
              <circle className="spur" cx="32" cy="32" r="27" />
              <circle
                className="wert" cx="32" cy="32" r="27"
                strokeDasharray={UMFANG}
                strokeDashoffset={UMFANG * (1 - anteil)}
                transform="rotate(-90 32 32)"
              />
              <text x="32" y="38" textAnchor="middle">{tagPlan.ruhig && !tagPlan.geschafft ? '✓' : tagPlan.geschafft}</text>
            </svg>
            <div className="h-ring-text">
              <strong>{satz.oben}</strong>
              <span>{satz.unten}</span>
            </div>
          </div>

          {f ? (
            <Fokus
              p={f}
              ruhig={tagPlan.ruhig}
              onTun={() => tun(f)}
              onSpaeter={tagPlan.danach.length > 0 ? () => spaeterMachen(f) : undefined}
              onOeffnen={() => navigate(f.ziel)}
            />
          ) : (
            <div className="h-ruhig">
              <span className="n-ic gruen"><Coffee strokeWidth={2.2} /></span>
              <strong>Alles erledigt</strong>
              <span>Nichts offen, nichts vorzuziehen. Genieß den Tag.</span>
            </div>
          )}

          {tagPlan.danach.length > 0 && (
            <>
              <div className="n-abschnitt"><h2>Danach</h2></div>
              <div className="n-gruppe">
                {tagPlan.danach.map((p) => <Zeile key={p.key} p={p} onTun={() => tun(p)} onOeffnen={() => navigate(p.ziel)} />)}
              </div>
            </>
          )}

          {tagPlan.rest.length > 0 && (
            <>
              <div className="n-abschnitt">
                <h2>{tagPlan.ruhig ? 'Weitere Vorarbeit' : 'Auch noch offen'}</h2>
                <span>{tagPlan.rest.length}</span>
                <button className="n-mehr-link" onClick={() => setAlle((a) => !a)}>{alle ? 'Weniger' : 'Alle anzeigen'}</button>
              </div>
              {alle && (
                <div className="n-gruppe">
                  {tagPlan.rest.map((p) => <Zeile key={p.key} p={p} onTun={() => tun(p)} onOeffnen={() => navigate(p.ziel)} />)}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

function Fokus({ p, ruhig, onTun, onSpaeter, onOeffnen }: {
  p: Punkt
  ruhig: boolean
  onTun: () => void
  onSpaeter?: () => void
  onOeffnen: () => void
}) {
  const was = TUN[p.art]
  const I = SYMBOL[p.art].icon
  return (
    <section className="h-fokus" key={p.key} aria-label="Jetzt dran">
      <div className="h-fokus-oben">
        <span className="h-fokus-marke">
          {p.ampel === 'rot' ? <Flame strokeWidth={2.4} /> : <I strokeWidth={2.4} />}
          {ruhig ? 'Kannst du schon machen' : 'Jetzt dran'}
        </span>
        <span className={`h-fokus-grund ${p.ampel === 'rot' ? 'rot' : ''}`}>{p.zeit ? `${p.zeit} · ` : ''}{p.text}</span>
      </div>
      <h2>{p.titel}</h2>
      <div className="h-fokus-wer">{p.kunde ?? ' '}</div>
      <div className="h-fokus-knoepfe">
        <button className="h-fokus-haupt" onClick={onTun}>
          {was.haken || p.art === 'posten' || p.art === 'aufgabe' ? <Check strokeWidth={2.6} /> : <ArrowUpRight strokeWidth={2.4} />}
          {was.label}
        </button>
        {onSpaeter && (
          <button className="h-fokus-neben" onClick={onSpaeter} aria-label="Später" title="Später — die nächste Sache zuerst">
            <Clock strokeWidth={2.2} />
          </button>
        )}
        <button className="h-fokus-neben" onClick={onOeffnen} aria-label="Öffnen" title="Öffnen">
          <ArrowUpRight strokeWidth={2.2} />
        </button>
      </div>
    </section>
  )
}

function Zeile({ p, onTun, onOeffnen }: { p: Punkt; onTun: () => void; onOeffnen: () => void }) {
  const s = SYMBOL[p.art]
  const was = TUN[p.art]
  const nurOeffnen = p.art === 'termin' || p.art === 'drehtag'
  return (
    <div className="n-zeile-wrap" style={{ position: 'relative' }}>
      <div className="n-zeile" role="group">
        <button className="n-zeile-klick" onClick={onOeffnen} aria-label={`${p.titel} öffnen`}>
          <span className={`n-ic ${s.farbe}`}><s.icon strokeWidth={2.2} /></span>
          <span className="n-text">
            <span className="n-titel">{p.titel}</span>
            {p.kunde && <span className="n-unter">{p.kunde}</span>}
            <span className={`n-grund ${p.ampel === 'rot' ? 'rot' : p.ampel === 'gelb' ? 'gelb' : ''}`}>{p.text}</span>
          </span>
          {p.zeit && <span className="n-zeit">{p.zeit}</span>}
        </button>
        {nurOeffnen
          ? <ChevronRight className="n-chevron" />
          : <button className="n-tun" onClick={onTun}>{was.label}</button>}
      </div>
    </div>
  )
}
