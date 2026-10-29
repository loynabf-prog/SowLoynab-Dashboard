// Backstube: die Ofen-Seite (Fassie, 28.10.2026)
// -------------------------------------------------------------------------
// Wir sind Pizzalieferanten. Jedes Video ist eine Pizza:
//   Teig      Videoidee, noch kein Material
//   Belegt    Rohmaterial ist da (gedreht)
//   Zettel    Bestellzettel geschrieben -> wartet vor dem Ofen
//   Ofen      Claude schneidet gerade
//   Raus      Vorschau ist fertig -> servieren oder zurück in den Ofen?
//   Teller    bereit zum Posten / eingeplant
//   Gegessen  gepostet
// Jeder hat seinen eigenen Ofen (Migration 0064): er backt nur die Kunden,
// für die er zuständig ist (bzw. Videos, die an ihn weitergegeben wurden).
// Kundenkontingente sind die Bestellungen (Hajo 15, Kraftfeld 10 …).

import { supabase } from './supabase'
import { rangVon } from './kundenart'
import { heute } from './datum'

export type Stufe = 'teig' | 'belegt' | 'zettel' | 'ofen' | 'raus' | 'teller' | 'gegessen'

export const STUFEN: { key: Stufe; name: string; satz: string }[] = [
  { key: 'teig', name: 'Teig', satz: 'Idee, noch kein Material' },
  { key: 'belegt', name: 'Belegt', satz: 'Material ist da' },
  { key: 'zettel', name: 'Bestellzettel', satz: 'Wartet vor dem Ofen' },
  { key: 'ofen', name: 'Im Ofen', satz: 'Wird gerade geschnitten' },
  { key: 'raus', name: 'Raus', satz: 'Anschauen: servieren oder nochmal rein' },
  { key: 'teller', name: 'Teller', satz: 'Bereit zum Posten' },
  { key: 'gegessen', name: 'Gegessen', satz: 'Gepostet' },
]

export interface BKunde {
  id: string
  name: string
  logo_url?: string | null
  zustaendig_id?: string | null
  client_type?: string | null
  monthly_quota?: number | null
  active?: boolean | null
  deleted_at?: string | null
}

export interface BVideo {
  id: string
  title: string
  client_id: string
  status: string
  scheduled_date: string | null
  prep_shot?: boolean | null
  produktion_stufe?: string | null
  bearbeiter_id?: string | null
  dropbox_pfad?: string | null
  script?: string | null
  notes?: string | null
  /** Claude-Chat zu diesem Video (Migration 0066) */
  chat_url?: string | null
  clients?: BKunde | null
}

export interface BAuftrag {
  id: string
  video_id: string
  art: 'erstschnitt' | 'aenderung'
  wunsch: string
  status: 'offen' | 'laeuft' | 'erledigt' | 'fehler' | 'uebergeben'
  reihenfolge: number | null
  created_at: string
  updated_at?: string | null
  gestartet_am: string | null
  notiz: string | null
  ofen_id?: string | null
  fortschritt?: number | null
  schritt?: string | null
}

export interface Pizza {
  video: BVideo
  stufe: Stufe
  /** Wessen Ofen: weitergegeben > zuständig für den Kunden */
  besitzer: string | null
  /** Offener oder laufender Auftrag, falls es einen gibt */
  auftrag: BAuftrag | null
}

export interface OfenStand {
  besitzer: string
  imOfen: Pizza | null
  schlange: Pizza[]
  raus: Pizza[]
  angebrannt: { pizza: Pizza; auftrag: BAuftrag }[]
}

export interface Bestellung {
  kunde: BKunde
  besitzer: string | null
  soll: number
  zaehlung: Record<Stufe, number>
}

export interface Backstube {
  pizzen: Pizza[]
  oefen: Map<string, OfenStand>
  bestellungen: Bestellung[]
}

/** Wessen Ofen backt dieses Video? */
export function besitzerVon(v: Pick<BVideo, 'bearbeiter_id' | 'clients'>): string | null {
  return v.bearbeiter_id ?? v.clients?.zustaendig_id ?? null
}

