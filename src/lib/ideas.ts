import { supabase } from './supabase'
import type { Client } from './types'

export interface GeneratedIdea {
  title: string
  notes: string | null
}

// Ruft die Edge Function "generate-ideas" auf und liefert Videoideen zurueck.
export async function generateIdeas(
  client: Client,
  count: number,
  theme: string | null,
  existing: string[],
): Promise<GeneratedIdea[]> {
  const { data, error } = await supabase.functions.invoke('generate-ideas', {
    body: {
      count,
      theme,
      existing,
      client: {
        name: client.name,
        city: (client as any).city ?? null,
        ai_brief: (client as any).ai_brief ?? null,
        brand_notes: (client as any).brand_notes ?? null,
        package: client.package,
      },
    },
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
  if (data?.error) throw new Error(data.error)
  return (data?.ideas ?? []) as GeneratedIdea[]
}
