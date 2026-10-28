// Schnellzugriff oben auf "Heute": Aufgaben und Personal Brand. Vorschauen,
// Medien und Produktion laufen seit 28.10.2026 ueber die Backstube (Kachel
// darueber). Mit Zahl, damit man sieht, ob dort etwas wartet.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListChecks, Megaphone } from 'lucide-react'
import { Kachel } from './AppIcon'
import { supabase } from '../lib/supabase'
import { heute } from '../lib/datum'
import { useIdentity } from '../context/IdentityContext'

export default function Schnellzugriff() {
  const navigate = useNavigate()
  const { memberId } = useIdentity()
  const [aufgaben, setAufgaben] = useState<{ offen: number; faellig: number } | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [brandBild, setBrandBild] = useState<{ url: string | null; name: string } | null>(null)

  useEffect(() => {
    let weg = false
    const laden = async () => {
      const t = await supabase.from('tasks').select('due_date').eq('done', false).is('deleted_at', null)
      if (weg) return
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

  return (
    <div className="kacheln">
      <Kachel icon={ListChecks} farbe="gelb" titel="Aufgaben" wert={aufgaben ? (aufgaben.faellig || aufgaben.offen) : '–'} aktiv={!!aufgaben?.faellig} onClick={() => navigate('/aufgaben')} />
      <Kachel icon={Megaphone} farbe="pink" titel="Brand" bilder={brandBild ? [brandBild] : undefined} wert={brand} onClick={() => navigate('/brand')} />
    </div>
  )
}
