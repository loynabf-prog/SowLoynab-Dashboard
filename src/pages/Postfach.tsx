import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { syncMail, sendMail } from '../lib/mail'
import Modal from '../components/Modal'
import SwipeRow from '../components/SwipeRow'

interface Mail {
  id: string
  from_address: string | null
  from_name: string | null
  to_address: string | null
  subject: string | null
  snippet: string | null
  body_html: string | null
  received_at: string | null
  is_read: boolean
  archived: boolean
}

function when(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export default function Postfach() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Mail[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [open, setOpen] = useState<Mail | null>(null)
  const [reply, setReply] = useState<Mail | null>(null)

  async function load() {
    const { data } = await supabase.from('mails').select('*').eq('archived', false).order('received_at', { ascending: false }).limit(200)
    setRows((data ?? []) as Mail[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('mail-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'mails' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const unread = useMemo(() => rows.filter((r) => !r.is_read).length, [rows])

  async function refresh() {
    setSyncing(true)
    try {
      const res = await syncMail()
      await load()
      toast(res.imported > 0 ? `${res.imported} neue Mail${res.imported > 1 ? 's' : ''} ✓` : 'Alles aktuell ✓')
    } catch (e) {
      toast('Abruf-Fehler: ' + (e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  async function openMail(m: Mail) {
    setOpen(m)
    if (!m.is_read) {
      setRows((prev) => prev.map((r) => (r.id === m.id ? { ...r, is_read: true } : r)))
      await supabase.from('mails').update({ is_read: true }).eq('id', m.id)
    }
  }

  async function archive(m: Mail) {
    setRows((prev) => prev.filter((r) => r.id !== m.id))
    setOpen(null)
    await supabase.from('mails').update({ archived: true }).eq('id', m.id)
    toast('Archiviert')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Postfach</h1>
          <span className="sub">{loading ? 'Lade …' : unread > 0 ? `${unread} ungelesen` : 'Alles gelesen'}</span>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={refresh} disabled={syncing}>{syncing ? 'Rufe ab …' : '↻ Abrufen'}</button>
      </div>

      {!loading && rows.length === 0 && (
        <div className="col-empty">Noch keine Mails. Tippe auf „Abrufen" — oder der automatische Abruf läuft alle 5 Minuten. 📬</div>
      )}

      <div className="mail-list">
        {rows.map((m) => (
          <SwipeRow key={m.id} onDelete={() => archive(m)} label="Archivieren">
            <button className={`mail-row ${m.is_read ? '' : 'unread'}`} onClick={() => openMail(m)}>
              {!m.is_read && <span className="mail-dot" />}
              <div className="mail-main">
                <div className="mail-top">
                  <span className="mail-from">{m.from_name || m.from_address || 'Unbekannt'}</span>
                  <span className="mail-when">{when(m.received_at)}</span>
                </div>
                <div className="mail-subject">{m.subject || '(kein Betreff)'}</div>
                <div className="mail-snippet">{m.snippet}</div>
              </div>
            </button>
          </SwipeRow>
        ))}
      </div>

      {open && (
        <Modal title={open.subject || '(kein Betreff)'} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="mail-meta">
              <div><strong>{open.from_name || ''}</strong> {open.from_address && <span className="muted">&lt;{open.from_address}&gt;</span>}</div>
              <div className="muted" style={{ fontSize: 12 }}>{open.received_at ? new Date(open.received_at).toLocaleString('de-DE') : ''}</div>
            </div>
            <iframe
              className="mail-body"
              sandbox=""
              srcDoc={open.body_html || `<p style="font-family:sans-serif">${(open.snippet || '').replace(/</g, '&lt;')}</p>`}
              title="Mail-Inhalt"
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => archive(open)}>Archivieren</button>
              <button className="btn btn-primary" onClick={() => { const m = open; setOpen(null); setReply(m) }}>↩︎ Antworten</button>
            </div>
          </div>
        </Modal>
      )}

      {reply && <ReplyModal mail={reply} onClose={() => setReply(null)} onSent={() => { setReply(null); toast('Antwort verschickt ✓') }} />}
    </>
  )
}

function ReplyModal({ mail, onClose, onSent }: { mail: Mail; onClose: () => void; onSent: () => void }) {
  const to = mail.from_address || ''
  const [subject, setSubject] = useState((mail.subject || '').startsWith('Re:') ? (mail.subject || '') : `Re: ${mail.subject || ''}`)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!message.trim()) { setError('Bitte eine Nachricht schreiben.'); return }
    setBusy(true); setError(null)
    try {
      const html = message.split('\n').map((l) => l || '&nbsp;').join('<br>')
      await sendMail({ to, subject, html })
      onSent()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Antworten" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}
        <div><label>An</label><input value={to} disabled /></div>
        <div><label>Betreff</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div><label>Nachricht</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} autoFocus /></div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Sende …' : 'Senden ✉️'}</button>
        </div>
      </div>
    </Modal>
  )
}
