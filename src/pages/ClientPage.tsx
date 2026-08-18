import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadLogo } from '../lib/storage'
import {
  STATUS_LABELS,
  STATUS_ORDER,
  type Client,
  type Video,
  type VideoStatus,
} from '../lib/types'
import VideoCard from '../components/VideoCard'
import LogoFrame from '../components/LogoFrame'
import Modal from '../components/Modal'

export default function ClientPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Video | null>(null)
  const [linking, setLinking] = useState<Video | null>(null)
  const [editClient, setEditClient] = useState(false)
  const [creating, setCreating] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  const loadClient = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).single()
    if (error) setError(error.message)
    else setClient(data as Client)
  }, [id])

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
      await Promise.all([loadClient(), loadVideos()])
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
  }, [id, loadClient, loadVideos])

  async function patchVideo(videoId: string, patch: Partial<Video>) {
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, ...patch } : v)))
    const { error } = await supabase.from('videos').update(patch).eq('id', videoId)
    if (error) {
      setError(error.message)
      loadVideos()
    }
  }

  async function createIdea(fields: {
    title: string
    scheduled_date: string | null
    scheduled_time: string | null
    caption: string | null
    notes: string | null
  }) {
    if (!id) return
    const { error } = await supabase.from('videos').insert({
      client_id: id,
      title: fields.title,
      status: 'todo' as VideoStatus,
      scheduled_date: fields.scheduled_date,
      scheduled_time: fields.scheduled_time,
      caption: fields.caption,
      notes: fields.notes,
      created_by: user?.id ?? null,
    })
    if (error) setError(error.message)
    else {
      setCreating(false)
      loadVideos()
    }
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

  if (loading) return <div className="muted">Lade …</div>

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

      <div className="page-head" style={{ alignItems: 'center' }}>
        <LogoFrame name={client.name} logoUrl={client.logo_url} />
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
        <button className="btn btn-sm btn-ghost" onClick={() => setEditClient(true)}>
          Kunde bearbeiten
        </button>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Idee
        </button>
      </div>

      {client.notes && (
        <div className="info-box" style={{ marginBottom: 20 }}>
          📝 {client.notes}
        </div>
      )}

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="board">
        {STATUS_ORDER.map((status) => {
          const items = videos.filter((v) => v.status === status)
          return (
            <div className="board-col" key={status}>
              <div
                className={`col-head status-pill ${status}`}
                style={{ border: 'none', background: 'transparent', padding: 0 }}
              >
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
                    onLink={() => setLinking(v)}
                    onCaption={() =>
                      setInfo(
                        'Die Auto-Caption per Claude wird spaeter angebunden. Bis dahin: Caption einfach im Bearbeiten-Dialog eintragen.',
                      )
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

      {creating && (
        <NewIdeaModal onClose={() => setCreating(false)} onSave={createIdea} />
      )}

      {linking && (
        <LinkModal
          video={linking}
          onClose={() => setLinking(null)}
          onSave={async (url) => {
            await patchVideo(linking.id, { video_url: url })
            setLinking(null)
          }}
        />
      )}

      {editClient && (
        <EditClientModal
          client={client}
          onClose={() => setEditClient(false)}
          onSaved={async () => {
            setEditClient(false)
            await loadClient()
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

function LinkModal({
  video,
  onClose,
  onSave,
}: {
  video: Video
  onClose: () => void
  onSave: (url: string | null) => void
}) {
  const [url, setUrl] = useState(video.video_url ?? '')

  return (
    <Modal title="Video-Link" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(url.trim() || null)
        }}
      >
        <p className="info-box">
          Teilen-Link zur fertigen Videodatei einfügen (iCloud, Drive, Dropbox …).
          Tipp fürs Original in voller Qualität: in iCloud „Datei teilen" → „Jeder mit
          Link" → am besten ohne Ablaufdatum.
        </p>
        <div>
          <label htmlFor="vurl">Link</label>
          <input
            id="vurl"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.icloud.com/…"
            autoFocus
          />
        </div>
        <div className="modal-actions">
          {video.video_url && (
            <button type="button" className="btn btn-danger" onClick={() => onSave(null)}>
              Link entfernen
            </button>
          )}
          <div className="spacer" />
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

interface IdeaFields {
  title: string
  scheduled_date: string | null
  scheduled_time: string | null
  caption: string | null
  notes: string | null
}

function NewIdeaModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (fields: IdeaFields) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [caption, setCaption] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <Modal title="Neue Idee anlegen" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          onSave({
            title: title.trim(),
            scheduled_date: date || null,
            scheduled_time: time || null,
            caption: caption.trim() || null,
            notes: notes.trim() || null,
          })
        }}
      >
        <p className="info-box">
          Erst die Idee festhalten — das Video lädst du später direkt auf der Karte hoch.
        </p>
        <div>
          <label htmlFor="ititle">Titel / Idee *</label>
          <input
            id="ititle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Pasta-Zubereitung hinter der Theke"
            autoFocus
            required
          />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="idate">Posting-Datum</label>
            <input id="idate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="itime">Posting-Uhrzeit</label>
            <input id="itime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="icap">Caption (optional)</label>
          <textarea
            id="icap"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Kommt oft erst später dazu …"
          />
        </div>
        <div>
          <label htmlFor="inotes">Notizen (optional)</label>
          <textarea id="inotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z. B. Personen markieren, Musik-Trend XY" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
            Idee anlegen
          </button>
        </div>
      </form>
    </Modal>
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
  const [time, setTime] = useState(video.scheduled_time ? video.scheduled_time.slice(0, 5) : '')
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
            scheduled_time: time || null,
            caption: caption.trim() || null,
            notes: notes.trim() || null,
          })
        }}
      >
        <div>
          <label htmlFor="vtitle">Titel / Idee</label>
          <input id="vtitle" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="vdate">Posting-Datum</label>
            <input id="vdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="vtime">Posting-Uhrzeit</label>
            <input id="vtime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
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

function EditClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(client.name)
  const [ig, setIg] = useState(client.handle_ig ?? '')
  const [tiktok, setTiktok] = useState(client.handle_tiktok ?? '')
  const [notes, setNotes] = useState(client.notes ?? '')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(client.logo_url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      let logo_url = client.logo_url
      if (logoFile) logo_url = await uploadLogo(logoFile)
      const { error } = await supabase
        .from('clients')
        .update({
          name: name.trim(),
          logo_url,
          handle_ig: ig.trim() || null,
          handle_tiktok: tiktok.trim() || null,
          notes: notes.trim() || null,
        })
        .eq('id', client.id)
      if (error) throw error
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Fehler beim Speichern')
      setBusy(false)
    }
  }

  return (
    <Modal title="Kunde bearbeiten" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <div className="error-box">{error}</div>}

        <div>
          <label>Logo</label>
          <div className="logo-upload">
            <div className="preview">
              {logoPreview ? <img src={logoPreview} alt="Vorschau" /> : <span className="muted" style={{ fontSize: 11 }}>kein Logo</span>}
            </div>
            <label className="btn btn-sm" style={{ margin: 0, textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
              Logo waehlen
              <input type="file" accept="image/*" onChange={onPickLogo} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="ecname">Name *</label>
          <input id="ecname" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="ecig">Instagram-Handle</label>
            <input id="ecig" value={ig} onChange={(e) => setIg(e.target.value)} placeholder="restaurant_xy" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="ectt">TikTok-Handle</label>
            <input id="ectt" value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="restaurant_xy" />
          </div>
        </div>
        <div>
          <label htmlFor="ecnotes">Notizen</label>
          <textarea id="ecnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Speichere …' : 'Speichern'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