/** Wo steht die Pizza gerade? */
export function stufeVon(v: BVideo, auftrag: BAuftrag | null): Stufe {
  if (auftrag?.status === 'laeuft') return 'ofen'
  if (auftrag?.status === 'offen') return 'zettel'
  if (v.status === 'posted') return 'gegessen'
  if (v.produktion_stufe === 'fertig' || v.status === 'ready' || v.status === 'planned') return 'teller'
  if (v.produktion_stufe === 'pruefung' || v.produktion_stufe === 'feinschliff') return 'raus'
  if (v.prep_shot || v.produktion_stufe === 'roh') return 'belegt'
  return 'teig'
}

function reihe(a: BAuftrag, b: BAuftrag): number {
  return (a.reihenfolge ?? Infinity) - (b.reihenfolge ?? Infinity) || a.created_at.localeCompare(b.created_at)
}

/** Alles sortieren und verteilen -- ohne Datenbank, damit testbar. */
export function baueBackstube(opts: {
  videos: BVideo[]
  auftraege: BAuftrag[]
  team: string[]
  monat: string
  plaene?: Map<string, number>
}): Backstube {
  const { videos, auftraege, team, monat } = opts
  const lebend = auftraege.filter((a) => a.status === 'offen' || a.status === 'laeuft')
  // Pro Video der wichtigste Auftrag: laeuft vor offen, dann frueher in der Schlange
  const proVideo = new Map<string, BAuftrag>()
  for (const a of [...lebend].sort((x, y) => (x.status === 'laeuft' ? -1 : 0) - (y.status === 'laeuft' ? -1 : 0) || reihe(x, y))) {
    if (!proVideo.has(a.video_id)) proVideo.set(a.video_id, a)
  }

  const pizzen: Pizza[] = videos
    .filter((v) => v.clients && !v.clients.deleted_at && v.clients.active !== false)
    .map((v) => {
      const auftrag = proVideo.get(v.id) ?? null
      return { video: v, auftrag, stufe: stufeVon(v, auftrag), besitzer: auftrag?.ofen_id ?? besitzerVon(v) }
    })

  const oefen = new Map<string, OfenStand>()
  for (const t of team) oefen.set(t, { besitzer: t, imOfen: null, schlange: [], raus: [], angebrannt: [] })
  const ofenVon = (b: string | null) => (b ? oefen.get(b) : undefined)

  const nachReihe = (a: Pizza, b: Pizza) => reihe(a.auftrag!, b.auftrag!)
  for (const p of pizzen) {
    const o = ofenVon(p.besitzer)
    if (!o) continue
    if (p.stufe === 'ofen') {
      // Laufen mal zwei (sollte nicht), zeigt der Ofen den aeltesten
      if (!o.imOfen || (p.auftrag!.gestartet_am ?? '') < (o.imOfen.auftrag!.gestartet_am ?? '')) {
        if (o.imOfen) o.schlange.unshift(o.imOfen)
        o.imOfen = p
      } else o.schlange.unshift(p)
    }
    if (p.stufe === 'zettel') o.schlange.push(p)
    if (p.stufe === 'raus') o.raus.push(p)
  }
  for (const o of oefen.values()) o.schlange.sort((a, b) => (a.stufe === 'ofen' ? -1 : 0) - (b.stufe === 'ofen' ? -1 : 0) || nachReihe(a, b))

  // Angebrannt: Fehler der letzten Tage, wenn danach nichts Neues lief
  const vidMap = new Map(pizzen.map((p) => [p.video.id, p]))
  for (const a of auftraege.filter((x) => x.status === 'fehler')) {
    const p = vidMap.get(a.video_id)
    if (!p || p.auftrag) continue
    const o = ofenVon(a.ofen_id ?? p.besitzer)
    if (o && !o.angebrannt.some((x) => x.pizza.video.id === a.video_id)) o.angebrannt.push({ pizza: p, auftrag: a })
  }

  // Bestellungen: Kontingent im Monat, gezaehlt nach Stufe
  const kunden = new Map<string, BKunde>()
  for (const p of pizzen) if (p.video.clients) kunden.set(p.video.client_id, { ...p.video.clients, id: p.video.client_id })
  const bestellungen: Bestellung[] = []
  for (const k of kunden.values()) {
    const meine = pizzen.filter((p) => p.video.client_id === k.id
      && (p.video.scheduled_date ? p.video.scheduled_date.startsWith(monat) : p.stufe !== 'gegessen'))
    const zaehlung = Object.fromEntries(STUFEN.map((s) => [s.key, 0])) as Record<Stufe, number>
    for (const p of meine) zaehlung[p.stufe]++
    const soll = opts.plaene?.get(k.id) ?? k.monthly_quota ?? 0
    if (!soll && meine.length === 0) continue
    bestellungen.push({ kunde: k, besitzer: k.zustaendig_id ?? null, soll, zaehlung })
  }
  bestellungen.sort((a, b) => rangVon(a.kunde.client_type) - rangVon(b.kunde.client_type) || b.soll - a.soll || a.kunde.name.localeCompare(b.kunde.name))

  return { pizzen, oefen, bestellungen }
}

