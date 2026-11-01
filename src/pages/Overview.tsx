// Heute -- die Startseite. Nur drei Fragen, sonst nichts:
//   1. Ist heute was zu posten (fuer unsere KPI-Kunden)?
//   2. Haben wir heute einen Termin?
//   3. Ist heute eine Aufgabe faellig?
// Wenn ja: steht da, mit einem Knopf. Wenn nein: "Nichts". Fertig.
//
// Fassie (01.11.2026): "Das CRM ist viel zu sehr ausgebaut ... auf der
// Startseite soll wirklich unsere wichtigste Sache zu sehen sein."
//
// KPI-Kunden = Kunden mit Monatsziel (pilot_kunden.ziel > 0), nicht pausiert.
// Verpasste Posts dieser Kunden (Termin war vor heute) stehen mit drin --
// die sind ja auch heute zu posten.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, CalendarDays, CheckCircle2, Check, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import LogoFrame from '../components/LogoFrame'
import { supabase } from '../lib/supabase'
import { useGemerkt, istGemerkt } from '../lib/merken'
import { useToast } from '../context/ToastContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { celebrate } from '../lib/confetti'
import { alsGepostet } from '../lib/videoAktionen'
import { heute as heuteIso } from '../lib/datum'
import { jetztUhrzeit } from '../lib/fristen'
import '../styles/start.css'

interface Post { id: string; title: string | null; scheduled_date: string; scheduled_time: string | null; client_id: string; kunde: string; logo: string | null }
interface Termin { id: string; title: string; starts_at: string | null; client_id: string | null; kunde: string | null }
interface Aufgabe { id: string; title: string; due_date: string; due_time: string | null; kunde: string | null }

function gruss(): string {
  const h = Number(jetztUhrzeit().slice(0, 2))
  if (h < 5) return 'Gute Nacht'
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

/** starts_at ist eine Uhrzeit ("09:00:00"), kein Zeitstempel. */
const uhr = (t: string | null): string | null => (t ? t.slice(0, 5) : null)

const kurz = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null)

