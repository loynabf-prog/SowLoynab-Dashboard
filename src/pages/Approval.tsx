import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface ApprovalVideo {
  id: string
  title: string
  caption: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  video_url: string | null
  status: string
  approval_status: string
  approval_note: string | null
  client_name: string
}

// Öffentliche Freigabe-Seite (ohne Login). Kunde sieht EIN Video und gibt frei
// oder fordert Änderungen an — via sichere RPC-Funktionen (Skript 10).
export default function Approval() {
  const { token } = useParams<{ token: string }>()
  const [video, setVideo] = useState<ApprovalVideo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function load() {
    if (!token) return
    const { data, error } = await supabase.rpc('get_video_by_token', { t: token })
    if (error) { setError(error.message); setLoading(false); return }
    const row = (data ?? [])[0]
    if (!row) { setError('Dieser Link ist ungültig oder abgelaufen.'); setLoading(false); return }
    setVideo(row as ApprovalVideo)
    setNote(row.approval_note ?? '')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function decide(status: 'approved' | 'changes') {
    if (!token) return
    setBusy(true)
    const { error } = await supabase.rpc('set_video_approval', { t: token, new_status: status, note })
    setBusy(false)
    if (error) { setError(error.message); return }
    setDone(status)
  }

  const fmtDate = (d: string | null, t: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }) + (t ? ` · ${t.slice(0, 5)} Uhr` : '') : 'Termin offen'

  return (
    <div className="approval-wrap">
      <div className="approval-card">
        <div className="approval-brand"><span className="brand-dot" /> Sow&nbsp;&amp;&nbsp;Loynab</div>

        {loading && <p className="muted">Lade …</p>}
        {error && <div className="error-box">{error}</div>}

        {done && (
          <div className="approval-done">
            <div style={{ fontSize: 44 }}>{done === 'approved' ? '✅' : '📝'}</div>
            <h1>{done === 'approved' ? 'Freigegeben – danke!' : 'Änderungswunsch gesendet'}</h1>
            <p className="muted">{done === 'approved' ? 'Wir posten das Video wie geplant.' : 'Wir kümmern uns drum und melden uns.'}</p>
          </div>
        )}

        {!loading && !error && !done && video && (
          <>
            <span className="approval-kicker">Freigabe für {video.client_name}</span>
            <h1>{video.title}</h1>
            <div className="approval-when">📅 {fmtDate(video.scheduled_date, video.scheduled_time)}</div>

            {video.video_url && (
              <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ width: '100%', marginTop: 6 }}>
                🎬 Video ansehen
              </a>
            )}

            {video.caption && (
              <div className="approval-caption">
                <div className="approval-caption-label">Caption</div>
                <p>{video.caption}</p>
              </div>
            )}

            {video.approval_status === 'approved' && <div className="info-box">✅ Bereits freigegeben. Danke!</div>}

            <div>
              <label>Anmerkung (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Bitte Logo größer, Musik anders …" />
            </div>

            <div className="approval-actions">
              <button className="btn" onClick={() => decide('changes')} disabled={busy}>Änderung wünschen</button>
              <button className="btn btn-primary" onClick={() => decide('approved')} disabled={busy}>✅ Freigeben</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
