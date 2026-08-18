import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadLogo } from '../lib/storage'
import type { Client, VideoStatus } from '../lib/types'
import Modal from '../components/Modal'
import LogoFrame from '../components/LogoFrame'

interface ClientWithCount extends Client {
  video_count: number
}

interface UpcomingItem {
  id: string
  title: string
  status: VideoStatus
  scheduled_date: string
  scheduled_time: string | null
  client_name: string
  client_id: string
}

export default function Dashboard() {
  const { user } = useAuth()
  const [clients, setClients] = useState<ClientWithCount[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    setError(null)
    const { data, error } = await supabase
      .from('clients')
      .select('*, videos(count)')
      .order('name', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const mapped: ClientWithCount[] = (data ?? []).map((c: any) => ({
      ...c,
      video_count: c.videos?.[0]?.count ?? 0,
    }))
    setClients(mapped)
    setLoading(false)
  }

  async function loadUpcoming() {
    const { data } = await supabase
      .from('videos')
      .select('id, title, status, scheduled_date, scheduled_time, client_id, clients(name)')
      .in('status', ['ready', 'planned'])
      .not('scheduled_date', 'is', null)
      .order('scheduled_date', { ascending: true })
      .limit(6)
    const mapped: UpcomingItem[] = (data ?? []).map((v: any) => ({
      id: v.id,
      title: v.title,
      status: v.status,
      scheduled_date: v.scheduled_date,
      scheduled_time: v.scheduled_time,
      client_name: v.clients?.name ?? 'Kunde',
      client_id: v.client_id,
    }))
    setUpcoming(mapped)
  }

  useEffect(() => {
    load()
    loadUpcoming()
    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => {
        load()
        loadUpcoming()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="dashboard-intro">
        <h1>Unsere Kunden</h1>
        <p>{loading ? 'Lade …' : 'Kunde antippen, um Videos zu verwalten.'}</p>
      </div>

      {error && (
        <div className="error-box" style={{ maxWidth: 940, margin: '0 auto 20px' }}>
          {error}
        </div>
      )}

      {upcoming.length > 0 && <UpcomingBar items={upcoming} />}

      {!loading && clients.length === 0 && !error && (
        <div className="empty-state">
          <p>Noch keine Kunden angelegt.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ marginTop: 12 }}>
            + Ersten Kunden anlegen
          </button>
        </div>
      )}

      <div className="logo-grid">
        {clients.map((c) => (
          <Link key={c.id} to={`/client/${c.id}`} className="logo-tile">
            <LogoFrame name={c.name} logoUrl={c.logo_url} />
            <div className="tile-body">
              <div className="tile-name">{c.name}</div>
              <div className="tile-meta">
                {c.video_count} {c.video_count === 1 ? 'Video' : 'Videos'}
              </div>
            </div>
          </Link>
        ))}
        {(clients.length > 0 || (!loading && !error)) && (
          <button className="add-tile" onClick={() => setShowAdd(true)}>
            <span style={{ fontSize: 22 }}>+</span>
            Kunde hinzufuegen
          </button>
        )}
      </div>

      {showAdd && (
        <AddClientModal
          userId={user?.id ?? null}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </>
  )
}

function fmtWhen(dateStr: string, time: string | null): { text: string; due: boolean } {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000)
  const dateFmt = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })
  const timeFmt = time ? ' · ' + time.slice(0, 5) + ' Uhr' : ''
  let prefix = ''
  if (diffDays === 0) prefix = 'Heute · '
  else if (diffDays === 1) prefix = 'Morgen · '
  return { text: prefix + dateFmt + timeFmt, due: diffDays <= 1 }
}

function UpcomingBar({ items }: { items: UpcomingItem[] }) {
  return (
    <div className="upcoming">
      <h2>⏰ Anstehende Posts</h2>
      {items.map((it) => {
        const when = fmtWhen(it.scheduled_date, it.scheduled_time)
        return (
          <Link
            key={it.id}
            to={`/client/${it.client_id}`}
            className="upcoming-row"
            style={{ color: 'inherit' }}
          >
            <span className={`upcoming-when ${when.due ? 'due' : ''}`}>{when.text}</span>
            <span style={{ fontWeight: 600 }}>{it.title}</span>
            <span className="upcoming-client">· {it.client_name}</span>
          </Link>
        )
      })}
    </div>
  )
}

function AddClientModal({
  userId,
  onClose,
  onSaved,
}: {
  userId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [ig, setIg] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [notes, setNotes] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
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
      let logo_url: string | null = null
      if (logoFile) logo_url = await uploadLogo(logoFile)
      const { error } = await supabase.from('clients').insert({
        name: name.trim(),
        logo_url,
        handle_ig: ig.trim() || null,
        handle_tiktok: tiktok.trim() || null,
        notes: notes.trim() || null,
        created_by: userId,
      })
      if (error) throw error
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Fehler beim Speichern')
      setBusy(false)
    }
  }

  return (
    <Modal title="Neuen Kunden anlegen" onClose={onClose}>
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
          <label htmlFor="cname">Name *</label>
          <input id="cname" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="cig">Instagram-Handle</label>
            <input id="cig" value={ig} onChange={(e) => setIg(e.target.value)} placeholder="restaurant_xy" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="ctt">TikTok-Handle</label>
            <input id="ctt" value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="restaurant_xy" />
          </div>
        </div>
        <div>
          <label htmlFor="cnotes">Notizen</label>
          <textarea id="cnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Speichere …' : 'Anlegen'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
