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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import LogoFrame from '../components/LogoFrame'
import Schnellzugriff from '../components/Schnellzugriff'
import FreigabeKarte from '../components/FreigabeKarte'
import {
  Send, Video, Scissors, CalendarClock, CheckCircle2, MapPin, Camera,
  Clock, ArrowUpRight, Flame, Check, ChevronRight, ChevronDown, Coffee, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGemerkt, istGemerkt } from '../lib/merken'
import { ohnePausierte, type MitPause } from '../lib/pause'
import { useToast } from '../context/ToastContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { useAuth } from '../context/AuthContext'
import { celebrate } from '../lib/confetti'
import { alsGepostet, vorarbeitSetzen, type VorarbeitKey } from '../lib/videoAktionen'
import { heute as heuteIso, datumPlus } from '../lib/datum'
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
  const [videos, setVideos] = useGemerkt<MeinVideo[]>('heute.videos', [])
  const [termine, setTermine] = useGemerkt<MeinTermin[]>('heute.termine', [])
  const [aufgaben, setAufgaben] = useGemerkt<MeineAufgabe[]>('heute.aufgaben', [])
  const [erledigtDb, setErledigtDb] = useState(0)
  const [haken, setHaken] = useState(0)
  const [spaeter, setSpaeter] = useState<string[]>([])
  const [alle, setAlle] = useState(false)
  const [laedt, setLaedt] = useState(() => !istGemerkt('heute.videos'))
  // Gebuendelte Zeilen, die aufgeklappt sind
  const [offen, setOffen] = useState<string[]>([])
  // Fuer welche Gruppe gerade ein Drehtag geplant wird
  const [planen, setPlanen] = useState<Punkt | null>(null)
  const { user } = useAuth()

  const tag = heuteIso()

  const laden = useCallback(async () => {
    const beginn = tagesBeginn(tag)
    // Alle offenen Videos, nicht nur die von heute: welche heute Arbeit
    // machen, entscheidet die Frist, nicht der Posting-Tag.
    const [v, e, a, gp, ge] = await Promise.all([
      supabase.from('videos')
        .select('id, title, status, scheduled_date, scheduled_time, prep_shot, prep_edited, prep_scheduled, client_id, shoot_event_id, assignee_ids, clients(name, logo_url, pausiert_seit, client_type)')
        .is('deleted_at', null).neq('status', 'posted').limit(500),
      supabase.from('events')
        .select('id, title, kind, starts_on, starts_at, planned_videos, client_id, member_ids, clients(name, pausiert_seit)')
        .is('deleted_at', null).eq('starts_on', tag),
      supabase.from('tasks')
        .select('id, title, due_date, due_time, priority, assignee_ids, clients(name, pausiert_seit), leads(name)')
        .eq('done', false).is('deleted_at', null)
        .not('due_date', 'is', null).lte('due_date', tag),
      supabase.from('videos').select('id, assignee_ids')
        .is('deleted_at', null).eq('status', 'posted').gte('posted_at', beginn),
      supabase.from('tasks').select('id, assignee_ids')
        .is('deleted_at', null).eq('done', true).gte('updated_at', beginn),
    ])
    // Haengt ein Video an einem Drehtag, zaehlt dessen Datum: dann ist
    // "noch nicht gedreht" kein Versaeumnis, sondern ein Plan.
    // Pausierte Kunden (0045) gehoeren nicht auf Heute -- da warten wir.
    const roh = ohnePausierte((v.data ?? []) as unknown as (MeinVideo & { clients?: MitPause | null })[]) as MeinVideo[]
    const drehIds = [...new Set(roh.map((x) => x.shoot_event_id).filter(Boolean))] as string[]
    let drehTage: Record<string, string> = {}
    if (drehIds.length > 0) {
      const { data: d } = await supabase.from('events').select('id, starts_on').in('id', drehIds)
      drehTage = Object.fromEntries(((d ?? []) as { id: string; starts_on: string }[]).map((x) => [x.id, x.starts_on]))
    }
    setVideos(roh.map((x) => ({ ...x, drehtag: x.shoot_event_id ? drehTage[x.shoot_event_id] ?? null : null })))
    setTermine(ohnePausierte((e.data ?? []) as unknown as (MeinTermin & { clients?: MitPause | null })[]) as MeinTermin[])
    setAufgaben(ohnePausierte((a.data ?? []) as unknown as (MeineAufgabe & { clients?: MitPause | null })[]) as MeineAufgabe[])
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
  function aufklappen(p: Punkt) {
    setOffen((o) => (o.includes(p.key) ? o.filter((k) => k !== p.key) : [...o, p.key]))
  }

  async function drehtagAnlegen(p: Punkt, datum: string) {
    const ohne = (p.gruppe ?? [p]).filter((x) => !x.drehtag)
    const { data, error } = await supabase.from('events').insert({
      title: `Dreh ${p.kunde ?? ''}`.trim(),
      kind: 'dreh',
      starts_on: datum,
      client_id: p.clientId ?? null,
      planned_videos: ohne.length,
      member_ids: [],
      created_by: user?.id ?? null,
    }).select('id').single()
    if (error || !data) { toast('Konnte Drehtag nicht anlegen: ' + (error?.message ?? '')); return }
    const { error: e2 } = await supabase.from('videos')
      .update({ shoot_event_id: (data as { id: string }).id })
      .in('id', ohne.map((x) => x.id))
    if (e2) { toast('Drehtag angelegt, Videos nicht verknüpft: ' + e2.message); laden(); return }
    setPlanen(null)
    toast(`Drehtag am ${new Date(datum + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })} · ${ohne.length} Videos dran`)
    window.dispatchEvent(new Event('daten-geaendert'))
  }

  async function tun(p: Punkt) {
    if (p.gruppe) {
      if (brauchtDrehtag(p)) setPlanen(p)
      else aufklappen(p)
      return
    }
    const was = TUN[p.art]
    if (p.art === 'termin' || p.art === 'drehtag') { navigate(p.ziel); return }

    if (p.art === 'aufgabe') {
      setAufgaben((prev) => prev.filter((x) => x.id !== p.id))
      const { error } = await supabase.from('tasks').update({ done: true }).eq('id', p.id)
      if (error) { toast('Konnte nicht speichern: ' + error.message); laden(); return }
      setErledigtDb((n) => n + 1)
      toast('Erledigt')
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
      toast(`${was.label}`)
    }
  }

  function spaeterMachen(p: Punkt) {
    setSpaeter((s) => [...s.filter((k) => k !== p.key), p.key])
  }

  // --- Darstellung ----------------------------------------------------------
  function zeile(p: Punkt) {
    const auf = offen.includes(p.key)
    return (
      <Fragment key={p.key}>
        <Zeile
          p={p}
          auf={auf}
          onTun={() => tun(p)}
          onOeffnen={() => (p.gruppe ? aufklappen(p) : navigate(p.ziel))}
        />
        {p.gruppe && auf && (
          <div className="n-unterliste">
            {p.gruppe.map((u) => (
              <Zeile key={u.key} p={u} onTun={() => tun(u)} onOeffnen={() => navigate(u.ziel)} />
            ))}
          </div>
        )}
      </Fragment>
    )
  }

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
              <text x="32" y="38" textAnchor="middle">{tagPlan.ruhig && !tagPlan.geschafft ? '' : tagPlan.geschafft}</text>
            </svg>
            <div className="h-ring-text">
              <strong>{satz.oben}</strong>
              <span>{satz.unten}</span>
            </div>
          </div>

          {/* Freigabe, Aufgaben, Medien, Produktion: direkt erreichbar statt tief in "Mehr" */}
          <Schnellzugriff />
          <div id="freigabe" className="h-freigabe"><FreigabeKarte /></div>

          {f ? (
            <Fokus
              p={f}
              auf={offen.includes(f.key)}
              unter={(u) => <Zeile key={u.key} p={u} onTun={() => tun(u)} onOeffnen={() => navigate(u.ziel)} />}
              onAufklappen={() => aufklappen(f)}
              ruhig={tagPlan.ruhig}
              onTun={() => tun(f)}
              onSpaeter={tagPlan.danach.length > 0 ? () => spaeterMachen(f) : undefined}
              onOeffnen={() => (f.gruppe ? aufklappen(f) : navigate(f.ziel))}
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
                {tagPlan.danach.map((p) => zeile(p))}
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
                  {tagPlan.rest.map((p) => zeile(p))}
                </div>
              )}
            </>
          )}
        </>
      )}
      {planen && (
        <DrehtagPlanen
          p={planen}
          heute={tag}
          onAbbrechen={() => setPlanen(null)}
          onAnlegen={(d) => drehtagAnlegen(planen, d)}
        />
      )}
    </>
  )
}

