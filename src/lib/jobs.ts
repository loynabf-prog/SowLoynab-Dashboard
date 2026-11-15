// Jobs und Zeiterfassung (0079_zeiterfassung.sql).
// ---------------------------------------------------------------------------
// Fassie (15.11.2026): Jeder Bereich ist ein Job, den spaeter ein Mitarbeiter
// uebernimmt. Bis dahin gehen Fassie und Lion selbst "in die Rolle" -- die
// Zeit laeuft, solange man drin ist. Je Person laeuft hoechstens ein Job;
// ein neuer beendet den alten. Claude-Chats stempeln per SQL:
//   select stempel_start('Fassie', 'schnitt', null, 'chat');
//   select stempel_stop('Fassie', '2 Videos fertig');

import { useEffect, useState } from 'react'
import {
  Scissors, Lightbulb, Video, Send, BarChart3, Handshake, Target, Receipt, Bot, Megaphone, FolderOpen, Compass, Briefcase,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from './supabase'

export interface Job {
  slug: string
  name: string
  rolle: string
  was: string
  farbe: string
  icon: string
  seiten: string[]
  output: string | null
  sort: number
}

export interface Session {
  id: string
  member_id: string
  job: string
  client_id: string | null
  start: string
  ende: string | null
  ergebnis: string | null
  quelle: 'app' | 'chat' | 'nachgetragen'
}

export interface Auswertung {
  job: string
  name: string
  rolle: string
  farbe: string
  icon: string
  minuten: number
  sessions: number
  output_label: string | null
  output_anzahl: number | null
  ergebnisse: string[]
}

const ICONS: Record<string, LucideIcon> = {
  Scissors, Lightbulb, Video, Send, BarChart3, Handshake, Target, Receipt, Bot, Megaphone, FolderOpen, Compass,
}
export function jobIcon(name: string): LucideIcon { return ICONS[name] ?? Briefcase }

/** Minuten einer Session (offene bis jetzt, hoechstens 12 h -- wie in der DB). */
export function sessionMinuten(s: Pick<Session, 'start' | 'ende'>, jetzt = Date.now()): number {
  const a = Date.parse(s.start)
  const b = Math.min(s.ende ? Date.parse(s.ende) : jetzt, a + 12 * 3600_000)
  return Math.max(0, (b - a) / 60000)
}

/** 95 -> "1:35 h", 12 -> "12 min" */
export function dauer(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`
}

/** Laufende Uhr "0:42:07" */
export function uhr(start: string, jetzt = Date.now()): string {
  const s = Math.max(0, Math.floor((jetzt - Date.parse(start)) / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sek).padStart(2, '0')}`
}

export function useJobs(): Job[] {
  const [jobs, setJobs] = useState<Job[]>([])
  useEffect(() => {
    supabase.from('jobs').select('*').eq('aktiv', true).order('sort').then(({ data }) => setJobs((data ?? []) as Job[]))
  }, [])
  return jobs
}

/** Laufende Session dieser Person, live (auch wenn ein Claude-Chat stempelt). */
export function useLaufend(memberId: string | null): { laufend: Session | null; neuLaden: () => void } {
  const [laufend, setLaufend] = useState<Session | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!memberId) { setLaufend(null); return }
    let weg = false
    supabase.from('zeit_sessions').select('*').eq('member_id', memberId).is('ende', null).maybeSingle()
      .then(({ data }) => { if (!weg) setLaufend((data as Session) ?? null) })
    // Eindeutiger Kanalname je Hook-Instanz: Stempeluhr (Kopf) und
    // "Braucht dich" (Heute) hoeren gleichzeitig mit. Gleiche Namen liefern in
    // supabase-js denselben, schon abonnierten Kanal -> .on() wirft und die
    // ganze App stuerzte ab (15.11.2026, Heute lud nicht mehr).
    let ch: ReturnType<typeof supabase.channel> | null = null
    try {
      ch = supabase.channel(`stempel-${memberId}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'zeit_sessions' }, () => setN((x) => x + 1))
        .subscribe()
    } catch { /* ohne Live-Update weiter */ }
    return () => { weg = true; if (ch) supabase.removeChannel(ch) }
  }, [memberId, n])
  return { laufend, neuLaden: () => setN((x) => x + 1) }
}

export async function stempelStart(memberId: string, job: string, clientId: string | null = null) {
  const { error } = await supabase.rpc('stempel_start', { person: memberId, job_slug: job, kunde: clientId, quelle_: 'app' })
  if (error) throw error
}

export async function stempelStop(memberId: string, ergebnis: string | null) {
  const { error } = await supabase.rpc('stempel_stop', { person: memberId, ergebnis_: ergebnis })
  if (error) throw error
}

/** Berliner Datum (YYYY-MM-DD) */
export function berlinTag(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d)
}
