// Eine Caption schreiben lassen.
// ---------------------------------------------------------------------------
// Die eigentliche Arbeit macht die Edge Function generate-caption (Claude).
// Hier kommt der Hausstil dazu: die festen Hashtags und der Ton, die einmal
// in den Einstellungen stehen, statt jedes Mal mitdiktiert zu werden.

import { getCaptionVorgabe, mitHashtags } from './captionVorgabe'
import { rufeFunktion } from './funktion'

export interface CaptionKunde {
  name?: string | null
  handle_ig?: string | null
  handle_tiktok?: string | null
  ai_brief?: string | null
}

/**
 * @param beschreibung Was im Video passiert -- ein Satz reicht.
 * @param extra        Einmaliger Zusatzwunsch ("Aktion erwähnen").
 */
export async function schreibeCaption(
  beschreibung: string,
  kunde: CaptionKunde,
  extra = '',
): Promise<string> {
  const vorgabe = await getCaptionVorgabe()

  const a = await rufeFunktion<any>('generate-caption', {
      description: beschreibung,
      extra,
      tonalitaet: vorgabe.tonalitaet ?? '',
      notes: kunde.ai_brief ?? '',
      client: {
        name: kunde.name ?? '',
        handle_ig: kunde.handle_ig ?? '',
        handle_tiktok: kunde.handle_tiktok ?? '',
      },
  })
  const text = String(a?.caption ?? a?.text ?? '').trim()
  if (!text) throw new Error('Es kam keine Caption zurück.')

  return mitHashtags(text, vorgabe.hashtags)
}