/** Gruppe mit ungedrehten Videos ohne Drehtag: dann ist "Drehtag planen" der Knopf. */
function brauchtDrehtag(p: Punkt): boolean {
  return p.art === 'dreh' && !!p.clientId && (p.gruppe ?? [p]).some((x) => !x.drehtag)
}

/** Vorschlag: spaetestens zur ersten Drehfrist, aber nicht vor morgen. */
function vorschlagDatum(p: Punkt, heute: string): string {
  const morgen = datumPlus(heute, 1)
  const fristen = (p.gruppe ?? [p]).map((x) => x.frist).filter(Boolean) as string[]
  const erste = fristen.sort()[0]
  return erste && erste > morgen ? erste : morgen
}

function DrehtagPlanen({ p, heute, onAbbrechen, onAnlegen }: {
  p: Punkt
  heute: string
  onAbbrechen: () => void
  onAnlegen: (datum: string) => Promise<void>
}) {
  const [datum, setDatum] = useState(() => vorschlagDatum(p, heute))
  const [laeuft, setLaeuft] = useState(false)
  const n = (p.gruppe ?? [p]).filter((x) => !x.drehtag).length
  return (
    <div className="n-sheet-hinter" onClick={onAbbrechen}>
      <div className="n-sheet" role="dialog" aria-label="Drehtag planen" onClick={(e) => e.stopPropagation()}>
        <div className="n-sheet-kopf">
          <strong>Drehtag {p.kunde}</strong>
          <button className="n-sheet-zu" onClick={onAbbrechen} aria-label="Schließen"><X strokeWidth={2.2} /></button>
        </div>
        <p className="n-sheet-text">{n} {n === 1 ? 'Video wird' : 'Videos werden'} an diesen Drehtag gehängt. Danach brennt hier nichts mehr.</p>
        <input className="n-sheet-datum" type="date" value={datum} min={heute} onChange={(e) => setDatum(e.target.value)} />
        <button
          className="n-tun stark n-sheet-los"
          disabled={!datum || laeuft}
          onClick={async () => { setLaeuft(true); await onAnlegen(datum); setLaeuft(false) }}
        >
          {laeuft ? 'Lege an …' : 'Drehtag anlegen'}
        </button>
      </div>
    </div>
  )
}

