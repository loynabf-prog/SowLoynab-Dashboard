import { supabase } from './supabase'

// Ergebnis eines Sprachbefehls: erkannter Text + strukturierter Vorschlag.
export type VoiceIntentType = 'task' | 'lead' | 'video' | 'unknown'

export interface VoiceIntent {
  type: VoiceIntentType
  title?: string | null
  name?: string | null
  client_name?: string | null
  lead_name?: string | null
  date?: string | null
  time?: string | null
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  city?: string | null
  notes?: string | null
  message?: string | null
}

export interface VoiceResult {
  transcript: string
  intent: VoiceIntent | null
}

export interface VoiceContext {
  today: string
  clients: { id: string; name: string }[]
  leads: { id: string; name: string }[]
  members: { id: string; name: string }[]
}

// Waehlt einen von Whisper/MediaRecorder unterstuetzten Aufnahme-Typ.
// iOS-Safari liefert audio/mp4, Chrome/Firefox audio/webm.
export function pickMimeType(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
  const MR: any = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null
  if (MR?.isTypeSupported) {
    for (const c of cands) if (MR.isTypeSupported(c)) return c
  }
  return ''
}

function extFor(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

// Schickt die Aufnahme an die Edge Function "voice-command" und liefert
// Transkript + erkannten Intent zurueck.
export async function sendVoice(blob: Blob, mime: string, ctx: VoiceContext): Promise<VoiceResult> {
  const form = new FormData()
  const ext = extFor(mime || blob.type)
  form.append('audio', blob, `aufnahme.${ext}`)
  form.append('context', JSON.stringify(ctx))

  const { data, error } = await supabase.functions.invoke('voice-command', { body: form })

  if (error) {
    const c = (error as any)?.context
    let detail = ''
    let status: number | undefined
    if (c && typeof c.status === 'number') status = c.status
    if (c && typeof c.text === 'function') {
      try {
        const raw = await c.text()
        try { detail = JSON.parse(raw)?.error || raw } catch { detail = raw }
      } catch { /* ignore */ }
    }
    const name = (error as any)?.name || 'Fehler'
    const msg = detail || (error as any)?.message || 'Funktion nicht erreichbar'
    throw new Error(`[${name}${status ? ' ' + status : ''}] ${msg}`.slice(0, 400))
  }
  if (data?.error && !data?.transcript) throw new Error(data.error)
  return { transcript: (data?.transcript ?? '').trim(), intent: (data?.intent ?? null) as VoiceIntent | null }
}
