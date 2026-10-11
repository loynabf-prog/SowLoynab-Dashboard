import type { Client } from './types'
import { rufeFunktion } from './funktion'

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
  const data = await rufeFunktion<{ ideas?: GeneratedIdea[] }>('generate-ideas', {
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
  })

  return (data?.ideas ?? []) as GeneratedIdea[]
}
