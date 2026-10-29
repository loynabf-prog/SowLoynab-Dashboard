// Kontrollstempel: "bis hierhin ist alles geprueft" (Migration 0069).
// ---------------------------------------------------------------------------
// Fassie kontrolliert einen Kunden -- alle Posts im CRM, Links geholt,
// Zahlen gezogen -- und setzt den Stempel auf ein Datum. Alles davor gilt
// als sauber; der Pilot erinnert nur noch an das, was danach kommt. Steht
// der Stempel auf dem Monatsende, ist der Monat gruen.
//
// Vor dem Stempeln zeigt die Checkliste, was im Zeitraum noch offen ist --
// damit "abschliessen" nicht heisst "wegdruecken".

import { supabase } from './supabase'
import { heute as heuteIso } from './datum'
import { monatsEnde } from './pilot'

export interface KontrollStand {
  monatsKey: string
  /** Bisheriger Stempel dieses Monats */
  bisher: string | null
  /** Bis wohin wuerde der neue Stempel reichen */
  bis: string
  /** Gepostete Videos des Monats, die nach dem bisherigen Stempel liegen */
  gepostetSeit: number
  linksFehlen: number
  zahlenAlt: number
  /** Posting-Tag vorbei, aber nicht als gepostet eingetragen */
  ueberfaellig: number
  /** Gepostet im Monat insgesamt (zur Einordnung) */
  gepostetMonat: number
}

/** Checkliste fuer einen Kunden und Monat -- bis zu welchem Tag? */
export async function kontrollStand(clientId: string, monatsKey: string, bis: string): Promise<KontrollStand> {
  const von = `${monatsKey}-01`
  const [{ data: st }, { data: videos }] = await Promise.all([
    supabase.from('monats_kontrollen').select('geprueft_bis').eq('client_id', clientId).eq('month_key', monatsKey).maybeSingle(),
    supabase.from('videos')
      .select('id, status, posted_at, scheduled_date, abrechnungsmonat, tiktok_url, instagram_url, stats_updated_at')
      .eq('client_id', clientId).is('deleted_at', null)
      .or(`abrechnungsmonat.eq.${monatsKey},and(scheduled_date.gte.${von},scheduled_date.lte.${monatsEnde(monatsKey)}),and(posted_at.gte.${von}T00:00:00,posted_at.lte.${monatsEnde(monatsKey)}T23:59:59)`),
  ])
  const bisher = (st as { geprueft_bis: string } | null)?.geprueft_bis ?? null
  const ab = bisher ?? '1900-01-01'
  const alle = (videos ?? []) as { status: string; posted_at: string | null; scheduled_date: string | null; tiktok_url: string | null; instagram_url: string | null; stats_updated_at: string | null }[]
  const tag = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '')
  const gepostet = alle.filter((v) => v.status === 'posted')
  const imFenster = gepostet.filter((v) => tag(v.posted_at) > ab && tag(v.posted_at) <= bis)
  const vor7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
  return {
    monatsKey, bisher, bis,
    gepostetSeit: imFenster.length,
    linksFehlen: imFenster.filter((v) => !(v.tiktok_url ?? '').trim() || !(v.instagram_url ?? '').trim()).length,
    zahlenAlt: imFenster.filter((v) => !v.stats_updated_at || v.stats_updated_at < vor7).length,
    ueberfaellig: alle.filter((v) => v.status !== 'posted' && v.scheduled_date && v.scheduled_date <= bis && v.scheduled_date > ab).length,
    gepostetMonat: gepostet.length,
  }
}

/** Stempel setzen (oder vorziehen). */
export async function stempeln(clientId: string, monatsKey: string, bis: string, memberId: string | null, notiz?: string): Promise<string | null> {
  const { error } = await supabase.from('monats_kontrollen').upsert({
    client_id: clientId, month_key: monatsKey, geprueft_bis: bis, geprueft_am: new Date().toISOString(),
    geprueft_von: memberId, notiz: notiz ?? null,
  }, { onConflict: 'client_id,month_key' })
  if (!error) window.dispatchEvent(new Event('daten-geaendert'))
  return error ? error.message : null
}

/** Welche Monate kommen fuer einen Stempel infrage: laufender, und der Vormonat, solange er nicht gruen ist. */
export function stempelWahl(heute = heuteIso(), vormonatBisher: string | null): { key: string; bis: string; label: string }[] {
  const monat = heute.slice(0, 7)
  const vor = new Date(Date.UTC(+monat.slice(0, 4), +monat.slice(5, 7) - 2, 1)).toISOString().slice(0, 7)
  const aus: { key: string; bis: string; label: string }[] = []
  if ((vormonatBisher ?? '') < monatsEnde(vor)) aus.push({ key: vor, bis: monatsEnde(vor), label: `${MONATE[+vor.slice(5, 7) - 1]} komplett` })
  aus.push({ key: monat, bis: heute, label: heute === monatsEnde(monat) ? `${MONATE[+monat.slice(5, 7) - 1]} komplett` : 'Bis heute' })
  return aus
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
