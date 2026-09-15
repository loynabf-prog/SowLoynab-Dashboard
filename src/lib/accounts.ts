// Social-Accounts eines Kunden.
// ---------------------------------------------------------------------------
// Ein Kunde hatte frueher genau ein Instagram- und ein TikTok-Handle. Das
// reicht nicht, sobald zwei Betriebe unter einem Kunden laufen -- etwa nach
// dem Zusammenlegen zweier Kunden oder bei einer Zweitmarke. Hier liegen
// beliebig viele Accounts je Kunde und Plattform.
//
// Braucht Migration 0028. Fehlt sie, liefern die Lade-Funktionen eine leere
// Liste statt eines Fehlers -- die App laeuft dann wie vorher mit den beiden
// alten Spalten weiter.

import { supabase } from './supabase'
import { tableMissing } from './db'

export type Plattform = 'instagram' | 'tiktok'

export interface ClientAccount {
  id: string
  client_id: string
  platform: Plattform
  handle: string
  label: string | null
  sort: number
}

/** Ein Account, der noch nicht gespeichert ist (im Bearbeiten-Formular). */
export interface AccountEntwurf {
  id: string | null
  platform: Plattform
  handle: string
  label: string
}

export const PLATTFORMEN: { wert: Plattform; name: string; icon: string }[] = [
  { wert: 'instagram', name: 'Instagram', icon: '📸' },
  { wert: 'tiktok', name: 'TikTok', icon: '🎵' },
]

export function plattformInfo(p: Plattform) {
  return PLATTFORMEN.find((x) => x.wert === p) ?? PLATTFORMEN[0]
}

/**
 * Handle aufraeumen: fuehrendes @ weg, Leerzeichen weg, klein.
 * Auch eine ganze Profil-URL wird akzeptiert -- die meisten kopieren die
 * lieber, als den Namen abzutippen.
 */
export function normHandle(raw: string | null | undefined): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|tiktok\.com)\/@?([^/?#]+)/i)
  if (m) s = m[1]
  return s.replace(/^@+/, '').trim().toLowerCase()
}

/** Link zum Profil, damit man aus der App direkt hinspringen kann. */
export function profilUrl(platform: Plattform, handle: string): string {
  const h = normHandle(handle)
  return platform === 'tiktok'
    ? `https://www.tiktok.com/@${h}`
    : `https://instagram.com/${h}`
}

/** Anzeigename: der Klarname, sonst das Handle. */
export function accountName(a: { label?: string | null; handle: string }): string {
  const l = (a.label ?? '').trim()
  return l || '@' + a.handle
}

/**
 * Accounts eines Kunden laden.
 *
 * `da` sagt, ob es die Tabelle ueberhaupt schon gibt. Solange Migration 0028
 * nicht gelaufen ist, faellt die Kundenseite auf die beiden alten Handle-
 * Felder zurueck -- besser als ein Formular, das ins Leere speichert.
 */
export async function ladeAccounts(clientId: string): Promise<{ da: boolean; accounts: ClientAccount[] }> {
  const { data, error } = await supabase
    .from('client_accounts')
    .select('id, client_id, platform, handle, label, sort')
    .eq('client_id', clientId)
    .order('platform')
    .order('sort')
  if (error) {
    if (tableMissing(error) != null) return { da: false, accounts: [] }
    throw error
  }
  return { da: true, accounts: (data ?? []) as unknown as ClientAccount[] }
}

/** Gespeicherte Accounts in Formular-Entwuerfe umwandeln. */
export function zuEntwuerfen(accounts: ClientAccount[]): AccountEntwurf[] {
  return accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, label: a.label ?? '' }))
}

/** Alle Accounts aller Kunden -- fuer die Zuordnung eines Links zum Kunden. */
export async function ladeAlleAccounts(): Promise<ClientAccount[]> {
  const { data, error } = await supabase
    .from('client_accounts')
    .select('id, client_id, platform, handle, label, sort')
  if (error) return []
  return (data ?? []) as unknown as ClientAccount[]
}

