// Supabase Edge Function: daily-reminders
// -------------------------------------------------------------------------
// Fasst zusammen, was HEUTE ansteht (Posts, Aufgaben, Follow-ups) -- und was
// im Posting-Plan brennt (gerissene Fristen, verpasste Posts) -- und schickt
// eine Push-Benachrichtigung an alle angemeldeten Geräte des Teams.
//
// Die Fristen sind dieselben wie in src/lib/fristen.ts: gedreht 21 Tage,
// geschnitten 3 Tage, eingeplant 1 Tag vor dem Posting-Tag.
//
// Laeuft taeglich per Cron (Job "daily-reminders", 06:00 UTC = 08:00 bzw.
// 07:00 deutsche Zeit im Winter). Der Cron schickt den anon key als Bearer mit, deshalb
// kann "Enforce JWT" an bleiben. Nutzt die VAPID-Secrets + Service-Role.
//
// Probelauf ohne Versand: POST { "probe": true }.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { brennt, plusTage, proKunde } from './brennt.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Unser "heute" ist deutsche Zeit, nicht die Uhr des Servers.
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    // Probelauf: { "probe": true } zaehlt nur und schickt nichts raus.
    const probe = !!(await req.json().catch(() => ({})))?.probe
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:info@sowloynab.de'
    if (!pub || !priv) return json({ error: 'VAPID-Schlüssel fehlen.' }, 500)
    webpush.setVapidDetails(subject, pub, priv)

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const today = todayIso()

    const [posts, tasks, follows, subs, plan] = await Promise.all([
      supa.from('videos').select('id').neq('status', 'posted').is('deleted_at', null).eq('scheduled_date', today),
      supa.from('tasks').select('id').eq('done', false).is('deleted_at', null).not('due_date', 'is', null).lte('due_date', today),
      supa.from('leads').select('id').is('deleted_at', null).not('next_followup', 'is', null).lte('next_followup', today),
      supa.from('push_subscriptions').select('*'),
      supa.from('videos')
        .select('status, scheduled_date, prep_shot, prep_edited, prep_scheduled, shoot_event_id, clients(name)')
        .neq('status', 'posted').is('deleted_at', null)
        .gte('scheduled_date', plusTage(today, -60)).lte('scheduled_date', plusTage(today, 28)),
    ])

    // Drehtage nachschlagen: ein vergangener Drehtag heisst "gedreht".
    const planListe = (plan.data ?? []) as any[]
    const evIds = [...new Set(planListe.map((v) => v.shoot_event_id).filter(Boolean))]
    if (evIds.length) {
      const { data: ev } = await supa.from('events').select('id, starts_on').in('id', evIds)
      const datum = new Map((ev ?? []).map((e: any) => [e.id, e.starts_on]))
      for (const v of planListe) v.drehtag = datum.get(v.shoot_event_id) ?? null
    }
    // Heute steht schon als "Post" in der Nachricht -- hier nur der Rest.
    const brennen = planListe.filter((v) => v.scheduled_date !== today && brennt(v, today))
    const nBrennt = brennen.length
    const wer = proKunde(brennen.map((v) => v.clients?.name))

    const nPosts = posts.data?.length ?? 0
    const nTasks = tasks.data?.length ?? 0
    const nFollow = follows.data?.length ?? 0

    // Nichts zu tun -> keine Push (kein Spam)
    if (nPosts + nTasks + nFollow + nBrennt === 0) return json({ sent: 0, note: 'nichts fällig' })

    const parts: string[] = []
    if (nPosts) parts.push(`${nPosts} Post${nPosts > 1 ? 's' : ''}`)
    if (nTasks) parts.push(`${nTasks} Aufgabe${nTasks > 1 ? 'n' : ''}`)
    if (nFollow) parts.push(`${nFollow} Follow-up${nFollow > 1 ? 's' : ''}`)
    const payload = JSON.stringify({
      title: '☀️ Dein Tag bei Sow & Loynab',
      body: [
        nBrennt ? `🔥 Brennt: ${wer}` : '',
        parts.length ? `Heute: ${parts.join(' · ')}` : '',
      ].filter(Boolean).join('\n'),
      link: nBrennt ? '/posting' : '/',
    })

    if (probe) {
      return json({ probe: true, heute: today, posts: nPosts, aufgaben: nTasks, followups: nFollow, brennt: nBrennt, proKunde: wer, geraete: subs.data?.length ?? 0, text: payload })
    }

    let sent = 0
    for (const s of subs.data ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        sent++
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supa.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }
    return json({ sent, posts: nPosts, tasks: nTasks, follows: nFollow })
  } catch (err) {
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
