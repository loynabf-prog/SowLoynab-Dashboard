// Eingang zur Backstube (/ofen): dunkle Ofenkachel, glueht, solange gebacken wird.
// Steht oben auf Produktion und auf Heute.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Flame } from 'lucide-react'
import { supabase } from '../lib/supabase'
import '../styles/backstube.css'

export default function OfenEingang() {
  const navigate = useNavigate()
  const [stand, setStand] = useState<{ laeuft: number; wartet: number; raus: number } | null>(null)

  useEffect(() => {
    let weg = false
    const laden = async () => {
      const [a, r] = await Promise.all([
        supabase.from('video_aenderungen').select('status').is('deleted_at', null).in('status', ['offen', 'laeuft']),
        supabase.from('videos').select('id', { count: 'exact', head: true })
          .in('produktion_stufe', ['pruefung', 'feinschliff']).neq('status', 'posted').is('deleted_at', null),
      ])
      if (weg) return
      const rows = (a.data ?? []) as { status: string }[]
      setStand({ laeuft: rows.filter((x) => x.status === 'laeuft').length, wartet: rows.filter((x) => x.status === 'offen').length, raus: r.count ?? 0 })
    }
    laden()
    const ch = supabase.channel('ofen-eingang')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_aenderungen' }, laden)
      .subscribe()
    return () => { weg = true; supabase.removeChannel(ch) }
  }, [])

  const teile: string[] = []
  if (stand) {
    teile.push(stand.laeuft ? `${stand.laeuft} im Ofen` : 'Öfen sind leer')
    if (stand.wartet) teile.push(`${stand.wartet} warten`)
    if (stand.raus) teile.push(`${stand.raus} raus`)
  }

  return (
    <button type="button" className={`bs-eingang ${stand?.laeuft ? 'an' : ''}`} onClick={() => navigate('/ofen')}>
      <span className="bs-glut" aria-hidden />
      <span className="bs-eingang-icon"><Flame size={24} /></span>
      <span className="bs-eingang-text">
        <strong>Backstube</strong>
        <span>{stand ? teile.join(' · ') : 'Öfen, Bestellzettel, Teller'}</span>
      </span>
      <ChevronRight size={20} />
    </button>
  )
}