/**
 * Entwuerfe aus dem Formular mit dem gespeicherten Stand abgleichen:
 * neue anlegen, geaenderte aktualisieren, entfernte loeschen.
 *
 * Bewusst in dieser Reihenfolge -- erst loeschen, dann schreiben. Sonst
 * stolpert ein getauschtes Handle ueber den eigenen Eindeutigkeits-Index.
 */
export function planeAbgleich(vorher: ClientAccount[], entwuerfe: AccountEntwurf[]) {
  const sauber = entwuerfe
    .map((e) => ({ ...e, handle: normHandle(e.handle), label: e.label.trim() }))
    .filter((e) => e.handle !== '')

  // Dubletten innerhalb des Formulars: der erste gewinnt.
  const gesehen = new Set<string>()
  const eindeutig = sauber.filter((e) => {
    const k = e.platform + '|' + e.handle
    if (gesehen.has(k)) return false
    gesehen.add(k)
    return true
  })

  const behalten = new Set(eindeutig.map((e) => e.id).filter(Boolean) as string[])
  const loeschen = vorher.filter((v) => !behalten.has(v.id)).map((v) => v.id)

  const anlegen: { client_id: string; platform: Plattform; handle: string; label: string | null; sort: number }[] = []
  const aendern: { id: string; platform: Plattform; handle: string; label: string | null; sort: number }[] = []

  eindeutig.forEach((e, i) => {
    if (e.id) aendern.push({ id: e.id, platform: e.platform, handle: e.handle, label: e.label || null, sort: i })
    else anlegen.push({ client_id: '', platform: e.platform, handle: e.handle, label: e.label || null, sort: i })
  })

  return { anlegen, aendern, loeschen }
}

/** Den geplanten Abgleich tatsaechlich ausfuehren. */
export async function speichereAccounts(clientId: string, vorher: ClientAccount[], entwuerfe: AccountEntwurf[]) {
  const { anlegen, aendern, loeschen } = planeAbgleich(vorher, entwuerfe)

  if (loeschen.length) {
    const { error } = await supabase.from('client_accounts').delete().in('id', loeschen)
    if (error && tableMissing(error) == null) throw error
  }
  for (const a of aendern) {
    const { id, ...rest } = a
    const { error } = await supabase.from('client_accounts').update(rest).eq('id', id)
    if (error && tableMissing(error) == null) throw error
  }
  if (anlegen.length) {
    const rows = anlegen.map((a) => ({ ...a, client_id: clientId }))
    const { error } = await supabase.from('client_accounts').insert(rows)
    if (error && tableMissing(error) == null) throw error
  }
}

/**
 * Die Gesamtzeilen aus client_stats herausfiltern.
 *
 * Seit 0028 stehen dort zwei Sorten Zeilen: die Gesamtzeile eines Tages
 * (account_id leer) und je eine Zeile pro Account. Alle bestehenden Kurven
 * wollen die Gesamtzeile -- sonst wuerde jeder Tag doppelt gezaehlt.
 *
 * Laeuft die Migration noch nicht, gibt es die Spalte gar nicht; dann ist
 * account_id ueberall undefined und es bleibt alles stehen. Genau richtig.
 */
export function nurGesamt<T extends { account_id?: string | null }>(zeilen: T[]): T[] {
  return zeilen.filter((z) => z.account_id == null)
}

/** Umgekehrt: nur die Zeilen, die zu einem einzelnen Account gehoeren. */
export function nurAccounts<T extends { account_id?: string | null }>(zeilen: T[]): T[] {
  return zeilen.filter((z) => z.account_id != null)
}

/**
 * Letzter bekannter Follower-Stand je Account.
 * Erwartet nach captured_on aufsteigend sortierte Zeilen.
 */
export function letzterStandJeAccount(
  zeilen: { account_id?: string | null; followers_ig?: number | null; followers_tiktok?: number | null }[],
): Map<string, number> {
  const out = new Map<string, number>()
  for (const z of zeilen) {
    if (z.account_id == null) continue
    const wert = (z.followers_ig ?? 0) + (z.followers_tiktok ?? 0)
    if (wert > 0) out.set(z.account_id, wert)
  }
  return out
}
