import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Kleines Brief-Symbol im Header mit Zähler ungelesener Mails.
export default function MailIndicator() {
  const [unread, setUnread] = useState(0)

  async function count() {
    const { count } = await supabase
      .from('mails')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('archived', false)
    setUnread(count ?? 0)
  }

  useEffect(() => {
    count()
    const ch = supabase.channel('mail-badge').on('postgres_changes', { event: '*', schema: 'public', table: 'mails' }, () => count()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  return (
    <Link to="/postfach" className="mail-indicator" title="Postfach">
      <span>✉️</span>
      {unread > 0 && <span className="mail-badge">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  )
}
