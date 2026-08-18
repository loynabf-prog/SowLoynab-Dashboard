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
    // Edge Function nicht deployt / Secret fehlt / Netzwerk
    const body = (error as any)?.context ? await safeBody((error as any).context) : null
    throw new Error(
      body?.error ||
        'Die Auto-Caption ist noch nicht aktiviert oder nicht erreichbar. ' +
          '(Edge Function „generate-caption" deployt? ANTHROPIC_API_KEY gesetzt?)',
    )
  }
  if (data?.error) throw new Error(data.error)
  return (data?.caption ?? '').trim()
}

async function safeBody(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}