const KUNDE = 'clients(name, logo_url, zustaendig_id, client_type, monthly_quota, active, deleted_at)'

export async function ladeBackstube(team: string[]): Promise<Backstube> {
  const monat = heute().slice(0, 7)
  const seit = new Date(Date.now() - 3 * 86400_000).toISOString()
  const [v, a, m] = await Promise.all([
    supabase.from('videos')
      .select(`id, title, client_id, status, scheduled_date, prep_shot, produktion_stufe, bearbeiter_id, dropbox_pfad, archiv_pfad, script, notes, chat_url, ${KUNDE}`)
      .is('deleted_at', null)
      .or(`status.neq.posted,scheduled_date.gte.${monat}-01`)
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .limit(800),
    supabase.from('video_aenderungen')
      .select('*')
      .is('deleted_at', null)
      .or(`status.in.(offen,laeuft),and(status.eq.fehler,updated_at.gte.${seit})`),
    supabase.from('client_month_plans').select('client_id, quota').eq('month_key', monat),
  ])
  if (v.error) throw v.error
  if (a.error) throw a.error
  const plaene = new Map(((m.data ?? []) as { client_id: string; quota: number }[]).map((r) => [r.client_id, r.quota]))
  return baueBackstube({
    videos: (v.data ?? []) as unknown as BVideo[],
    auftraege: (a.data ?? []) as BAuftrag[],
    team, monat, plaene,
  })
}

/** Bestellzettel schreiben: Pizza vor den Ofen stellen (hinten oder als Nächstes). */
export async function aufDenZettel(p: Pizza, anweisung: string, vorne: boolean, memberId: string | null): Promise<void> {
  const text = anweisung.trim()
  if (!text) throw new Error('Kurz schreiben, wie das Video werden soll')
  const art = p.stufe === 'raus' || p.stufe === 'teller' ? 'aenderung' : 'erstschnitt'
  const { data, error } = await supabase.from('video_aenderungen')
    .insert({ video_id: p.video.id, client_id: p.video.client_id, wunsch: text, art, created_by: memberId })
    .select('id').single()
  if (error) throw error
  if (!p.video.produktion_stufe) await supabase.from('videos').update({ produktion_stufe: 'roh' }).eq('id', p.video.id)
  if (vorne) await vordraengeln((data as { id: string }).id)
}

export async function vordraengeln(id: string): Promise<void> {
  const { error } = await supabase.rpc('schlange_nach_vorne', { p_id: id })
  if (error) throw error
}

