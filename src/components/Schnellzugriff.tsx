// Schnellzugriff oben auf "Heute": die Seiten, die im Alltag dauernd
// gebraucht werden, aber nicht in der unteren Leiste stehen (Fassie, Okt 2026):
// Freigabe (Vorschau ansehen, Aenderungen einbringen), Aufgaben, Medien,
// Produktion. Mit Zahl, damit man sieht, ob dort etwas wartet.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, ListChecks, FolderOpen, Megaphone } from 'lucide-react'
import AppIcon, { AppRaster } from './AppIcon'
import { supabase } from '../lib/supabase'
import { heute } from '../lib/datum'

export default function Schnellzugriff() {
  const navigate = useNavigate()
  const [pruefen, setPruefen] = useState<number | null>(null)
  const [aufgaben, setAufgaben] = useState<{ offen: number; faellig: number } | null>(null)

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
    <AppRaster>
      <AppIcon icon={Eye} farbe="glut" titel="Freigabe" badge={pruefen} aus={!pruefen} onClick={pruefen ? zurFreigabe : () => navigate('/produktion')} />
      <AppIcon icon={ListChecks} farbe="gelb" titel="Aufgaben" badge={aufgaben?.faellig} onClick={() => navigate('/aufgaben')} />
      <AppIcon icon={FolderOpen} farbe="blau" titel="Medien" onClick={() => navigate('/medien')} />
      <AppIcon icon={Megaphone} farbe="pink" titel="Brand" onClick={() => navigate('/brand')} />
    </AppRaster>
  )
}
