// Schnellzugriff oben auf "Heute": die Seiten, die im Alltag dauernd
// gebraucht werden, aber nicht in der unteren Leiste stehen (Fassie, Okt 2026):
// Freigabe (Vorschau ansehen, Aenderungen einbringen), Aufgaben, Medien,
// Produktion. Mit Zahl, damit man sieht, ob dort etwas wartet.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, ListChecks, FolderOpen, Scissors } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { heute } from '../lib/datum'

interface Kachel { key: string; label: string; icon: LucideIcon; farbe: string; zahl: number | null; unter: string; los: () => void }

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

  const kacheln: Kachel[] = [
    {
      key: 'freigabe', label: 'Freigabe', icon: Eye, farbe: 'glut', zahl: pruefen || null,
      unter: pruefen ? `${pruefen} ${pruefen === 1 ? 'Video wartet' : 'Videos warten'}` : 'Nichts zu prüfen',
      los: pruefen ? zurFreigabe : () => navigate('/produktion'),
    },
    {
      key: 'aufgaben', label: 'Aufgaben', icon: ListChecks, farbe: 'blau', zahl: aufgaben?.faellig || null,
      unter: aufgaben ? (aufgaben.faellig ? `${aufgaben.faellig} fällig` : `${aufgaben.offen} offen`) : '…',
      los: () => navigate('/aufgaben'),
    },
    { key: 'medien', label: 'Medien', icon: FolderOpen, farbe: 'lila', zahl: null, unter: 'Dropbox-Material', los: () => navigate('/medien') },
    { key: 'produktion', label: 'Produktion', icon: Scissors, farbe: 'gruen', zahl: null, unter: 'Videos in Arbeit', los: () => navigate('/produktion') },
  ]

  return (
    <div className="sz-raster" role="navigation" aria-label="Schnellzugriff">
      {kacheln.map((k) => (
        <button key={k.key} type="button" className="sz-kachel" onClick={k.los}>
          <span className={`n-ic ${k.farbe}`}><k.icon strokeWidth={2.2} /></span>
          {k.zahl != null && <span className="sz-zahl">{k.zahl}</span>}
          <strong>{k.label}</strong>
          <span className="sz-unter">{k.unter}</span>
        </button>
      ))}
    </div>
  )
}
