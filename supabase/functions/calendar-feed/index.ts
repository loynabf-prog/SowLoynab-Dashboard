// Supabase Edge Function: calendar-feed
// -------------------------------------------------------------------------
// Liefert den Dashboard-Kalender als .ics — das Format, das iPhone, Google
// und Outlook abonnieren können. Damit stehen Posting-Tage, Aufgaben und
// Termine im normalen Handy-Kalender, inklusive dessen Homescreen-Widget.
//
// Aufruf:  …/functions/v1/calendar-feed?token=<Abo-Schlüssel>
//
// Der Schlüssel steht in team_members.calendar_token und ist ein Passwort:
// wer ihn hat, sieht den Dienstplan. Deshalb hängt an ihm auch, WAS man
// sieht — die gemeinsamen Termine plus die eigenen, nicht die privaten des
// anderen.
//
// Beim Deploy: "Enforce JWT" für diese Funktion AUSschalten. Die
// Kalender-App des Telefons kann sich nicht anmelden; der Schlüssel in der
// Adresse ist die Berechtigung.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { baueIcs, type IcsTermin } from '../_shared/ics.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// Wie weit der Kalender reicht. Zurück genug, um nachzusehen, was war;
// vorwärts genug für den geplanten Monat und den danach.
const TAGE_ZURUECK = 60
const TAGE_VORAUS = 120

const iso = (d: Date) => d.toISOString().slice(0, 10)

function verschoben(tage: number): string {
  const d = new Date()
  d.setDate(d.getDate() + tage)
  return iso(d)
}

/**
 * Gilt der Eintrag für dieses Mitglied?
 *
 * Leere Liste heißt "für alle" — das ist der häufigere Fall und soll der
 * sein, für den niemand etwas tun muss.
 */
function fuerMich(ids: unknown, meine: string): boolean {
  if (!Array.isArray(ids) || ids.length === 0) return true
  return ids.includes(meine)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const token = new URL(req.url).searchParams.get('token')
  if (!token) return text('Kein Abo-Schlüssel in der Adresse.', 400)

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: mitglied } = await supa
    .from('team_members')
    .select('id, name')
    .eq('calendar_token', token)
    .maybeSingle()
  // Bewusst dieselbe Antwort wie bei fehlendem Schlüssel: ein falscher
  // Schlüssel soll nicht verraten, dass es den richtigen gibt.
  if (!mitglied) return text('Abo-Schlüssel unbekannt.', 404)

  const von = verschoben(-TAGE_ZURUECK)
  const bis = verschoben(TAGE_VORAUS)

  const [videos, tasks, events] = await Promise.all([
    supa.from('videos')
      .select('id, title, scheduled_date, scheduled_time, assignee_ids, clients(name)')
      .is('deleted_at', null)
      .gte('scheduled_date', von).lte('scheduled_date', bis),
    supa.from('tasks')
      .select('id, title, due_date, due_time, assignee_ids, clients(name)')
      .eq('done', false).is('deleted_at', null)
      .gte('due_date', von).lte('due_date', bis),
    supa.from('events')
      .select('id, title, kind, starts_on, ends_on, starts_at, ends_at, member_ids, notes')
      .is('deleted_at', null)
      .gte('starts_on', von).lte('starts_on', bis),
  ])

  const termine: IcsTermin[] = []

  for (const v of (videos.data ?? []) as any[]) {
    if (!v.scheduled_date || !fuerMich(v.assignee_ids, mitglied.id)) continue
    const kunde = v.clients?.name
    termine.push({
      uid: `video-${v.id}`,
      titel: `🎬 ${v.title}${kunde ? ` — ${kunde}` : ''}`,
      start: v.scheduled_date,
      startZeit: v.scheduled_time ? String(v.scheduled_time).slice(0, 5) : null,
      beschreibung: 'Posting-Tag (Sow & Loynab Dashboard)',
    })
  }

  for (const t of (tasks.data ?? []) as any[]) {
    if (!t.due_date || !fuerMich(t.assignee_ids, mitglied.id)) continue
    const kunde = t.clients?.name
    termine.push({
      uid: `task-${t.id}`,
      titel: `✓ ${t.title}${kunde ? ` — ${kunde}` : ''}`,
      start: t.due_date,
      startZeit: t.due_time ? String(t.due_time).slice(0, 5) : null,
      beschreibung: 'Aufgabe (Sow & Loynab Dashboard)',
    })
  }

  const ICON: Record<string, string> = { arbeit: '💼', spiel: '⚽', termin: '📍' }
  for (const e of (events.data ?? []) as any[]) {
    if (!fuerMich(e.member_ids, mitglied.id)) continue
    termine.push({
      uid: `event-${e.id}`,
      titel: `${ICON[e.kind] ?? '📍'} ${e.title}`,
      start: e.starts_on,
      ende: e.ends_on,
      startZeit: e.starts_at ? String(e.starts_at).slice(0, 5) : null,
      endZeit: e.ends_at ? String(e.ends_at).slice(0, 5) : null,
      beschreibung: e.notes,
    })
  }

  const ics = baueIcs({ name: `Sow & Loynab — ${mitglied.name}`, termine })

  return new Response(ics, {
    headers: {
      ...CORS,
      'content-type': 'text/calendar; charset=utf-8',
      // Die Kalender-App soll jedes Mal frisch holen, nicht aus ihrem
      // Zwischenspeicher antworten.
      'cache-control': 'no-cache, max-age=0',
      'content-disposition': 'inline; filename="sowloynab.ics"',
    },
  })
})

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } })
}
