import { supabase } from './supabase'

export interface NudgeInput {
  toMemberId: string
  fromName: string | null
  body: string
  link: string | null
}

// Legt einen Anstupser an (Glocke, sofort) und stößt — falls eingerichtet —
// zusätzlich eine echte Handy-Push-Benachrichtigung an.
export async function sendNudge(input: NudgeInput): Promise<void> {
  const { error } = await supabase.from('nudges').insert({
    to_member_id: input.toMemberId,
    from_name: input.fromName,
    body: input.body,
    link: input.link,
  })
  if (error) throw error

  // Push ist optional — wenn die Funktion/Schlüssel fehlen, ignorieren wir es still.
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        member_id: input.toMemberId,
        title: input.fromName ? `👉 ${input.fromName} stupst dich an` : '👉 Anstupser',
        body: input.body,
        link: input.link || '/',
      },
    })
  } catch {
    /* Push nicht eingerichtet -> nur In-App-Glocke */
  }
}
