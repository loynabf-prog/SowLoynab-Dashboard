// Einen Plan von Claude holen -- auch wenn er in mehreren Runden kommt.
// ---------------------------------------------------------------------------
// Claude ruft Werkzeuge oft schrittweise auf: erst "kunde_anlegen", dann wartet
// es auf das Ergebnis, bevor es "monatsplan" fuer diesen Kunden plant. Wir
// fuehren hier aber nichts aus -- die App tut das erst nach Bestaetigung.
// Also bestaetigen wir jeden Aufruf als "vorgemerkt" und lassen Claude
// weiterplanen, bis es fertig ist. Ohne diese Schleife fehlten Schritte.

export interface PlanErgebnis {
  schritte: Record<string, unknown>[]
  text: string
  stop: string | null
  runden: number
}

export async function planeMitWerkzeugen(opts: {
  key: string
  modell: string
  system: string
  werkzeuge: unknown[]
  messages: { role: 'user' | 'assistant'; content: unknown }[]
  maxTokens?: number
  maxRunden?: number
}): Promise<PlanErgebnis> {
  const verlauf = [...opts.messages]
  const schritte: Record<string, unknown>[] = []
  const texte: string[] = []
  let stop: string | null = null
  let runden = 0

  while (runden < (opts.maxRunden ?? 6)) {
    runden++
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': opts.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      // Das Modell denkt vor der Antwort nach -- das braucht Platz, sonst bleibt
      // nach dem Nachdenken nichts fuer die eigentliche Antwort uebrig.
      body: JSON.stringify({
        model: opts.modell,
        max_tokens: opts.maxTokens ?? 12000,
        system: opts.system,
        tools: opts.werkzeuge,
        messages: verlauf,
      }),
    })
    if (!resp.ok) {
      const detail = await resp.text()
      throw new Error(`Claude antwortet nicht (${resp.status}): ${detail.slice(0, 200)}`)
    }
    const data = await resp.json()
    const bloecke: any[] = Array.isArray(data?.content) ? data.content : []
    stop = data?.stop_reason ?? null

    const aufrufe = bloecke.filter((b) => b?.type === 'tool_use')
    for (const b of aufrufe) schritte.push({ art: b.name, ...(b.input ?? {}) })
    const t = bloecke.filter((b) => b?.type === 'text').map((b) => String(b.text ?? '').trim()).filter(Boolean).join('\n')
    if (t) texte.push(t)

    if (stop !== 'tool_use' || aufrufe.length === 0) break

    // Weiterplanen lassen: jeden Aufruf als vorgemerkt bestaetigen.
    verlauf.push({ role: 'assistant', content: bloecke })
    verlauf.push({
      role: 'user',
      content: aufrufe.map((b) => ({
        type: 'tool_result',
        tool_use_id: b.id,
        content: `Vorgemerkt (noch nicht ausgeführt).${(b.input as any)?.ref ? ` Verweise in weiteren Schritten mit "${(b.input as any).ref}" darauf.` : ''} Plane weiter, falls noch etwas fehlt – sonst fasse in einem Satz zusammen.`,
      })),
    })
  }

  // Bei mehreren Runden ist der letzte Text die Zusammenfassung.
  return { schritte, text: texte[texte.length - 1] ?? '', stop, runden }
}
