export type VideoStatus = 'todo' | 'ready' | 'planned' | 'posted'

export interface Client {
  id: string
  name: string
  logo_url: string | null
  handle_ig: string | null
  handle_tiktok: string | null
  notes: string | null
  brand: string | null        // 'media' (Sow & Loynab) | 'creator' (Creator Scout)
  client_type: string | null  // 'zahlend' | 'referenz' | 'passiv'
  package: string | null
  monthly_fee: number | null
  active: boolean
  ai_brief: string | null
  brand_notes: string | null
  city: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  website: string | null
  health: string | null
  monthly_quota: number | null
  contract_end: string | null
  /** Gesetzt = pausiert (0045): nicht auf Heute, im Plan, im Morgen-Push. */
  pausiert_seit?: string | null
  pause_grund?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface VideoIdea {
  id: string
  client_id: string
  /** Kanal des Kunden -- siehe Video.channel_id. */
  channel_id?: string | null
  title: string
  notes: string | null
  source: 'manual' | 'ai' | 'lexikon'
  /** Aus welchem Lexikon-Eintrag die Idee uebernommen wurde. */
  lexikon_id?: string | null
  sort_order: number | null
  moved_video_id: string | null
  deleted_at: string | null
  created_by: string | null
  created_at: string
}

export type InspirationPlatform = 'tiktok' | 'instagram' | 'other'

// Ein fremdes Video, das wir uns als Vorbild gemerkt haben.
// client_id = null -> allgemeine Inspiration ohne Kunden.
export type LexikonTyp = 'format' | 'idee'
export type LexikonKategorie = 'werbung' | 'sympathie' | 'expertise' | 'entertainment'

export const LEXIKON_KATEGORIEN: { key: LexikonKategorie; label: string; farbe: string }[] = [
  { key: 'werbung', label: 'Werbung', farbe: '#ff9f0a' },
  { key: 'sympathie', label: 'Sympathie', farbe: '#ff375f' },
  { key: 'expertise', label: 'Expertise', farbe: '#0a84ff' },
  { key: 'entertainment', label: 'Entertainment', farbe: '#bf5af2' },
]

/** Eintrag im Video-Lexikon: allgemein gehaltene Idee oder wiederholbares Format je Branche. */
export interface LexikonEintrag {
  id: string
  branche: string
  typ: LexikonTyp
  titel: string
  beschreibung: string | null
  aufbau: string | null
  kategorie: LexikonKategorie | null
  quelle: string | null
  belege: string | null
  format_id: string | null
  tags: string[]
  sort_order: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Inspiration {
  id: string
  client_id: string | null
  url: string
  platform: InspirationPlatform
  title: string | null
  author: string | null
  thumbnail_url: string | null
  notes: string | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  duration_seconds: number | null
  posted_at: string | null
  stats_updated_at: string | null
  deleted_at: string | null
  created_by: string | null
  created_at: string
  clients?: { name: string } | null
}

export type LeadStage = 'new' | 'contacted' | 'talking' | 'offer' | 'won' | 'lost'

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: 'Neu',
  contacted: 'Kontaktiert',
  talking: 'Im Gespräch',
  offer: 'Angebot',
  won: 'Gewonnen',
  lost: 'Verloren',
}

export const LEAD_STAGE_ORDER: LeadStage[] = ['new', 'contacted', 'talking', 'offer', 'won', 'lost']

export interface Lead {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  handle_ig: string | null
  website: string | null
  city: string | null
  stage: LeadStage
  potential_fee: number | null
  notes: string | null
  next_followup: string | null
  source: string | null
  assigned_to: string | null
  assignee_ids: string[]
  sort_order: number | null
  converted_client_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  title: string
  done: boolean
  due_date: string | null
  due_time: string | null
  assigned_to: string | null
  assignee_ids: string[]
  client_id: string | null
  lead_id: string | null
  notes: string | null
  series_id: string | null
  category: string | null
  priority: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  kind: string
  body: string
  client_id: string | null
  lead_id: string | null
  created_by: string | null
  created_at: string
}

export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  description: string
  category: string | null
  client_id: string | null
  occurred_on: string
  recurring: boolean
  created_by: string | null
  created_at: string
}

