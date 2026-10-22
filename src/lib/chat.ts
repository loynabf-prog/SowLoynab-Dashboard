// Team-Chat: Kanaele, Nachrichten, Gelesen-Stand, Push.
// ---------------------------------------------------------------------------
// Tabellen aus Migration 0050. Wie ueberall: alle teilen sich einen Login,
// wer schreibt, sagt die Identitaet des Geraets ("ich bin Lion").

import { supabase } from './supabase'
import { rufeFunktion } from './funktion'
import type { Schritt, SchrittErgebnis } from './assistent'

export type KanalArt = 'team' | 'direkt' | 'gruppe' | 'claude'

export interface Kanal {
  id: string
  kind: KanalArt
  name: string | null
  member_ids: string[]
  created_by: string | null
  created_at: string
  last_message_at: string | null
}

export type PlanStatus = 'offen' | 'laeuft' | 'ausgefuehrt' | 'verworfen'

export interface Nachricht {
  id: string
  channel_id: string
  author_id: string | null
  author_kind: 'mensch' | 'claude' | 'system'
  body: string
  task_id: string | null
  plan: Schritt[] | null
  plan_status: PlanStatus | null
  plan_result: SchrittErgebnis[] | null
  link: string | null
  created_at: string
  deleted_at: string | null
}

/** Sieht diese Person den Kanal? Leere Mitgliederliste = alle. */
export function siehtKanal(k: Pick<Kanal, 'member_ids'>, memberId: string | null): boolean {
  if (!k.member_ids || k.member_ids.length === 0) return true
  return !!memberId && k.member_ids.includes(memberId)
}

/** Anzeigename eines Kanals aus Sicht von "ich". */
export function kanalName(k: Kanal, ich: string | null, nameVon: (id: string) => string | undefined): string {
  if (k.kind === 'team') return k.name || 'Team'
  if (k.kind === 'claude') return 'Claude'
  if (k.kind === 'direkt') {
    const anderer = k.member_ids.find((id) => id !== ich) ?? k.member_ids[0]
    return (anderer && nameVon(anderer)) || 'Direktchat'
  }
  return k.name || 'Gruppe'
}

/** Reihenfolge der Liste: Team oben, Claude danach, dann nach letzter Nachricht. */
export function sortiereKanaele(liste: Kanal[]): Kanal[] {
  const rang = (k: Kanal) => (k.kind === 'team' ? 0 : k.kind === 'claude' ? 1 : 2)
  return [...liste].sort((a, b) => {
    const r = rang(a) - rang(b)
    if (r !== 0) return r
    return (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at)
  })
}

export async function ladeKanaele(memberId: string | null): Promise<Kanal[]> {
  const { data, error } = await supabase
    .from('chat_channels')
    .select('*')
    .is('deleted_at', null)
    .order('created_at')
  if (error) throw error
  return sortiereKanaele(((data ?? []) as Kanal[]).filter((k) => siehtKanal(k, memberId)))
}

/** Direktchat zwischen zwei Personen holen oder anlegen. */
export async function direktKanal(ich: string, anderer: string): Promise<Kanal> {
  const { data } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('kind', 'direkt')
    .is('deleted_at', null)
    .contains('member_ids', [ich, anderer])
  const da = ((data ?? []) as Kanal[]).find((k) => k.member_ids.length === 2)
  if (da) return da
  const { data: neu, error } = await supabase
    .from('chat_channels')
    .insert({ kind: 'direkt', member_ids: [ich, anderer], created_by: ich })
    .select('*')
    .single()
  if (error) throw error
  return neu as Kanal
}

/** Der private Claude-Chat einer Person. */
export async function claudeKanal(ich: string): Promise<Kanal> {
  const { data } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('kind', 'claude')
    .is('deleted_at', null)
    .contains('member_ids', [ich])
  const da = (data ?? [])[0] as Kanal | undefined
  if (da) return da
  const { data: neu, error } = await supabase
    .from('chat_channels')
    .insert({ kind: 'claude', name: 'Claude', member_ids: [ich], created_by: ich })
    .select('*')
    .single()
  if (error) throw error
  return neu as Kanal
}

export async function gruppeAnlegen(name: string, mitglieder: string[], ich: string): Promise<Kanal> {
  const ids = Array.from(new Set([ich, ...mitglieder]))
  const { data, error } = await supabase
    .from('chat_channels')
    .insert({ kind: 'gruppe', name: name.trim(), member_ids: ids, created_by: ich })
    .select('*')
    .single()
  if (error) throw error
  return data as Kanal
}

export async function ladeNachrichten(kanalId: string, vor?: string, menge = 60): Promise<Nachricht[]> {
  let q = supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', kanalId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(menge)
  if (vor) q = q.lt('created_at', vor)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as Nachricht[]).reverse()
}

export async function schreibe(n: {
  channel_id: string
  author_id: string | null
  author_kind?: Nachricht['author_kind']
  body: string
  task_id?: string | null
}): Promise<Nachricht> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ author_kind: 'mensch', ...n })
    .select('*')
    .single()
  if (error) throw error
  return data as Nachricht
}

export async function alsGelesen(kanalId: string, memberId: string): Promise<void> {
  await supabase
    .from('chat_reads')
    .upsert({ channel_id: kanalId, member_id: memberId, last_read_at: new Date().toISOString() })
}

export async function ungelesen(memberId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('chat_ungelesen', { p_member: memberId })
  if (error) return {}
  const out: Record<string, number> = {}
  for (const r of (data ?? []) as { channel_id: string; anzahl: number }[]) out[r.channel_id] = Number(r.anzahl)
  return out
}

/** Empfaenger einer Nachricht: alle im Kanal ausser dem Absender. */
export function empfaenger(k: Kanal, alleIds: string[], absender: string | null): string[] {
  const basis = k.member_ids.length > 0 ? k.member_ids : alleIds
  return basis.filter((id) => id !== absender)
}

/** Push an alle anderen im Kanal. Fehlt Push, passiert einfach nichts. */
export async function pushAnKanal(opts: {
  kanal: Kanal
  alleIds: string[]
  absender: string | null
  titel: string
  text: string
  /** Nur diese Personen benachrichtigen (z. B. bei Aufgaben). */
  nur?: string[]
}): Promise<void> {
  const ziel = opts.nur?.length ? opts.nur.filter((id) => id !== opts.absender) : empfaenger(opts.kanal, opts.alleIds, opts.absender)
  await Promise.all(
    ziel.map((id) =>
      supabase.functions
        .invoke('send-push', {
          body: { member_id: id, title: opts.titel, body: opts.text.slice(0, 180), link: `/chat/${opts.kanal.id}`, tag: `chat-${opts.kanal.id}` },
        })
        .catch(() => undefined),
    ),
  )
}

/** Claude im Kanal antworten lassen. Die Antwort schreibt die Edge Function selbst in den Kanal. */
export async function frageClaude(kanalId: string, memberId: string | null, frage: string, heute: string): Promise<void> {
  await rufeFunktion('chat-claude', { channel_id: kanalId, member_id: memberId, frage, heute })
}
