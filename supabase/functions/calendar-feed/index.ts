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

// ---------------------------------------------------------------------------
// iCalendar (.ics) bauen — das Format, das iPhone, Google und Outlook lesen.
//
// Bewusst von Hand statt mit einer Bibliothek: wir schreiben nur konkrete
// Termine raus, keine Wiederholungsregeln. Das ist wenig Format und viel
// Kleinkram — und genau der Kleinkram (Zeilenumbrüche, Sonderzeichen,
// Zeilenlänge) ist das, woran fremde Kalender sonst ersticken.
//
// Steht bewusst HIER und nicht in einer zweiten Datei: so lässt sich die
// Funktion im Supabase-Dashboard mit einem einzigen Einfügen anlegen, ohne
// Terminal. Die Tests greifen direkt auf diese Datei zu.
// ---------------------------------------------------------------------------

export interface IcsTermin {
  /** Eindeutig und stabil -- sonst legt der Kalender bei jedem Abruf alles neu an. */
  uid: string
  titel: string
  /** "2026-10-14" */
  start: string
  /** Bei ganztaegig das Ende EXKLUSIV, also der Folgetag. Leer = ein Tag. */
  ende?: string | null
  /** "14:30" -- fehlt sie, ist der Termin ganztaegig. */
  startZeit?: string | null
  endZeit?: string | null
  ort?: string | null
  beschreibung?: string | null
}

/**
 * Sonderzeichen entschaerfen. Backslash zuerst, sonst wuerde er die
 * Maskierung der spaeter eingefuegten Zeichen wieder zerlegen.
 */
export function escape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Zeilen auf 75 Zeichen umbrechen, Fortsetzung mit einem Leerzeichen.
 * Steht so in der Norm; manche Kalender verschlucken sonst lange Titel.
 */
export function falte(zeile: string): string {
  if (zeile.length <= 75) return zeile
  const teile: string[] = [zeile.slice(0, 75)]
  let rest = zeile.slice(75)
  while (rest.length > 74) {
    teile.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest.length) teile.push(' ' + rest)
  return teile.join('\r\n')
}

/** "2026-10-14" -> "20261014" */
export function datumKompakt(d: string): string {
  return d.replace(/-/g, '')
}

/** "2026-10-14" + "14:30" -> "20261014T143000" (lokale Zeit, ohne Zone) */
export function zeitKompakt(d: string, t: string): string {
  const [h, m] = t.split(':')
  return `${datumKompakt(d)}T${(h ?? '00').padStart(2, '0')}${(m ?? '00').padStart(2, '0')}00`
}

/** Ein Tag weiter -- ganztaegige Termine enden im ICS am FOLGETAG. */
export function tagDanach(d: string): string {
  const dt = new Date(d + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

function zeilen(t: IcsTermin, stempel: string, domain: string): string[] {
  const out = ['BEGIN:VEVENT', `UID:${t.uid}@${domain}`, `DTSTAMP:${stempel}`]

  if (t.startZeit) {
    out.push(`DTSTART;TZID=Europe/Berlin:${zeitKompakt(t.start, t.startZeit)}`)
    // Ohne Endzeit eine Stunde annehmen -- ein Termin ohne Dauer wird von
    // manchen Kalendern gar nicht erst angezeigt.
    const endeTag = t.ende || t.start
    const endeZeit = t.endZeit || plusStunde(t.startZeit)
    out.push(`DTEND;TZID=Europe/Berlin:${zeitKompakt(endeTag, endeZeit)}`)
  } else {
    out.push(`DTSTART;VALUE=DATE:${datumKompakt(t.start)}`)
    out.push(`DTEND;VALUE=DATE:${datumKompakt(tagDanach(t.ende || t.start))}`)
  }

  out.push(`SUMMARY:${escape(t.titel)}`)
  if (t.ort) out.push(`LOCATION:${escape(t.ort)}`)
  if (t.beschreibung) out.push(`DESCRIPTION:${escape(t.beschreibung)}`)
  out.push('END:VEVENT')
  return out
}

function plusStunde(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(23, (h ?? 0) + 1)).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`
}

/**
 * Den fertigen Kalender bauen.
 *
 * `name` steht im iPhone als Kalendername. REFRESH-INTERVAL ist ein Wunsch,
 * kein Befehl -- iOS holt in eigenem Takt ab, meist alle paar Stunden.
 */
export function baueIcs(opts: {
  name: string
  termine: IcsTermin[]
  domain?: string
  stempel?: string
}): string {
  const domain = opts.domain ?? 'sowloynab.de'
  const stempel = opts.stempel ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const kopf = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sow & Loynab//Dashboard//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(opts.name)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
    'X-PUBLISHED-TTL:PT2H',
  ]

  const koerper = opts.termine.flatMap((t) => zeilen(t, stempel, domain))
  return [...kopf, ...koerper, 'END:VCALENDAR'].map(falte).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Die Funktion selbst
// ---------------------------------------------------------------------------

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

const bedienen = async (req: Request): Promise<Response> => {
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
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } })
}

// Nur starten, wenn wir wirklich in Deno laufen. Die Tests laden dieselbe
// Datei, um den ICS-Bauer zu pruefen -- dort gibt es kein Deno.
if (typeof Deno !== 'undefined') Deno.serve(bedienen)
