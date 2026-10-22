// Sprechblase oben im Kopf: fuehrt in den Chat und zeigt, wie viel ungelesen ist.
// Neue Nachrichten kommen ausserdem als kurzer Hinweis unten, solange man
// nicht gerade in genau diesem Gespraech ist.

import { MessageCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { useToast } from '../context/ToastContext'
import { ungelesen, type Nachricht } from '../lib/chat'

export default function ChatButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const { toast } = useToast()
  const [anzahl, setAnzahl] = useState(0)

  const zaehlen = useCallback(async () => {
    if (!memberId) { setAnzahl(0); return }
    const z = await ungelesen(memberId)
    setAnzahl(Object.values(z).reduce((a, b) => a + b, 0))
  }, [memberId])

  useEffect(() => { zaehlen() }, [zaehlen, location.pathname])

  useEffect(() => {
    if (!memberId) return
    const ch = supabase
      .channel(`chat-zaehler-${memberId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (p) => {
        const n = p.new as Nachricht
        // kurz warten, bis die offene Seite den Kanal ggf. als gelesen markiert hat
        setTimeout(zaehlen, 800)
        if (n.author_id === memberId || n.author_kind === 'system') return
        if (location.pathname === `/chat/${n.channel_id}`) return
        const von = n.author_kind === 'claude' ? 'Claude' : n.author_id ? byId(n.author_id)?.name ?? 'Jemand' : 'Jemand'
        // Nur Kanaele, die man sieht -- der Zaehler filtert serverseitig, der Hinweis prueft hier grob mit
        supabase.from('chat_channels').select('member_ids').eq('id', n.channel_id).single().then(({ data }) => {
          const ids = ((data as { member_ids?: string[] } | null)?.member_ids) ?? []
          if (ids.length && !ids.includes(memberId)) return
          toast(`💬 ${von}: ${n.body.slice(0, 80)}`, { label: 'Öffnen', onClick: () => navigate(`/chat/${n.channel_id}`) })
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, () => zaehlen())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [memberId, zaehlen, location.pathname, byId, toast, navigate])

  return (
    <button className="n-kopf-knopf" onClick={() => navigate('/chat')} aria-label="Chat" title="Chat">
      <MessageCircle size={21} strokeWidth={2} />
      {anzahl > 0 && <span className="nudge-badge">{anzahl > 9 ? '9+' : anzahl}</span>}
    </button>
  )
}
