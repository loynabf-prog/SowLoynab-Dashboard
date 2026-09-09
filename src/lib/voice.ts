import { supabase } from './supabase'

// Ergebnis eines Sprachbefehls: erkannter Text + strukturierter Vorschlag.
export type VoiceIntentType = 'task' | 'lead' | 'video' | 'ideas' | 'unknown'

export interface VoiceIntent {
  type: VoiceIntentType
  title?: string | null
  name?: string | null
  client_name?: string | null
  lead_name?: string | null
  date?: string | null
  time?: string | null
  count?: number | null
  theme?: string | null
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

// Schickt den (diktierten oder getippten) Befehl an die Edge Function
// "voice-command" und liefert den Text + erkannten Intent zurueck.
//
// Bewusst Text und kein Audio: diktiert wird mit der Mikrofontaste der
// Handytastatur. Damit bleibt die Sprachaufnahme auf dem Geraet bzw. beim
// Betriebssystem -- unser System bekommt sie nie zu sehen.
export async function sendCommand(text: string, ctx: VoiceContext): Promise<VoiceResult> {
  const { data, error } = await supabase.functions.invoke('voice-command', {
    body: { text, context: ctx },
  })

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
