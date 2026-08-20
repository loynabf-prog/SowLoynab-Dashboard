import { useState } from 'react'
import Modal from './Modal'
import { useTeam } from '../context/TeamContext'
import { useIdentity } from '../context/IdentityContext'
import { useToast } from '../context/ToastContext'
import { sendNudge } from '../lib/nudge'

export default function NudgeModal({
  defaultBody,
  link,
  onClose,
}: {
  defaultBody: string
  link: string | null
  onClose: () => void
}) {
  const { members, byId } = useTeam()
  const { memberId } = useIdentity()
  const { toast } = useToast()
  const [to, setTo] = useState('')
  const [body, setBody] = useState(defaultBody)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fromName = memberId ? byId(memberId)?.name ?? null : null
  // Sinnvoll: sich selbst nicht anstupsen
  const options = members.filter((m) => m.id !== memberId)

  async function send() {
    if (!to || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await sendNudge({ toMemberId: to, fromName, body: body.trim(), link })
      onClose()
      toast('Angestupst 👉')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="👉 Anstupsen" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}
        {!fromName && (
          <div className="info-box">
            Tipp: Sag oben bei der 🔔 einmal, wer du bist — dann sieht die Person, von wem der Anstupser kommt.
          </div>
        )}
        <div>
          <label>Wen anstupsen? *</label>
          <select value={to} onChange={(e) => setTo(e.target.value)} autoFocus>
            <option value="">— Person wählen —</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {options.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Erst im Team-Bereich Personen anlegen.</span>}
        </div>
        <div>
          <label>Nachricht *</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 70 }} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn-primary" onClick={send} disabled={busy || !to || !body.trim()}>
            {busy ? 'Sende …' : 'Anstupsen'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