export default function Overview() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const [posts, setPosts] = useGemerkt<Post[]>('start.posts', [])
  const [termine, setTermine] = useGemerkt<Termin[]>('start.termine', [])
  const [aufgaben, setAufgaben] = useGemerkt<Aufgabe[]>('start.aufgaben', [])
  const [laedt, setLaedt] = useState(() => !istGemerkt('start.posts'))
  const tag = heuteIso()

  const laden = useCallback(async () => {
    const [k, v, e, a] = await Promise.all([
      supabase.from('pilot_kunden').select('client_id, ziel, pausiert_seit'),
      supabase.from('videos')
        .select('id, title, scheduled_date, scheduled_time, client_id, clients(name, logo_url)')
        .is('deleted_at', null).neq('status', 'posted')
        .not('scheduled_date', 'is', null).lte('scheduled_date', tag)
        .order('scheduled_date').order('scheduled_time', { nullsFirst: false }),
      supabase.from('events')
        .select('id, title, starts_at, client_id, clients(name)')
        .is('deleted_at', null).eq('starts_on', tag).order('starts_at', { nullsFirst: true }),
      supabase.from('tasks')
        .select('id, title, due_date, due_time, clients(name)')
        .eq('done', false).is('deleted_at', null)
        .not('due_date', 'is', null).lte('due_date', tag).order('due_date'),
    ])
    const kpi = new Set(((k.data ?? []) as { client_id: string; ziel: number | null; pausiert_seit: string | null }[])
      .filter((x) => (x.ziel ?? 0) > 0 && !x.pausiert_seit).map((x) => x.client_id))
    type MitKunde = { clients?: { name?: string; logo_url?: string | null } | null }
    setPosts(((v.data ?? []) as unknown as (Omit<Post, 'kunde' | 'logo'> & MitKunde)[])
      .filter((x) => kpi.has(x.client_id))
      .map((x) => ({ id: x.id, title: x.title, scheduled_date: x.scheduled_date, scheduled_time: x.scheduled_time, client_id: x.client_id, kunde: x.clients?.name ?? '', logo: x.clients?.logo_url ?? null }))
      // Verpasste zuerst, dann nach Uhrzeit
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time ?? '99').localeCompare(b.scheduled_time ?? '99')))
    setTermine(((e.data ?? []) as unknown as (Omit<Termin, 'kunde'> & MitKunde)[])
      .map((x) => ({ id: x.id, title: x.title, starts_at: x.starts_at, client_id: x.client_id, kunde: x.clients?.name ?? null })))
    setAufgaben(((a.data ?? []) as unknown as (Omit<Aufgabe, 'kunde'> & MitKunde)[])
      .map((x) => ({ id: x.id, title: x.title, due_date: x.due_date, due_time: x.due_time, kunde: x.clients?.name ?? null })))
    setLaedt(false)
  }, [tag])

  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    const neu = () => laden()
    window.addEventListener('daten-geaendert', neu)
    return () => window.removeEventListener('daten-geaendert', neu)
  }, [laden])

  async function gepostet(p: Post) {
    setPosts((l) => l.filter((x) => x.id !== p.id))
    celebrate()
    const fehler = await alsGepostet({ id: p.id })
    if (fehler) { toast('Konnte nicht speichern: ' + fehler); laden(); return }
    toast('Gepostet')
  }

  async function erledigt(a: Aufgabe) {
    setAufgaben((l) => l.filter((x) => x.id !== a.id))
    const { error } = await supabase.from('tasks').update({ done: true }).eq('id', a.id)
    if (error) { toast('Konnte nicht speichern: ' + error.message); laden(); return }
    toast('Erledigt')
  }

  const name = ((memberId ? byId(memberId)?.name : '') ?? '').trim().split(' ')[0]
  const datum = new Date(tag + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  const anzahl = posts.length + termine.length + aufgaben.length
  const satz = useMemo(() => {
    if (anzahl === 0) return 'Heute ist nichts dran.'
    const teile = [
      posts.length ? `${posts.length} ${posts.length === 1 ? 'Post' : 'Posts'}` : null,
      termine.length ? `${termine.length} ${termine.length === 1 ? 'Termin' : 'Termine'}` : null,
      aufgaben.length ? `${aufgaben.length} ${aufgaben.length === 1 ? 'Aufgabe' : 'Aufgaben'}` : null,
    ].filter(Boolean) as string[]
    return `Heute: ${teile.length > 1 ? teile.slice(0, -1).join(', ') + ' und ' + teile[teile.length - 1] : teile[0]}.`
  }, [anzahl, posts.length, termine.length, aufgaben.length])

  return (
    <div className="st">
      <div className="h-datum">{datum}</div>
      <h1 className="h-gruss">{gruss()}{name ? `, ${name}` : ''}</h1>

      {laedt ? <div className="st-satz leise">Lade …</div> : (
        <>
          <p className={`st-satz ${anzahl === 0 ? 'ruhig' : ''}`}>{satz}</p>

          <Block icon={Send} titel="Posten" leer="Nichts">
            {posts.map((p) => {
              const verpasst = p.scheduled_date < tag
              return (
                <div className="st-zeile" key={p.id}>
                  <button className="st-klick" onClick={() => navigate(`/client/${p.client_id}?video=${p.id}&open=1`)}>
                    <LogoFrame name={p.kunde} logoUrl={p.logo} className="st-logo" />
                    <span className="st-text">
                      <strong>{p.title || 'Video'}</strong>
                      <small>{p.kunde}</small>
                    </span>
                    {verpasst ? <span className="st-zeit rot">verpasst</span> : kurz(p.scheduled_time) && <span className="st-zeit">{kurz(p.scheduled_time)}</span>}
                  </button>
                  <button className="st-tun" onClick={() => gepostet(p)}><Check strokeWidth={2.6} /> Gepostet</button>
                </div>
              )
            })}
          </Block>

          <Block icon={CalendarDays} titel="Termine" leer="Keiner">
            {termine.map((t) => (
              <div className="st-zeile" key={t.id}>
                <button className="st-klick" onClick={() => navigate(t.client_id ? `/client/${t.client_id}` : '/kalender')}>
                  <span className="st-text">
                    <strong>{t.title}</strong>
                    {t.kunde && <small>{t.kunde}</small>}
                  </span>
                  <span className="st-zeit">{uhr(t.starts_at) ?? 'ganztägig'}</span>
                  <ChevronRight className="st-pfeil" />
                </button>
              </div>
            ))}
          </Block>

          <Block icon={CheckCircle2} titel="Aufgaben" leer="Keine">
            {aufgaben.map((a) => (
              <div className="st-zeile" key={a.id}>
                <button className="st-klick" onClick={() => navigate('/aufgaben')}>
                  <span className="st-text">
                    <strong>{a.title}</strong>
                    {a.kunde && <small>{a.kunde}</small>}
                  </span>
                  {a.due_date < tag ? <span className="st-zeit rot">überfällig</span> : kurz(a.due_time) && <span className="st-zeit">{kurz(a.due_time)}</span>}
                </button>
                <button className="st-tun leise" onClick={() => erledigt(a)}><Check strokeWidth={2.6} /> Erledigt</button>
              </div>
            ))}
          </Block>
        </>
      )}
    </div>
  )
}

function Block({ icon: I, titel, leer, children }: { icon: LucideIcon; titel: string; leer: string; children: React.ReactNode[] }) {
  const da = children.length > 0
  return (
    <section className={`st-block ${da ? 'da' : 'leer'}`}>
      <div className="st-kopf">
        <span className="st-ic"><I strokeWidth={2.2} /></span>
        <h2>{titel}</h2>
        {da ? <span className="st-zahl">{children.length}</span> : <span className="st-nichts"><Check strokeWidth={2.6} /> {leer}</span>}
      </div>
      {da && <div className="st-liste">{children}</div>}
    </section>
  )
}