function Fokus({ p, auf, unter, onAufklappen, ruhig, onTun, onSpaeter, onOeffnen }: {
  p: Punkt
  auf: boolean
  unter: (u: Punkt) => ReactNode
  onAufklappen: () => void
  ruhig: boolean
  onTun: () => void
  onSpaeter?: () => void
  onOeffnen: () => void
}) {
  const was = TUN[p.art]
  const I = SYMBOL[p.art].icon
  const label = p.gruppe ? (brauchtDrehtag(p) ? 'Drehtag planen' : auf ? 'Zuklappen' : 'Videos zeigen') : was.label

  // Wischen wie bei Tinder: nach links = erledigt, nach rechts = spaeter.
  const wisch = useWischen({
    links: p.gruppe ? undefined : onTun,
    rechts: onSpaeter,
  })
  return (
    <section
      className={`h-fokus ${wisch.dx ? 'zieht' : ''}`}
      key={p.key}
      aria-label="Jetzt dran"
      {...wisch.handler}
      style={{ transform: wisch.dx ? `translateX(${wisch.dx}px) rotate(${wisch.dx / 30}deg)` : undefined }}
    >
      {wisch.dx < -30 && !p.gruppe && <span className="h-wisch links" style={{ opacity: Math.min(1, -wisch.dx / 100) }}><Check strokeWidth={3} /> Erledigt</span>}
      {wisch.dx > 30 && onSpaeter && <span className="h-wisch rechts" style={{ opacity: Math.min(1, wisch.dx / 100) }}><Clock strokeWidth={2.6} /> Später</span>}
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
          {p.gruppe ? (brauchtDrehtag(p) ? <Camera strokeWidth={2.4} /> : <ChevronDown strokeWidth={2.4} />)
            : was.haken || p.art === 'posten' || p.art === 'aufgabe' ? <Check strokeWidth={2.6} /> : <ArrowUpRight strokeWidth={2.4} />}
          {label}
        </button>
        {onSpaeter && (
          <button className="h-fokus-neben" onClick={onSpaeter} aria-label="Später" title="Später — die nächste Sache zuerst">
            <Clock strokeWidth={2.2} />
          </button>
        )}
        <button className="h-fokus-neben" onClick={p.gruppe ? onAufklappen : onOeffnen} aria-label={p.gruppe ? 'Videos zeigen' : 'Öffnen'} title={p.gruppe ? 'Videos zeigen' : 'Öffnen'}>
          {p.gruppe ? <ChevronDown strokeWidth={2.2} /> : <ArrowUpRight strokeWidth={2.2} />}
        </button>
      </div>
      {p.gruppe && auf && <div className="n-gruppe h-fokus-liste">{p.gruppe.map(unter)}</div>}
      {(onSpaeter || !p.gruppe) && <div className="h-wisch-hinweis">← erledigt · später →</div>}
    </section>
  )
}

