export type VideoStatus = 'todo' | 'ready' | 'planned' | 'posted'

export interface Client {
  id: string
  name: string
  logo_url: string | null
  handle_ig: string | null
  handle_tiktok: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
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
  storage_path: string | null
  bunny_stream_id: string | null
  file_size: number | null
  duration_seconds: number | null
  posted_ig: boolean
  posted_tiktok: boolean
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