export interface TeamMember {
  id: string
  name: string
  color: string
  active: boolean
  /**
   * Abo-Schluessel fuer den eigenen Kalender aufs Handy. Ein Passwort --
   * wer ihn hat, sieht den Dienstplan. Optional, damit die App auch ohne
   * Migration 0032 laeuft.
   */
  calendar_token?: string | null
  /**
   * Welche Bereiche (lib/bereiche.ts) das Mitglied in der Navigation sieht.
   * Leer = alle. Optional, damit die App auch ohne Migration 0037 laeuft.
   */
  bereiche?: string[] | null
  created_at: string
}

/** Ein Termin: Arbeitszeit, Spiel oder alles andere, was den Tag belegt. */
export type EventKind = 'arbeit' | 'spiel' | 'termin' | 'dreh'

export interface CalEventRow {
  id: string
  title: string
  kind: EventKind
  /** Gehört der Termin zu einem Kunden? Leer = intern. */
  client_id?: string | null
  /** Nur beim Drehtag: wie viele Videos an dem Tag entstehen sollen. */
  planned_videos?: number | null
  clients?: { name: string } | null
  starts_on: string
  ends_on: string | null
  starts_at: string | null
  ends_at: string | null
  /** Leer heisst "gilt fuer alle" -- der haeufigere Fall. */
  member_ids: string[]
  notes: string | null
  deleted_at: string | null
  created_by: string | null
  created_at: string
}

export interface Video {
  id: string
  client_id: string
  /**
   * Zu welchem Kanal des Kunden gehoert das Video? Nur gesetzt, wenn der
   * Kunde ueberhaupt getrennt wird (zwei Betriebe unter einem Dach).
   * Optional, damit die App auch ohne Migration 0029 laeuft.
   */
  channel_id?: string | null
  title: string
  status: VideoStatus
  scheduled_date: string | null
  scheduled_time: string | null
  caption: string | null
  notes: string | null
  video_url: string | null
  storage_path: string | null
  bunny_stream_id: string | null
  file_size: number | null
  duration_seconds: number | null
  posted_ig: boolean
  posted_tiktok: boolean
  /**
   * Vorarbeit in der Reihenfolge, in der gearbeitet wird. Getrennt vom
   * Status: der sagt, wo die Karte liegt -- diese drei, was am Video schon
   * getan ist. Optional, damit die App auch ohne Migration 0031 laeuft.
   */
  prep_shot?: boolean
  prep_edited?: boolean
  prep_scheduled?: boolean
  /**
   * Automatische Link-Abholung nach dem Posten. link_fetch_state:
   * 'offen' = laeuft noch, 'fertig' = beide Adressen da, 'unklar' = etwas
   * stimmt nicht und wir fragen lieber nach, 'fehlgeschlagen' = aufgegeben.
   */
  link_fetch_at?: string | null
  link_fetch_state?: string | null
  link_fetch_note?: string | null
  /** An welchem Drehtag wird gedreht? Nicht zu verwechseln mit scheduled_date, dem Posting-Tag. */
  shoot_event_id?: string | null
  /** Das Drehskript — steht am Video, damit es beim Drehen und später da ist. */
  script?: string | null
  posted_at: string | null
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  reach: number | null
  share_token: string | null
  approval_status: string | null
  approval_note: string | null
  tiktok_url: string | null
  instagram_url: string | null
  stats_updated_at: string | null
  views_ig: number | null
  likes_ig: number | null
  comments_ig: number | null
  shares_ig: number | null
  saves_ig: number | null
  views_tiktok: number | null
  likes_tiktok: number | null
  comments_tiktok: number | null
  shares_tiktok: number | null
  saves_tiktok: number | null
  sort_order: number | null
  assignee_ids: string[]
  series_id: string | null
  category: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const STATUS_LABELS: Record<VideoStatus, string> = {
  todo: 'Zu bearbeiten',
  ready: 'Bereit zum Post',
  planned: 'Geplant',
  posted: 'Gepostet',
}

export const STATUS_ORDER: VideoStatus[] = ['todo', 'ready', 'planned', 'posted']
