// Supabase Edge Function: daily-reminders
// -------------------------------------------------------------------------
// Fasst zusammen, was HEUTE ansteht (Posts, Aufgaben, Follow-ups) und schickt
// eine Push-Benachrichtigung an alle angemeldeten Geräte des Teams.
//
// Gedacht für einen täglichen Cron-Aufruf (siehe Anleitung unten). Nutzt die
// vorhandenen VAPID-Secrets + Service-Role (automatisch verfügbar).
//
// Beim Deploy WICHTIG: "Enforce JWT" für diese Funktion ausschalten
// (Supabase -> Edge Functions -> daily-reminders -> Settings), damit der
// Cron-Job sie aufrufen darf.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:info@sowloynab.de'
    if (!pub || !priv) return json({ error: 'VAPID-Schlüssel fehlen.' }, 500)
    webpush.setVapidDetails(subject, pub, priv)

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const today = todayIso()

    const [posts, tasks, follows, subs] = await Promise.all([
      supa.from('videos').select('id').neq('status', 'posted').is('deleted_at', null).eq('scheduled_date', today),
      supa.from('tasks').select('id').eq('done', false).is('deleted_at', null).not('due_date', 'is', null).lte('due_date', today),
      supa.from('leads').select('id').is('deleted_at', null).not('next_followup', 'is', null).lte('next_followup', today),
      supa.from('push_subscriptions').select('*'),
    ])

    const nPosts = posts.data?.length ?? 0
    const nTasks = tasks.data?.length ?? 0
    const nFollow = follows.data?.length ?? 0

    // Nichts zu tun -> keine Push (kein Spam)
    if (nPosts + nTasks + nFollow === 0) return json({ sent: 0, note: 'nichts fällig' })

    const parts: string[] = []
    if (nPosts) parts.push(`${nPosts} Post${nPosts > 1 ? 's' : ''}`)
    if (nTasks) parts.push(`${nTasks} Aufgabe${nTasks > 1 ? 'n' : ''}`)
    if (nFollow) parts.push(`${nFollow} Follow-up${nFollow > 1 ? 's' : ''}`)
    const payload = JSON.stringify({
      title: '☀️ Dein Tag bei Sow & Loynab',
      body: `Heute fällig: ${parts.join(' · ')}`,
      link: '/',
    })

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
