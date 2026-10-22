// Supabase Edge Function: chat-claude
// -------------------------------------------------------------------------
// Claude als Teilnehmer im Team-Chat. Wird gerufen, wenn jemand "@claude"
// schreibt, "/claude" benutzt oder im eigenen Claude-Chat etwas sagt.
//
// Was Claude sieht: die letzten Nachrichten des Kanals, das Team, die Kunden,
// offene Aufgaben, die anstehenden Posts der naechsten Wochen und Drehtage.
//
// Was Claude darf: antworten. Und Aenderungen VORSCHLAGEN -- mit denselben
// Werkzeugen wie der Assistent. Der Vorschlag landet als Plan-Karte im Chat,
// ausgefuehrt wird erst, wenn jemand in der App auf "Ausfuehren" tippt.
// Diese Funktion schreibt nur eins: Claudes eigene Chat-Nachricht.
//
// Secrets: ANTHROPIC_API_KEY (wie beim Assistenten), optional CHAT_MODEL.
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY sind automatisch da.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { WERKZEUGE } from '../_shared/werkzeuge.ts'
import { planeMitWerkzeugen } from '../_shared/planen.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODELL = Deno.env.get('CHAT_MODEL') || 'claude-sonnet-5'

function plusTage(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = Deno.env.get('SUPABASE_URL')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supa = createClient(url, service)

  let kanalId = ''
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt (Supabase Secret fehlt).' }, 500)

    const body = await req.json().catch(() => ({}))
    kanalId = String(body?.channel_id ?? '')
    const memberId = body?.member_id ? String(body.member_id) : null
    const heute = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.heute)) ? String(body.heute) : new Date().toISOString().slice(0, 10)
    if (!kanalId) return json({ error: 'channel_id fehlt.' }, 400)

    const bis = plusTage(heute, 28)
    const [kanalR, verlaufR, teamR, kundenR, aufgabenR, videosR, termineR] = await Promise.all([
      supa.from('chat_channels').select('*').eq('id', kanalId).single(),
      supa.from('chat_messages').select('author_id, author_kind, body, plan, plan_status, created_at')
        .eq('channel_id', kanalId).is('deleted_at', null).order('created_at', { ascending: false }).limit(30),
      supa.from('team_members').select('id, name, active'),
      supa.from('clients').select('id, name, monthly_quota, monthly_fee, client_type, active')
        .is('deleted_at', null).order('name'),
      supa.from('tasks').select('title, due_date, due_time, assignee_ids, client_id, priority')
        .eq('done', false).is('deleted_at', null).order('due_date', { ascending: true, nullsFirst: false }).limit(80),
      supa.from('videos').select('client_id, title, status, scheduled_date, prep_shot, prep_edited, prep_scheduled')
        .is('deleted_at', null).neq('status', 'posted').gte('scheduled_date', plusTage(heute, -14)).lte('scheduled_date', bis)
        .order('scheduled_date').limit(200),
      supa.from('events').select('title, kind, starts_on, starts_at, client_id, planned_videos')
        .is('deleted_at', null).gte('starts_on', heute).lte('starts_on', bis).order('starts_on').limit(40),
    ])
    if (kanalR.error || !kanalR.data) return json({ error: 'Kanal nicht gefunden.' }, 404)

    const team = (teamR.data ?? []) as { id: string; name: string; active: boolean | null }[]
    const name = (id: string | null) => team.find((t) => t.id === id)?.name ?? 'Jemand'
    const kunden = (kundenR.data ?? []) as { id: string; name: string; monthly_quota: number | null; monthly_fee: number | null; client_type: string | null; active: boolean | null }[]
    const kunde = (id: string | null) => kunden.find((k) => k.id === id)?.name ?? ''
    const fragender = memberId ? name(memberId) : 'Jemand'

    const zeilen = {
      team: team.filter((t) => t.active !== false).map((t) => `- ${t.name} (id: ${t.id})`).join('\n') || '(niemand)',
      kunden: kunden.map((k) => `- ${k.name} (id: ${k.id}${k.active === false ? ', inaktiv' : ''}${k.client_type && k.client_type !== 'zahlend' ? `, ${k.client_type}` : ''}${k.monthly_quota ? `, ${k.monthly_quota} Videos/Monat` : ''})`).join('\n') || '(keine)',
      aufgaben: ((aufgabenR.data ?? []) as any[]).map((a) =>
        `- ${a.title}${a.due_date ? ` · fällig ${a.due_date}${a.due_time ? ' ' + String(a.due_time).slice(0, 5) : ''}` : ''}`
        + ` · für ${(a.assignee_ids ?? []).length ? (a.assignee_ids as string[]).map(name).join(', ') : 'alle'}`
        + `${a.client_id ? ` · ${kunde(a.client_id)}` : ''}${a.priority === 3 ? ' · DRINGEND' : a.priority === 2 ? ' · wichtig' : ''}`).join('\n') || '(keine offenen)',
      videos: ((videosR.data ?? []) as any[]).map((v) =>
        `- ${v.scheduled_date} · ${kunde(v.client_id)} · ${v.title} · Vorarbeit: ${[v.prep_shot && 'gedreht', v.prep_edited && 'geschnitten', v.prep_scheduled && 'eingeplant'].filter(Boolean).join(', ') || '–'}`).join('\n') || '(keine)',
      termine: ((termineR.data ?? []) as any[]).map((e) =>
        `- ${e.starts_on}${e.starts_at ? ' ' + String(e.starts_at).slice(0, 5) : ''} · ${e.kind === 'dreh' ? 'Drehtag' : e.kind ?? 'Termin'} · ${e.title}${e.client_id ? ` · ${kunde(e.client_id)}` : ''}${e.planned_videos ? ` · ${e.planned_videos} Videos` : ''}`).join('\n') || '(keine)',
    }

    const system = [
      'Du bist Claude, Mitglied im Team-Chat der Social-Media-Agentur Sow & Loynab Media (Münster, Kurzvideos vor allem für Gastronomie).',
      `Heute ist ${heute}. Es schreibt dir gerade ${fragender}. Rechne relative Angaben ("Freitag", "nächste Woche") in echte Daten um.`,
      '',
      'Du antwortest wie ein Kollege im Chat: Deutsch, locker, kurz und konkret. Keine Überschriften, keine langen Einleitungen.',
      'Kurze Listen mit "-" sind okay, wenn es mehrere Punkte sind. **Fett** sparsam für Kunden oder Überschriften-Zeilen. Duzen.',
      '',
      'Wenn jemand will, dass etwas angelegt oder geändert wird (Aufgabe, Kunde, Video, Lead, Idee, Termin …), nutze die Werkzeuge.',
      'Die App zeigt deinen Vorschlag dann als Karte mit "Ausführen" – erst danach passiert etwas. Sag in einem Satz dazu, was du vorbereitet hast.',
      'Aufgaben für eine Person: aufgabe_anlegen mit wer = [ihre id]. "für mich" heißt: für die Person, die gerade schreibt.',
      'Wenn nur gefragt wird, antworte aus den Daten unten – ohne Werkzeuge.',
      'Erfinde nichts. Wenn die Daten etwas nicht hergeben, sag das ehrlich. Beträge, Rechnungsnummern und Verträge nie raten.',
      '',
      'Das CRM verfolgt bewusst nur "gepostet / nicht gepostet". Drehen, Schneiden und Einplanen organisiert das Team selbst –',
      'rechne dafür KEINE Fristen aus und mach deswegen keinen Druck. Den Vorarbeits-Stand nennst du nur, wenn jemand danach fragt.',
      '"Was brennt?" heißt: Posts, deren Posting-Tag vorbei ist und die noch nicht gepostet sind, überfällige Aufgaben,',
      'und was in den nächsten Tagen rausgehen soll. Das Dringendste zuerst, kurz halten.',
      '',
      'Team:', zeilen.team, '',
      'Kunden:', zeilen.kunden, '',
      'Offene Aufgaben:', zeilen.aufgaben, '',
      `Nicht gepostete Videos (${plusTage(heute, -14)} bis ${bis}):`, zeilen.videos, '',
      'Termine und Drehtage (nächste 4 Wochen):', zeilen.termine,
    ].join('\n')

    // Verlauf als Gespraech: Claude = assistant, alle anderen = user (mit Namen davor).
    // Aufeinanderfolgende Nachrichten derselben Rolle werden zusammengefasst.
    if (verlaufR.error) console.error('Verlauf:', verlaufR.error.message)
    const verlauf = ((verlaufR.data ?? []) as any[]).reverse()
    const messages: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of verlauf) {
      const rolle: 'user' | 'assistant' = m.author_kind === 'claude' ? 'assistant' : 'user'
      let inhalt = m.author_kind === 'system' ? `[Hinweis: ${m.body}]` : rolle === 'user' ? `${name(m.author_id)}: ${m.body}` : m.body
      if (rolle === 'assistant' && m.plan?.length) inhalt += `\n[Mein Vorschlag mit ${m.plan.length} Schritt(en) – Status: ${m.plan_status ?? 'offen'}]`
      if (!inhalt.trim()) continue
      const letzte = messages[messages.length - 1]
      if (letzte && letzte.role === rolle) letzte.content += '\n' + inhalt
      else messages.push({ role: rolle, content: inhalt })
    }
    while (messages.length && messages[0].role !== 'user') messages.shift()
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: `${fragender}: ${String(body?.frage ?? '').trim() || 'Hallo'}` })
    }

    const { schritte, text, stop, runden } = await planeMitWerkzeugen({
      key, modell: MODELL, system, werkzeuge: WERKZEUGE, messages,
    })

    const { error } = await supa.from('chat_messages').insert({
      channel_id: kanalId,
      author_kind: 'claude',
      body: text || (schritte.length ? 'Hier ist mein Vorschlag:' : `Hm, da kam keine Antwort durch (${stop ?? 'unbekannt'}). Frag gern nochmal.`),
      plan: schritte.length ? schritte : null,
      plan_status: schritte.length ? 'offen' : null,
    })
    if (error) throw new Error(error.message)

    // Wer gefragt hat, bekommt die Antwort aufs Handy -- falls er die App inzwischen zu hat.
    if (memberId) {
      await fetch(`${url}/functions/v1/send-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${service}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          member_id: memberId,
          title: '✨ Claude',
          body: (text || 'Hat dir einen Vorschlag gemacht').slice(0, 180),
          link: `/chat/${kanalId}`,
          tag: `chat-${kanalId}`,
        }),
      }).catch(() => undefined)
    }

    return json({ ok: true, schritte: schritte.length, stop, runden, verlauf: verlauf.length })
  } catch (err) {
    const msg = (err as Error).message
    // Damit im Chat nicht ewig "Claude tippt" steht: Fehler als Nachricht
    if (kanalId) {
      await supa.from('chat_messages').insert({
        channel_id: kanalId, author_kind: 'claude', body: `Ich komme gerade nicht durch: ${msg}`,
      })
    }
    return json({ error: msg }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
