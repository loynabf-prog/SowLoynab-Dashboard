// Supabase Edge Function: pilot-push
// -------------------------------------------------------------------------
// Der Pilot morgens aufs Handy: je Teammitglied die drei wichtigsten
// Vorschlaege fuer SEINE Kunden -- dieselben Regeln wie in der App
// (pilot.ts ist eine Kopie von src/lib/pilot.ts, erzeugt mit
// `npm run pilot:sync`), dieselbe Sicht pilot_kunden (Migration 0068).
// So sagt der Push nie etwas anderes als die Startseite.
//
// Laeuft per Cron (Job "pilot-push") taeglich um 07:40 deutscher Zeit, eine
// halbe Stunde nach daily-reminders. Nichts offen -> kein Push.
// Probelauf ohne Versand: POST { "probe": true }.
// Montags haengt eine Wochenzeile dran (wie viele Videos die Woche braucht).

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { pilot, meine, pushZeilen, type PilotKunde } from './pilot.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function heuteIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const ZAHLEN = ['ziel', 'ziel_naechster', 'gepostet', 'offen_monat', 'gepostet_7t', 'eingeplant', 'fertig_ohne_termin', 'im_ofen', 'zettel', 'raus', 'belegt', 'teig', 'ideen', 'links_fehlen', 'zahlen_alt', 'drehtag_videos', 'vormonat_quota']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const probe = !!(await req.json().catch(() => ({})))?.probe
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:info@sowloynab.de'
    if (!pub || !priv) return json({ error: 'VAPID-Schlüssel fehlen.' }, 500)
    webpush.setVapidDetails(subject, pub, priv)

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const [{ data: zeilen, error }, { data: subs }, { data: team }] = await Promise.all([
      supa.from('pilot_kunden').select('*'),
      supa.from('push_subscriptions').select('*'),
      supa.from('team_members').select('id, name').eq('active', true),
    ])
    if (error) return json({ error: error.message }, 500)

    const kunden = ((zeilen ?? []) as Record<string, unknown>[]).map((r) => {
      const k = { ...r }
      for (const f of ZAHLEN) k[f] = k[f] == null ? (f === 'vormonat_quota' ? null : 0) : Number(k[f])
      return k as unknown as PilotKunde
    })
    const heute = heuteIso()
    const p = pilot({ kunden, heute })
    const montag = new Date(heute + 'T12:00:00Z').getUTCDay() === 1

    const ergebnis: Record<string, unknown>[] = []
    let sent = 0
    for (const m of (team ?? []) as { id: string; name: string }[]) {
      const liste = meine(p.empfehlungen, m.id)
      // Allgemeines (ohne Besitzer) bekommt jeder; rein Lion-/Fassie-Dinge nur der eine.
      if (liste.length === 0) { ergebnis.push({ wer: m.name, n: 0 }); continue }
      const rot = liste.filter((x) => x.ampel === 'rot').length
      const zeilenText = pushZeilen(liste, 3)
      // Montag: Wochenbedarf ueber meine Kunden
      let woche = ''
      if (montag) {
        const meineLagen = p.lagen.filter((l) => !l.kunde.zustaendig_id || l.kunde.zustaendig_id === m.id)
        const bedarf = meineLagen.reduce((s, l) => s + Math.ceil(l.rest / Math.max(1, Math.ceil((31 - Number(heute.slice(8, 10))) / 7))), 0)
        const teller = meineLagen.reduce((s, l) => s + l.kunde.eingeplant + l.kunde.fertig_ohne_termin, 0)
        woche = `Diese Woche: ~${bedarf} Posts nötig, ${teller} auf dem Teller`
      }
      const payload = JSON.stringify({
        title: `🧭 Pilot: ${liste.length} ${liste.length === 1 ? 'Vorschlag' : 'Vorschläge'}${rot ? ` · ${rot} dringend` : ''}`,
        body: [...zeilenText, woche].filter(Boolean).join('\n'),
        link: '/pilot',
        tag: 'pilot',
      })
      const geraete = ((subs ?? []) as Record<string, string>[]).filter((s) => s.member_id === m.id)
      ergebnis.push({ wer: m.name, n: liste.length, geraete: geraete.length, text: zeilenText, woche })
      if (probe) continue
      for (const s of geraete) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          sent++
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await supa.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }
    return json({ probe, heute, sent, ergebnis })
  } catch (err) {
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