export async function hintenAnstellen(id: string): Promise<void> {
  const { error } = await supabase.rpc('schlange_nach_hinten', { p_id: id })
  if (error) {
    // Ohne Migration 0064: einfach ans Ende der Zeit setzen
    const { error: e2 } = await supabase.from('video_aenderungen').update({ reihenfolge: Date.now() / 1000 }).eq('id', id).eq('status', 'offen')
    if (e2) throw e2
  }
}

/** Zettel zerreissen: aus der Schlange nehmen (Papierkorb, nichts geht verloren). */
export async function zettelWeg(id: string): Promise<void> {
  const { error } = await supabase.from('video_aenderungen').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('status', 'offen')
  if (error) throw error
}

/** Angebrannt: nochmal hinten anstellen. */
/**
 * Von Hand "wird gerade geschnitten" melden -- wenn ein Chat schneidet, der
 * sich nicht selbst im Ofen angemeldet hat. Gleiche Funktion wie die Chats
 * nutzen (ofen_belegen, Migration 0067).
 */
export async function vonHandInDenOfen(videoId: string, wunsch = 'Schnitt im Chat (von Hand gemeldet)'): Promise<void> {
  const { error } = await supabase.rpc('ofen_belegen', { p_video: videoId, p_wunsch: wunsch })
  if (error) throw error
}

/** Von Hand aus dem Ofen nehmen: Vorschau gilt als fertig (Raus). */
export async function vonHandRaus(auftragId: string): Promise<void> {
  const { error } = await supabase.rpc('ofen_fertig', { p_auftrag: auftragId, p_notiz: 'Von Hand rausgenommen' })
  if (error) throw error
}

export async function nochmalBacken(id: string): Promise<void> {
  const { error } = await supabase.from('video_aenderungen').update({ status: 'offen', reihenfolge: Date.now() / 1000 }).eq('id', id)
  if (error) throw error
}

/**
 * Der Auftrag fuer einen neuen Claude-Chat zu einem Video. Der Chat merkt sich
 * zuerst selbst im CRM (videos.chat_url), damit jede spaetere Vorschau zu
 * diesem Video wieder im selben Chat landet. Kurz halten: steckt in einer URL.
 */
export function chatAuftrag(v: Pick<BVideo, 'id' | 'title' | 'clients'>): string {
  const kunde = v.clients?.name ?? 'Kunde'
  return [
    `🍕 Vorschau-Chat: ${kunde} – ${v.title} (video_id ${v.id})`,
    '',
    '1. Lade den Skill sowloynab-crm.',
    `2. Merk dir diesen Chat im CRM: recent_chats(n=1) → dessen url → update videos set chat_url = '<url>' where id = '${v.id}'.`,
    '3. Hol aus dem Video-Ordner (videos.dropbox_pfad, sonst archiv_pfad) NOTIZEN.md und Vorschau.mp4 und zeig mir die Vorschau hier.',
    'Schneidest du selbst hier im Chat: vorher im Ofen anmelden (Agentur/Automatik/Schnitt-im-Chat.md).',
    '4. Dann sage ich dir meine Änderungen mündlich. Mach daraus einen klaren Bestellzettel in der Backstube (video_aenderungen, art=aenderung, vorne wenn ich es sage). Sage ich „passt“, servierst du (Agentur/Automatik/Pipeline.md, Abschnitt 3.5).',
    'Alle weiteren Vorschauen zu diesem Video besprechen wir in diesem Chat.',
  ].join('\n')
}

/** Link zum Chat des Videos: vorhandener Chat oder ein neuer mit Auftrag. */
export function chatLink(v: Pick<BVideo, 'id' | 'title' | 'clients' | 'chat_url'>): string {
  if (v.chat_url && /^https:\/\/claude\.ai\//.test(v.chat_url)) return v.chat_url
  return `https://claude.ai/new?q=${encodeURIComponent(chatAuftrag(v))}`
}

/** "seit 12 Min." */
export function seit(iso: string | null | undefined, jetzt = Date.now()): string {
  if (!iso) return ''
  const min = Math.max(0, Math.round((jetzt - Date.parse(iso)) / 60_000))
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  return `${h} Std. ${min % 60} Min.`
}
