export type VideoStatus = 'todo' | 'ready' | 'planned' | 'posted'

export interface Client {
  id: string
  name: string
  logo_url: string | null
  handle_ig: string | null
  handle_tiktok: string | null
  notes: string | null
  package: string | null
  monthly_fee: number | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
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
  assigned_to: string | null
  assignee_ids: string[]
  client_id: string | null
  lead_id: string | null
  notes: string | null
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
  created_at: string
}

export interface Video {
  id: string
  client_id: string
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
  sort_order: number | null
  assignee_ids: string[]
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
