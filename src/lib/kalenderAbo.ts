// Den Dashboard-Kalender aufs Handy holen.
// ---------------------------------------------------------------------------
// Jede Person hat einen eigenen Abo-Schluessel. An ihm haengt nicht nur der
// Zugang, sondern auch der Inhalt: die gemeinsamen Termine plus die eigenen,
// nicht die privaten des anderen.
//
// Der Schluessel ist ein Passwort. Wer ihn hat, sieht den Dienstplan -- ohne
// Login, ohne Ablauf. Deshalb laesst er sich jederzeit neu erzeugen; das
// alte Abo auf einem verlorenen Handy ist damit sofort tot.

import { supabase } from './supabase'

/**
 * Die Adresse, die man im iPhone abonniert.
 *
 * `webcal://` statt `https://` ist Absicht: darauf reagiert iOS mit dem
 * Kalender statt mit dem Browser -- ein Antippen genuegt.
 */
export function aboUrl(token: string, protokoll: 'webcal' | 'https' = 'webcal'): string {
  const basis = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const https = `${basis}/functions/v1/calendar-feed?token=${token}`
  return protokoll === 'webcal' ? https.replace(/^https?:\/\//, 'webcal://') : https
}

/** Neuen Schluessel vergeben. Bestehende Abos auf allen Geraeten sind danach tot. */
export async function neuerSchluessel(memberId: string): Promise<{ token: string | null; error: string | null }> {
  const token = crypto.randomUUID()
  const { error } = await supabase
    .from('team_members')
    .update({ calendar_token: token })
    .eq('id', memberId)
  if (error) return { token: null, error: error.message }
  return { token, error: null }
}