/** Karte seitlich wegwischen. Vertikales Scrollen bleibt frei. */
function useWischen({ links, rechts }: { links?: () => void; rechts?: () => void }) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; aktiv: boolean | null } | null>(null)
  const SCHWELLE = 90
  const ende = () => {
    const d = dx
    start.current = null
    if (d <= -SCHWELLE && links) { setDx(-500); setTimeout(() => { setDx(0); links() }, 160); return }
    if (d >= SCHWELLE && rechts) { setDx(500); setTimeout(() => { setDx(0); rechts() }, 160); return }
    setDx(0)
  }
  return {
    dx,
    handler: {
      onPointerDown: (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button, a, input')) return
        start.current = { x: e.clientX, y: e.clientY, aktiv: null }
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current
        if (!s) return
        const ddx = e.clientX - s.x, ddy = e.clientY - s.y
        if (s.aktiv === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) s.aktiv = Math.abs(ddx) > Math.abs(ddy)
        if (!s.aktiv) return
        // Richtung ohne Aktion nur leicht nachgeben
        const frei = (ddx < 0 && links) || (ddx > 0 && rechts)
        setDx(frei ? ddx : ddx / 5)
      },
      onPointerUp: ende,
      onPointerCancel: () => { start.current = null; setDx(0) },
    },
  }
}

function Zeile({ p, auf, onTun, onOeffnen }: { p: Punkt; auf?: boolean; onTun: () => void; onOeffnen: () => void }) {
  const navigate = useNavigate()
  const s = SYMBOL[p.art]
  const was = p.gruppe
    ? { label: brauchtDrehtag(p) ? 'Drehtag planen' : auf ? 'Zuklappen' : 'Zeigen' }
    : TUN[p.art]
  const nurOeffnen = p.art === 'termin' || p.art === 'drehtag'
  return (
    <div className="n-zeile-wrap" style={{ position: 'relative' }}>
      <div className="n-zeile" role="group">
        {/* Tipp aufs Logo = Kundenakte, Tipp auf den Text = das Ding selbst (Video-Details, Termin ...) */}
        {p.kunde && !p.gruppe ? (
          <button className="z-logo z-logo-knopf" onClick={() => navigate(p.clientId ? `/client/${p.clientId}` : p.ziel)} aria-label={`${p.kunde} öffnen`} title="Kundenakte">
            <LogoFrame name={p.kunde} logoUrl={p.logo ?? null} className="a-logo" />
            <span className={`z-logo-punkt ${p.ampel === 'rot' ? 'rot' : p.ampel === 'gelb' ? 'gelb' : s.farbe}`}><s.icon strokeWidth={2.6} /></span>
          </button>
        ) : <span className={`n-ic ${s.farbe}`}><s.icon strokeWidth={2.2} /></span>}
        <button className="n-zeile-klick" onClick={onOeffnen} aria-label={`${p.titel} öffnen`}>
          <span className="n-text">
            <span className="n-titel">{p.titel}</span>
            {p.kunde && !p.gruppe && <span className="n-unter">{p.kunde}</span>}
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
