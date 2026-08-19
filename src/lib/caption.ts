import { supabase } from './supabase'
import type { Client, Video } from './types'

// Ruft die Supabase Edge Function "generate-caption" auf (Key bleibt server-seitig).
export async function generateCaption(
  video: Video,
  client: Client,
  description: string,
  extra?: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-caption', {
    body: {
      description,
      extra: extra || null,
      notes: video.notes,
      client: {
        name: client.name,
        handle_ig: client.handle_ig,
        handle_tiktok: client.handle_tiktok,
      },
    },
  })

  if (error) {
    // Echten Grund herausziehen, damit die Meldung diagnostisch ist
    const ctx = (error as any)?.context
    let detail = ''
    let status: number | undefined
    if (ctx && typeof ctx.status === 'number') status = ctx.status
    if (ctx && typeof ctx.text === 'function') {
      try {
        const raw = await ctx.text()
        try {
          detail = JSON.parse(raw)?.error || raw
        } catch {
          detail = raw
        }
      } catch {
        /* ignore */
      }
    }
    const name = (error as any)?.name || 'Fehler'
    const msg = detail || (error as any)?.message || 'Funktion nicht erreichbar'
    throw new Error(`[${name}${status ? ' ' + status : ''}] ${msg}`.slice(0, 400))
  }
  if (data?.error) throw new Error(data.error)
  return (data?.caption ?? '').trim()
}
