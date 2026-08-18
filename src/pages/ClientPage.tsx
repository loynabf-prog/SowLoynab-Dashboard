import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  STATUS_LABELS,
  STATUS_ORDER,
  type Client,
  type Video,
  type VideoStatus,
} from '../lib/types'
import VideoCard from '../components/VideoCard'
import Modal from '../components/Modal'

export default function ClientPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Video | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const loadVideos = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('client_id', id)
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setVideos((data ?? []) as Video[])
  }, [id])

  useEffect(() => {
    if (!id) return
    async function loadAll() {
      setLoading(true)
      const { data: c, error: cErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id!)
        .single()
      if (cErr) setError(cErr.message)
      else setClient(c as Client)
      await loadVideos()
      setLoading(false)
    }
    loadAll()

    const channel = supabase
      .channel(`videos-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'videos', filter: `client_id=eq.${id}` },
        () => loadVideos(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, loadVideos])

  // Optimistisches Update + Persist
  async function patchVideo(videoId: string, patch: Partial<Video>) {
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, ...patch } : v)))
    const { error } = await supabase.from('videos').update(patch).eq('id', videoId)
    if (error) {
      setError(error.message)
      loadVideos()
    }
  }

  async function addVideo() {
    if (!id) return
    const { error } = await supabase.from('videos').insert({
      client_id: id,
      title: 'Neues Video',
      status: 'todo' as VideoStatus,
      created_by: user?.id ?? null,
    })
    if (error) setError(error.message)
    else loadVideos()
  }

  async function deleteVideo(videoId: string) {
    if (!confirm('Dieses Video wirklich loeschen?')) return
    setVideos((prev) => prev.filter((v) => v.id !== videoId))
    const { error } = await supabase.from('videos').delete().eq('id', videoId)
    if (error) {
      setError(error.message)
      loadVideos()
    }
  }

  if (loading) {
    return <div className="muted">Lade …</div>
  }

  if (!client) {
    return (
      <div className="empty-state">
        <p>Kunde nicht gefunden.</p>
        <Link to="/" className="btn" style={{ marginTop: 12 }}>
          Zurueck zum Dashboard
        </Link>
      </div>
    )
  }

  return (
    <>
      <Link to="/" className="back-link">
        ← Alle Kunden
      </Link>

      <div className="page-head">
        <div>
          <h1>{client.name}</h1>
          <span className="sub">
            {[
              client.handle_ig && `IG @${client.handle_ig.replace(/^@/, '')}`,
              client.handle_tiktok && `TikTok @${client.handle_tiktok.replace(/^@/, '')}`,
            ]
              .filter(Boolean)
              .join('  ·  ') || 'keine Handles hinterlegt'}
          </span>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={addVideo}>
          + Video
        </button>
      </div>

      {client.notes && (
        <div className="error-box" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--text-muted)', marginBottom: 20 }}>
          📝 {client.notes}
        </div>
      )}

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="board">
        {STATUS_ORDER.map((status) => {
          const items = videos.filter((v) => v.status === status)
          return (
            <div className="board-col" key={status}>
              <div className={`col-head status-pill ${status}`} style={{ border: 'none', background: 'transparent', padding: 0 }}>
                <span className="dot" />
                {STATUS_LABELS[status]}
                <span className="col-count">{items.length}</span>
              </div>
              <div className="col-body">
                {items.length === 0 && <div className="col-empty">—</div>}
                {items.map((v) => (
                  <VideoCard
                    key={v.id}
                    video={v}
                    onPatch={(patch) => patchVideo(v.id, patch)}
                    onEdit={() => setEditing(v)}
                    onDelete={() => deleteVideo(v.id)}
                    onCaption={() =>
                      setInfo(
                        'Die Auto-Caption per Claude wird angebunden, sobald der Bunny-Zugang steht und die Edge Function deployt ist. Bis dahin: Caption manuell im Bearbeiten-Dialog eintragen.',
                      )
                    }
                    onUpload={() =>
                      setInfo(
                        'Der Video-Upload (Bunny Storage, verlustfrei) wird im naechsten Schritt angebunden, sobald du den Bunny-Zugang bereitstellst.',
                      )
                    }
                    onDownload={() =>
                      setInfo('Noch keine Datei hinterlegt — Upload folgt mit der Bunny-Anbindung.')
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <EditVideoModal
          video={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await patchVideo(editing.id, patch)
            setEditing(null)
          }}
        />
      )}

      {info && (
        <Modal title="Kommt im naechsten Schritt" onClose={() => setInfo(null)}>
          <p className="muted" style={{ marginBottom: 18 }}>{info}</p>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => setInfo(null)}>
              Verstanden
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

function EditVideoModal({
  video,
  onClose,
  onSave,
}: {
  video: Video
  onClose: () => void
  onSave: (patch: Partial<Video>) => void
}) {
  const [title, setTitle] = useState(video.title)
  const [date, setDate] = useState(video.scheduled_date ?? '')
  const [caption, setCaption] = useState(video.caption ?? '')
  const [notes, setNotes] = useState(video.notes ?? '')

  return (
    <Modal title="Video bearbeiten" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            title: title.trim() || 'Neues Video',
            scheduled_date: date || null,
            caption: caption.trim() || null,
            notes: notes.trim() || null,
          })
        }}
      >
        <div>
          <label htmlFor="vtitle">Titel</label>
          <input id="vtitle" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div>
          <label htmlFor="vdate">Geplantes Datum</label>
          <input id="vdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="vcap">Caption</label>
          <textarea
            id="vcap"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption + Hashtags …"
            style={{ minHeight: 100 }}
          />
        </div>
        <div>
          <label htmlFor="vnotes">Notizen (z. B. „Personen markieren")</label>
          <textarea id="vnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary">
            Speichern
          </button>
        </div>
      </form>
    </Modal>
  )
}
