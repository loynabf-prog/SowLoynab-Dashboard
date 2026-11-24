// Zeigt, von wann der letzte Lexware-Abgleich ist -- damit niemand sich
// Sorgen macht, wenn eine gerade eingegangene Zahlung noch nicht da ist.
// Quelle: system_status.job = 'lexware-sync' (schreibt die Edge Function).
import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'

interface Stand { last_ok: string | null; last_error: string | null; last_error_at: string | null }

function wann(iso: string): string {
  const d = new Date(iso)
  const heute = new Date()
  const gestern = new Date(); gestern.setDate(heute.getDate() - 1)
  const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === heute.toDateString()) return `heute ${uhr} Uhr`
  if (d.toDateString() === gestern.toDateString()) return `gestern ${uhr} Uhr`
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}, ${uhr} Uhr`
}

export default function LexwareStand({ style }: { style?: CSSProperties }) {
  const [s, setS] = useState<Stand | null>(null)

  useEffect(() => {
    const laden = () => supabase.from('system_status').select('last_ok, last_error, last_error_at')
      .eq('job', 'lexware-sync').maybeSingle().then(({ data }) => setS((data as Stand) ?? null))
    laden()
    const ch = supabase.channel('lexware-stand')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_status', filter: 'job=eq.lexware-sync' }, laden)
      .subscribe()
    const t = setInterval(laden, 5 * 60 * 1000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [])

  if (!s?.last_ok) return null
  const fehler = s.last_error_at && s.last_error_at > s.last_ok
  const alt = Date.now() - new Date(s.last_ok).getTime() > 6 * 60 * 60 * 1000
  return (
    <p className="p-fuss" style={{ margin: '4px 0 12px', opacity: 0.75, ...style }}>
      {fehler ? '⚠︎ ' : ''}Zahlungen laut Lexware, Stand {wann(s.last_ok)}
      {fehler ? ' · letzter Abgleich fehlgeschlagen' : alt ? ' · Abgleich überfällig' : ''}
    </p>
  )
}
