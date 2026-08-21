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

// Schickt eine Test-Push an das eigene Gerät (zur Fehlersuche).
export async function sendTestPush(memberId: string): Promise<{ sent: number }> {
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: {
      member_id: memberId,
      title: '✅ Test',
      body: 'Push funktioniert auf diesem Gerät!',
      link: '/',
    },
  })
  if (error) {
    // Echten Grund aus der Funktions-Antwort ziehen (statt "non-2xx status code")
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
    throw new Error(`${detail || (error as any)?.message || 'Funktion fehlgeschlagen'}${status ? ` (Status ${status})` : ''}`.slice(0, 300))
  }
  if ((data as any)?.error) throw new Error((data as any).error)
  return { sent: (data as any)?.sent ?? 0 }
}
