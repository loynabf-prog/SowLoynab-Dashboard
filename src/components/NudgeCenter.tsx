import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useIdentity } from '../context/IdentityContext'
import { useToast } from '../context/ToastContext'
import { enablePush, isPushEnabled, pushConfigured, pushSupported, pushNeedsHomeScreen } from '../lib/push'
import { sendTestPush } from '../lib/nudge'

interface Nudge {
  id: string
  from_name: string | null
  body: string
  link: string | null
  read: boolean
  created_at: string
}

export default function NudgeCenter() {
  const navigate = useNavigate()
  const { members, byId } = useTeam()
  const { memberId, setMemberId } = useIdentity()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [nudges, setNudges] = useState<Nudge[]>([])
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const seen = useRef<Set<string>>(new Set())

  const me = memberId ? byId(memberId) : undefined
  const unread = nudges.filter((n) => !n.read).length

  const load = useCallback(async () => {
    if (!memberId) {
      setNudges([])
      return
    }
    const { data } = await supabase
      .from('nudges')
      .select('*')
      .eq('to_member_id', memberId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30)
    const rows = (data ?? []) as Nudge[]
    rows.forEach((r) => seen.current.add(r.id))
    setNudges(rows)
  }, [memberId])

  useEffect(() => {
    load()
    if (memberId) isPushEnabled().then(setPushOn)
    if (!memberId) return
    const ch = supabase
      .channel(`nudges-${memberId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nudges', filter: `to_member_id=eq.${memberId}` },
        (payload) => {
          const n = payload.new as Nudge
          if (seen.current.has(n.id)) return
          seen.current.add(n.id)
          setNudges((prev) => [n, ...prev])
          toast(`👉 ${n.from_name || 'Jemand'}: ${n.body}`, n.link ? { label: 'Öffnen', onClick: () => openNudge(n) } : undefined)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, load])

  // Antippen einer System-Push-Benachrichtigung -> zur Stelle springen
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === 'nudge-open' && e.data.link) navigate(e.data.link)
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [navigate])

  async function openNudge(n: Nudge) {
    setOpen(false)
    if (!n.read) {
      setNudges((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      await supabase.from('nudges').update({ read: true }).eq('id', n.id)
    }
    if (n.link) navigate(n.link)
  }

  async function markAllRead() {
    if (!memberId) return
    setNudges((prev) => prev.map((x) => ({ ...x, read: true })))
    await supabase.from('nudges').update({ read: true }).eq('to_member_id', memberId).eq('read', false)
  }

  // Identität wählen/wechseln — bei aktivem Push das Abo auf die neue Person ummappen
  async function pickIdentity(id: string) {
    setMemberId(id)
    if (await isPushEnabled()) {
      await enablePush(id) // upsert auf denselben Endpoint -> member_id wird aktualisiert
      setPushOn(true)
    }
  }

  async function testPush() {
    if (!memberId) return
    setPushBusy(true)
    try {
      const { sent } = await sendTestPush(memberId)
      toast(sent > 0 ? `Test gesendet an ${sent} Gerät(e) 🔔` : 'Kein aktives Abo für dich gefunden — bitte Push (neu) aktivieren.')
    } catch (e) {
      toast('Test fehlgeschlagen: ' + (e as Error).message)
    } finally {
      setPushBusy(false)
    }
  }

  async function turnOnPush() {
    if (!memberId) return
    setPushBusy(true)
    const res = await enablePush(memberId)
    setPushBusy(false)
    if (res.ok) {
      setPushOn(true)
      toast('Handy-Push aktiv 🔔')
    } else {
      toast(res.reason || 'Push konnte nicht aktiviert werden')
    }
  }

  return (
    <div className="nudge-center">
      <button
        className="nudge-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label="Anstupser"
        title="Anstupser & Benachrichtigungen"
      >
        🔔
        {unread > 0 && <span className="nudge-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <>
          <div className="nudge-backdrop" onClick={() => setOpen(false)} />
          <div className="nudge-panel">
            <div className="nudge-panel-head">
              <span>Anstupser</span>
              {unread > 0 && (
                <button className="btn btn-sm btn-ghost" onClick={markAllRead}>Alle gelesen</button>
              )}
            </div>

            {/* Identität */}
            <div className="nudge-identity">
              {me ? (
                <span>
                  Angemeldet als <strong>{me.name}</strong>{' '}
                  <button className="linklike" onClick={() => setMemberId(null)}>wechseln</button>
                </span>
              ) : (
                <div className="nudge-pick">
                  <span className="muted">Wer bist du auf diesem Gerät?</span>
                  <div className="nudge-pick-opts">
                    {members.map((m) => (
                      <button key={m.id} className="btn btn-sm" onClick={() => pickIdentity(m.id)}>
                        {m.name}
                      </button>
                    ))}
                    {members.length === 0 && <span className="muted">Erst im Team-Bereich Personen anlegen.</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Push-Status */}
            {me && pushConfigured() && pushSupported() && pushNeedsHomeScreen() && (
              <div className="nudge-push">
                <span className="muted" style={{ fontSize: 13 }}>
                  📲 Für Handy-Push die App zuerst über <strong>Teilen → „Zum Home-Bildschirm"</strong> öffnen.
                </span>
              </div>
            )}
            {me && pushConfigured() && pushSupported() && !pushNeedsHomeScreen() && (
              <div className="nudge-push">
                {pushOn ? (
                  <div className="nudge-push-row">
                    <span className="nudge-push-on">✓ Handy-Push aktiv</span>
                    <button className="btn btn-sm" onClick={testPush} disabled={pushBusy}>
                      {pushBusy ? '…' : 'Test an mich'}
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={turnOnPush} disabled={pushBusy}>
                    {pushBusy ? 'Aktiviere …' : '🔔 Handy-Push aktivieren'}
                  </button>
                )}
              </div>
            )}

            {/* Liste */}
            <div className="nudge-list">
              {!memberId && <div className="col-empty">Wähle oben, wer du bist.</div>}
              {memberId && nudges.length === 0 && <div className="col-empty">Keine Anstupser. 🎉</div>}
              {nudges.map((n) => (
                <button key={n.id} className={`nudge-item ${n.read ? '' : 'unread'}`} onClick={() => openNudge(n)}>
                  <div className="nudge-item-body">
                    <strong>{n.from_name || 'Jemand'}</strong> {n.body}
                  </div>
                  <div className="nudge-item-meta">
                    {new Date(n.created_at).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {n.link && ' · öffnen →'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
