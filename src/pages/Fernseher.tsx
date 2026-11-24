// Fernseher -- die Heute-Seite fuer die Wand (Fassie, 24.11.2026).
// Laeuft 24/7 im Querformat, ohne Menue und ohne Knoepfe: Uhr, Tagesplan,
// was heute zu posten ist, offene Aufgaben und was heute schon erledigt ist.
// Aktualisiert sich selbst (Realtime + alle 2 Minuten), haelt den Bildschirm
// wach und laedt alle 6 Stunden neu, damit neue Versionen ankommen.
// Ab 20 Uhr ohne aktiven Termin zeigt der Tagesplan morgen (wie Heute).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Send, CheckCircle2 } from 'lucide-react'
import Tagesplan from '../components/Tagesplan'
import LogoFrame from '../components/LogoFrame'
import LexwareStand from '../components/LexwareStand'
import { AGENTUR, liegtAn, type Spur } from '../lib/kalender'
import type { CalEventRow } from '../lib/types'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { heute as heuteIso, datumPlus } from '../lib/datum'
import { tagesplanTag, jetztMinuten } from '../lib/tagesplanTag'
import '../styles/kalender.css'
import '../styles/start.css'
import '../styles/fernseher.css'

interface Post { id: string; title: string | null; scheduled_date: string; scheduled_time: string | null; kunde: string; logo: string | null }
interface Aufgabe { id: string; title: string; due_date: string; due_time: string | null; kunde: string | null }
interface Erledigt { key: string; text: string; unter: string | null; wann: string }

const kurz = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null)
type MitKunde = { clients?: { name?: string; logo_url?: string | null } | null }

