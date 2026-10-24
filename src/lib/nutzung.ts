// Nutzung messen: welche Seite wie oft und wie lange offen ist.
// ---------------------------------------------------------------------------
// Bei jedem Seitenwechsel (und beim Schliessen/Wegtippen) landet eine Zeile
// in `seitenaufrufe`: wer, welche Seite, von wo, wie lange. Die Auswertung
// steht in der Ansicht `nutzung_je_seite` -- Claude liest sie nach einer
// Woche/einem Monat und sortiert die Navigation danach (lib/bereiche.ts).
//
// Bewusst grob: Kundenseiten werden zu "/client" zusammengefasst, Chat zu
// "/chat". Es geht um Seiten, nicht um einzelne Kunden.

import { supabase } from './supabase'

export type Geraet = 'handy' | 'desktop'

/** "/client/abc-123" -> "/client", "/chat/xyz" -> "/chat", sonst unveraendert. */
export function normPfad(pfad: string): string {
  const m = pfad.match(/^\/(client|chat|vertrag)(\/|$)/)
  return m ? `/${m[1]}` : pfad.replace(/\/+$/, '') || '/'
}

export function geraetVon(breite: number): Geraet {
  return breite >= 900 ? 'desktop' : 'handy'
}

export interface Aufruf {
  member_id: string | null
  pfad: string
  von: string | null
  dauer_s: number | null
  geraet: Geraet
}

/**
 * Was beim Verlassen einer Seite gespeichert wird. Sehr kurze Besuche
 * (< 2 s, z. B. Durchklicken) zaehlen nicht -- sie sagen nichts darueber,
 * was jemand wirklich benutzt.
 */
export function aufrufVon(opts: {
  memberId: string | null; pfad: string; von: string | null; seit: number; jetzt: number; breite: number
}): Aufruf | null {
  const dauer = Math.round((opts.jetzt - opts.seit) / 1000)
  if (dauer < 2) return null
  return {
    member_id: opts.memberId,
    pfad: normPfad(opts.pfad),
    von: opts.von ? normPfad(opts.von) : null,
    // Laenger als 30 Minuten heisst: Tab lag offen rum, nicht benutzt.
    dauer_s: Math.min(dauer, 30 * 60),
    geraet: geraetVon(opts.breite),
  }
}

export async function speichereAufruf(a: Aufruf): Promise<void> {
  try { await supabase.from('seitenaufrufe').insert(a) } catch { /* Messung darf nie stoeren */ }
}

export interface NutzungZeile {
  pfad: string; aufrufe: number; aufrufe_7t: number; aufrufe_30t: number
  minuten: number; minuten_30t: number; zuletzt: string | null
}

export async function ladeNutzung(): Promise<NutzungZeile[]> {
  const { data } = await supabase.from('nutzung_je_seite').select('*')
  return (data ?? []) as NutzungZeile[]
}
