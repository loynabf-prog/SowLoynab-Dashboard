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

export default function Schnellzugriff() {
  const navigate = useNavigate()
  const [pruefen, setPruefen] = useState<number | null>(null)
  const [aufgaben, setAufgaben] = useState<{ offen: number; faellig: number } | null>(null)
  const [brand, setBrand] = useState<string | null>(null)

  useEffect(() => {
    let weg = false
    const laden = async () => {
      const [p, t] = await Promise.all([
        supabase.from('videos').select('id', { count: 'exact', head: true })
          .eq('produktion_stufe', 'pruefung').is('deleted_at', null),
        supabase.from('tasks').select('due_date').eq('done', false).is('deleted_at', null),
      ])
      if (weg) return
      setPruefen(p.error ? null : p.count ?? 0)
      // Personal Brand: gepostet / vorgenommen in diesem Monat
      const monat = heute().slice(0, 7)
      const { data: e } = await supabase.from('clients').select('id, monthly_quota').eq('client_type', 'eigen').is('deleted_at', null).limit(1).maybeSingle()
      if (e && !weg) {
        const { count } = await supabase.from('videos').select('id', { count: 'exact', head: true })
          .eq('client_id', (e as any).id).eq('status', 'posted').is('deleted_at', null)
          .gte('scheduled_date', `${monat}-01`).lte('scheduled_date', `${monat}-31`)
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
  }, [])

  const zurFreigabe = () => {
    const ziel = document.getElementById('freigabe')
    if (ziel) ziel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else navigate('/produktion')
  }

  return (
    <div className="kacheln">
      <Kachel icon={Eye} farbe="glut" titel="Freigabe" wert={pruefen ?? '–'} aktiv={!!pruefen} onClick={pruefen ? zurFreigabe : () => navigate('/produktion')} />
      <Kachel icon={ListChecks} farbe="gelb" titel="Aufgaben" wert={aufgaben ? (aufgaben.faellig || aufgaben.offen) : '–'} aktiv={!!aufgaben?.faellig} onClick={() => navigate('/aufgaben')} />
      <Kachel icon={FolderOpen} farbe="blau" titel="Medien" onClick={() => navigate('/medien')} />
      <Kachel icon={Megaphone} farbe="pink" titel="Brand" wert={brand} onClick={() => navigate('/brand')} />
    </div>
  )
}