export default function Fernseher() {
  const { members } = useTeam()
  const personen = useMemo(() => members.map((m) => m.id), [members])
  const spuren: Spur[] = useMemo(() => [...members.map((m) => ({ key: m.id, name: (m.name ?? '').split(' ')[0], farbe: '#1d1d1f' })), { key: AGENTUR, name: 'Agentur', farbe: '#1d1d1f' }], [members])
  const [tag, setTag] = useState(heuteIso())
  const [jetzt, setJetzt] = useState(new Date())
  const [termine, setTermine] = useState<CalEventRow[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [erledigt, setErledigt] = useState<Erledigt[]>([])

  // Uhr jede Sekunde, Tageswechsel um Mitternacht
  useEffect(() => {
    const t = window.setInterval(() => { setJetzt(new Date()); setTag(heuteIso()) }, 1000)
    return () => window.clearInterval(t)
  }, [])

  const laden = useCallback(async () => {
    const morgen = datumPlus(tag, 1)
    const tagStart = new Date(`${tag}T00:00:00`).toISOString()
    const [k, v, e, a, d, g] = await Promise.all([
      supabase.from('pilot_kunden').select('client_id, ziel, pausiert_seit'),
      supabase.from('videos')
        .select('id, title, scheduled_date, scheduled_time, client_id, clients(name, logo_url)')
        .is('deleted_at', null).neq('status', 'posted')
        .not('scheduled_date', 'is', null).lte('scheduled_date', tag)
        .order('scheduled_date').order('scheduled_time', { nullsFirst: false }),
      supabase.from('events')
        .select('id, title, kind, kategorie, client_id, clients(name, brand_color), starts_on, ends_on, starts_at, ends_at, member_ids, notes, deleted_at')
        .is('deleted_at', null).lte('starts_on', morgen).or(`ends_on.gte.${tag},and(ends_on.is.null,starts_on.gte.${tag})`)
        .order('starts_at', { nullsFirst: true }),
      supabase.from('tasks')
        .select('id, title, due_date, due_time, clients(name)')
        .eq('done', false).is('deleted_at', null)
        .not('due_date', 'is', null).lte('due_date', tag).order('due_date'),
      supabase.from('tasks')
        .select('id, title, done_at, clients(name)')
        .eq('done', true).is('deleted_at', null).gte('done_at', tagStart).order('done_at', { ascending: false }),
      supabase.from('videos')
        .select('id, title, posted_at, clients(name)')
        .is('deleted_at', null).eq('status', 'posted').gte('posted_at', tagStart).order('posted_at', { ascending: false }),
    ])
    const kpi = new Set(((k.data ?? []) as { client_id: string; ziel: number | null; pausiert_seit: string | null }[])
      .filter((x) => (x.ziel ?? 0) > 0 && !x.pausiert_seit).map((x) => x.client_id))
    setPosts(((v.data ?? []) as unknown as ({ id: string; title: string | null; scheduled_date: string; scheduled_time: string | null; client_id: string } & MitKunde)[])
      .filter((x) => kpi.has(x.client_id))
      .map((x) => ({ id: x.id, title: x.title, scheduled_date: x.scheduled_date, scheduled_time: x.scheduled_time, kunde: x.clients?.name ?? '', logo: x.clients?.logo_url ?? null })))
    setTermine((e.data ?? []) as unknown as CalEventRow[])
    setAufgaben(((a.data ?? []) as unknown as (Omit<Aufgabe, 'kunde'> & MitKunde)[])
      .map((x) => ({ id: x.id, title: x.title, due_date: x.due_date, due_time: x.due_time, kunde: x.clients?.name ?? null })))
    const uhr = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    setErledigt([
      ...((d.data ?? []) as unknown as ({ id: string; title: string; done_at: string } & MitKunde)[])
        .map((x) => ({ key: 't' + x.id, text: x.title, unter: x.clients?.name ?? null, wann: x.done_at })),
      ...((g.data ?? []) as unknown as ({ id: string; title: string | null; posted_at: string } & MitKunde)[])
        .map((x) => ({ key: 'v' + x.id, text: `Gepostet: ${x.title || 'Video'}`, unter: x.clients?.name ?? null, wann: x.posted_at })),
    ].sort((a, b) => b.wann.localeCompare(a.wann)).map((x) => ({ ...x, wann: uhr(x.wann) })))
  }, [tag])

  // Laden: sofort, bei jeder Aenderung (Realtime) und alle 2 Minuten
  useEffect(() => {
    laden()
    const t = window.setInterval(laden, 2 * 60 * 1000)
    const ch = supabase.channel('fernseher')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => laden())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => laden())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => laden())
      .subscribe()
    return () => { window.clearInterval(t); supabase.removeChannel(ch) }
  }, [laden])

  // Bildschirm wach halten, alle 6 h neu laden (neue Version), Mauszeiger weg
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const wach = async () => {
      try { lock = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* nicht unterstuetzt */ }
    }
    wach()
    const sicht = () => { if (document.visibilityState === 'visible') wach() }
    document.addEventListener('visibilitychange', sicht)
    const neu = window.setTimeout(() => window.location.reload(), 6 * 60 * 60 * 1000)
    document.body.classList.add('tv-modus')
    return () => {
      document.removeEventListener('visibilitychange', sicht)
      window.clearTimeout(neu)
      document.body.classList.remove('tv-modus')
      lock?.release().catch(() => {})
    }
  }, [])

  const planTag = tagesplanTag(termine, tag, jetztMinuten(jetzt))
  const istMorgen = planTag !== tag

  return (
    <div className="tv">
      <header className="tv-kopf">
        <div className="tv-datum">
          {jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <div className="tv-uhr">{jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
      </header>

      <main className="tv-raster">
        <section className="tv-karte tv-plan">
          <h2>{istMorgen ? 'Morgen' : 'Tagesplan'}</h2>
          <Tagesplan
            kompakt tag={planTag} heute={tag} personen={personen} spuren={spuren} sichtbar={[...personen, AGENTUR]}
            termine={termine.filter((x) => liegtAn(x, planTag))}
            onTermin={() => {}} onNeu={() => {}}
          />
        </section>

        <div className="tv-spalte">
          <section className="tv-karte">
            <h2><Send strokeWidth={2.2} /> Heute posten {posts.length > 0 && <span className="tv-zahl">{posts.length}</span>}</h2>
            {posts.length === 0 ? <p className="tv-leer"><Check strokeWidth={2.6} /> Nichts offen</p> : posts.map((p) => {
              const verpasst = p.scheduled_date < tag
              return (
                <div className="tv-zeile" key={p.id}>
                  <LogoFrame name={p.kunde} logoUrl={p.logo} className="st-logo" />
                  <span><strong>{p.title || 'Video'}</strong><small>{verpasst ? <b className="rot">verpasst</b> : kurz(p.scheduled_time)}{(verpasst || kurz(p.scheduled_time)) ? ' · ' : ''}{p.kunde}</small></span>
                </div>
              )
            })}
          </section>

          <section className="tv-karte">
            <h2><CheckCircle2 strokeWidth={2.2} /> Aufgaben {aufgaben.length > 0 && <span className="tv-zahl">{aufgaben.length}</span>}</h2>
            {aufgaben.length === 0 ? <p className="tv-leer"><Check strokeWidth={2.6} /> Keine</p> : aufgaben.map((a) => (
              <div className="tv-zeile" key={a.id}>
                <span><strong>{a.title}</strong><small>{a.due_date < tag ? <b className="rot">überfällig</b> : kurz(a.due_time) ?? 'heute'}{a.kunde ? ` · ${a.kunde}` : ''}</small></span>
              </div>
            ))}
          </section>

          <section className="tv-karte tv-erledigt">
            <h2><Check strokeWidth={2.6} /> Heute erledigt {erledigt.length > 0 && <span className="tv-zahl gruen">{erledigt.length}</span>}</h2>
            {erledigt.length === 0 ? <p className="tv-leer">Noch nichts</p> : erledigt.map((x) => (
              <div className="tv-zeile fertig" key={x.key}>
                <span><strong>{x.text}</strong><small>{x.wann}{x.unter ? ` · ${x.unter}` : ''}</small></span>
              </div>
            ))}
          </section>
        </div>
      </main>

      <footer className="tv-fuss"><LexwareStand style={{ margin: 0 }} /></footer>
    </div>
  )
}
