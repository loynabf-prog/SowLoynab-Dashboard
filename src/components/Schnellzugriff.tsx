// Schnellzugriff oben auf "Heute": die Seiten, die im Alltag dauernd
// gebraucht werden, aber nicht in der unteren Leiste stehen (Fassie, Okt 2026):
// Freigabe (Vorschau ansehen, Aenderungen einbringen), Aufgaben, Medien,
// Produktion. Mit Zahl, damit man sieht, ob dort etwas wartet.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, ListChecks, FolderOpen, Megaphone } from 'lucide-react'
import { Kachel } from './AppIcon'
import { supabase } from '../lib/supabase'
import { heute } from '../lib/datum'
import { useIdentity } from '../context/IdentityContext'

export default function Schnellzugriff() {
  const navigate = useNavigate()
  const { memberId } = useIdentity()
  const [pruefen, setPruefen] = useState<number | null>(null)
  const [aufgaben, setAufgaben] = useState<{ offen: number; faellig: number } | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [brandBild, setBrandBild] = useState<{ url: string | null; name: string } | null>(null)
  const [pruefBilder, setPruefBilder] = useState<{ url: string | null; name: string }[]>([])

  useEffect(() => {
    let weg = false
    const laden = async () => {
      const [p, t] = await Promise.all([
        supabase.from('videos').select('id, client_id, bearbeiter_id, clients(name, logo_url, zustaendig_id)')
          .in('produktion_stufe', ['pruefung', 'feinschliff']).neq('status', 'posted').is('deleted_at', null),
        supabase.from('tasks').select('due_date').eq('done', false).is('deleted_at', null),
      ])
      if (weg) return
      // Nur meine: weitergegeben an mich, sonst Kunde gehoert mir (seit 27.10.2026)
      const meine = ((p.data ?? []) as any[]).filter((v) => {
        const b = v.bearbeiter_id ?? v.clients?.zustaendig_id ?? null
        return !memberId || !b || b === memberId
      })
      setPruefen(p.error ? null : meine.length)
      // Echte Kundenlogos der Videos, die auf mich warten (jeder Kunde einmal)
      setPruefBilder([...new Map(meine.map((v) => [v.client_id, { url: v.clients?.logo_url ?? null, name: v.clients?.name ?? '?' }])).values()])
      // Personal Brand: gepostet / vorgenommen in diesem Monat
      const monat = heute().slice(0, 7)
      const { data: e } = await supabase.from('clients').select('id, name, logo_url, monthly_quota').eq('client_type', 'eigen').is('deleted_at', null).limit(1).maybeSingle()
      if (e && !weg) {
        const { count } = await supabase.from('videos').select('id', { count: 'exact', head: true })
          .eq('client_id', (e as any).id).eq('status', 'posted').is('deleted_at', null)
          .gte('scheduled_date', `${monat}-01`).lte('scheduled_date', `${monat}-31`)
        setBrandBild({ url: (e as any).logo_url ?? null, name: (e as any).name })
        const soll = (e as any).monthly_quota
        setBrand(soll ? `${count ?? 0}/${soll}` : String(count ?? 0))
      }
      if (!t.error) {
        const tag = heute()
        const rows = (t.data ?? []) as { due_date: string | null }[]
        setAufgaben({ offen: rows.length, faellig: rows.filter((r) => r.due_date && r.due_date <= tag).length })
      }
    }
    laden()
    window.addEventListener('daten-geaendert', laden)
    return () => { weg = true; window.removeEventListener('daten-geaendert', laden) }
  }, [memberId])

  const zurFreigabe = () => {
    const ziel = document.getElementById('freigabe')
    if (ziel) ziel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else navigate('/produktion')
  }

  return (
    <div className="kacheln">
      <Kachel icon={Eye} farbe="glut" titel="Vorschau" bilder={pruefBilder} wert={pruefen ?? '–'} aktiv={!!pruefen} onClick={pruefen ? zurFreigabe : () => navigate('/produktion')} />
      <Kachel icon={ListChecks} farbe="gelb" titel="Aufgaben" wert={aufgaben ? (aufgaben.faellig || aufgaben.offen) : '–'} aktiv={!!aufgaben?.faellig} onClick={() => navigate('/aufgaben')} />
      <Kachel icon={FolderOpen} farbe="blau" titel="Medien" onClick={() => navigate('/medien')} />
      <Kachel icon={Megaphone} farbe="pink" titel="Brand" bilder={brandBild ? [brandBild] : undefined} wert={brand} onClick={() => navigate('/brand')} />
    </div>
  )
}
