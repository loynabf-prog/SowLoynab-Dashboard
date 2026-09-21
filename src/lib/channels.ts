// Kanäle innerhalb eines Kunden.
// ---------------------------------------------------------------------------
// Ein Kunde kann zwei Betriebe unter einem Dach haben, je mit eigenem
// Instagram- und TikTok-Account. Ein Kanal buendelt die Accounts eines
// Betriebs und traegt Namen und Farbe. Videos und Ideen haengen an einem
// Kanal, damit sich die beiden Betriebe nicht vermischen.
//
// Der Normalfall bleibt "ein Kunde, ein Kanal". Dann gibt es gar keinen
// Kanal-Eintrag und die App zeigt auch keine Kanal-Bedienung -- niemand
// soll etwas zuordnen muessen, wo es nichts zu trennen gibt.
//
// Braucht Migration 0029. Fehlt sie, kommt eine leere Liste zurueck und
// alles verhaelt sich wie vorher.

import { supabase } from './supabase'
import { tableMissing } from './db'

export interface Channel {
  id: string
  client_id: string
  name: string
  color: string
  sort: number
}

/** Ein Kanal im Bearbeiten-Formular, noch nicht gespeichert. */
export interface ChannelEntwurf {
  id: string | null
  name: string
  color: string
}

/**
 * Feste Farbreihe. Bewusst gut unterscheidbar und auch nebeneinander noch
 * auseinanderzuhalten -- der Streifen an der Videokarte ist schmal.
 * Alle sechs funktionieren auf hellem wie dunklem Grund.
 */
export const FARBEN = [
  '#0071e3', // Blau
  '#e0521a', // Orange
  '#34c759', // Grün
  '#af52de', // Violett
  '#ff9500', // Bernstein
  '#5ac8fa', // Hellblau
] as const

export const FARB_NAMEN: Record<string, string> = {
  '#0071e3': 'Blau',
  '#e0521a': 'Orange',
  '#34c759': 'Grün',
  '#af52de': 'Violett',
  '#ff9500': 'Bernstein',
  '#5ac8fa': 'Hellblau',
}

/** Nächste freie Farbe, damit zwei Kanäle nicht zufällig gleich aussehen. */
export function naechsteFarbe(belegt: string[]): string {
  const frei = FARBEN.find((f) => !belegt.includes(f))
  return frei ?? FARBEN[belegt.length % FARBEN.length]
}

/** Kanäle eines Kunden laden. Ohne Migration eine leere Liste. */
export async function ladeKanaele(clientId: string): Promise<{ da: boolean; kanaele: Channel[] }> {
  const { data, error } = await supabase
    .from('client_channels')
    .select('id, client_id, name, color, sort')
    .eq('client_id', clientId)
    .order('sort')
  if (error) {
    if (tableMissing(error) != null) return { da: false, kanaele: [] }
    throw error
  }
  return { da: true, kanaele: (data ?? []) as unknown as Channel[] }
}

export function zuKanalEntwuerfen(kanaele: Channel[]): ChannelEntwurf[] {
  return kanaele.map((k) => ({ id: k.id, name: k.name, color: k.color }))
}

/**
 * Entwuerfe mit dem gespeicherten Stand abgleichen.
 *
 * Ein geloeschter Kanal nimmt seine Videos NICHT mit -- in der Datenbank
 * steht "on delete set null". Die Videos verlieren nur ihre Farbe.
 */
export function planeKanalAbgleich(vorher: Channel[], entwuerfe: ChannelEntwurf[]) {
  const sauber = entwuerfe
    .map((e) => ({ ...e, name: e.name.trim() }))
    .filter((e) => e.name !== '')

  // Gleicher Name zweimal: der erste gewinnt (die Datenbank liesse es nicht zu).
  const gesehen = new Set<string>()
  const eindeutig = sauber.filter((e) => {
    const k = e.name.toLowerCase()
    if (gesehen.has(k)) return false
    gesehen.add(k)
    return true
  })

  const behalten = new Set(eindeutig.map((e) => e.id).filter(Boolean) as string[])
  const loeschen = vorher.filter((v) => !behalten.has(v.id)).map((v) => v.id)

  const anlegen: { name: string; color: string; sort: number }[] = []
  const aendern: { id: string; name: string; color: string; sort: number }[] = []
  eindeutig.forEach((e, i) => {
    if (e.id) aendern.push({ id: e.id, name: e.name, color: e.color, sort: i })
    else anlegen.push({ name: e.name, color: e.color, sort: i })
  })

  return { anlegen, aendern, loeschen }
}

export async function speichereKanaele(
  clientId: string,
  vorher: Channel[],
  entwuerfe: ChannelEntwurf[],
): Promise<Channel[]> {
  const { anlegen, aendern, loeschen } = planeKanalAbgleich(vorher, entwuerfe)

  if (loeschen.length) {
    const { error } = await supabase.from('client_channels').delete().in('id', loeschen)
    if (error && tableMissing(error) == null) throw error
  }
  for (const k of aendern) {
    const { id, ...rest } = k
    const { error } = await supabase.from('client_channels').update(rest).eq('id', id)
    if (error && tableMissing(error) == null) throw error
  }
  if (anlegen.length) {
    const rows = anlegen.map((k) => ({ ...k, client_id: clientId }))
    const { error } = await supabase.from('client_channels').insert(rows)
    if (error && tableMissing(error) == null) throw error
  }

  return (await ladeKanaele(clientId)).kanaele
}

/**
 * Trennen wir bei diesem Kunden ueberhaupt?
 *
 * Erst ab zwei Kanälen ist die Unterscheidung eine Information. Bei einem
 * einzigen waere der Farbstreifen ueberall gleich und der Filter hätte
 * nichts zu filtern -- dann bleibt die Bedienung aus.
 */
export function trenntKanaele(kanaele: Channel[]): boolean {
  return kanaele.length > 1
}

/** Nachschlagen per Id, fuer Karte und Filter. */
export function kanalVon(kanaele: Channel[], id: string | null | undefined): Channel | null {
  if (!id) return null
  return kanaele.find((k) => k.id === id) ?? null
}

/**
 * Nach Kanal filtern. `filter` ist entweder eine Kanal-Id, 'offen' für alles
 * ohne Zuordnung, oder null für "alles zeigen".
 */
export function nachKanal<T extends { channel_id?: string | null }>(
  zeilen: T[],
  filter: string | null,
): T[] {
  if (!filter) return zeilen
  if (filter === 'offen') return zeilen.filter((z) => z.channel_id == null)
  return zeilen.filter((z) => z.channel_id === filter)
}

/** Wie viele Einträge hat jeder Kanal? Für die Zahlen an den Filterknöpfen. */
export function zaehleJeKanal<T extends { channel_id?: string | null }>(zeilen: T[]) {
  const out = new Map<string, number>()
  let offen = 0
  for (const z of zeilen) {
    if (z.channel_id == null) { offen++; continue }
    out.set(z.channel_id, (out.get(z.channel_id) ?? 0) + 1)
  }
  return { jeKanal: out, offen }
}
