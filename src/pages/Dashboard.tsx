import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Client } from '../lib/types'
import Modal from '../components/Modal'

interface ClientWithCount extends Client {
  video_count: number
}

export default function Dashboard() {
  const { user } = useAuth()
  const [clients, setClients] = useState<ClientWithCount[]>([])
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

  useEffect(() => {
    load()
    // Live-Sync: bei jeder Aenderung an clients neu laden
    const channel = supabase
      .channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kunden</h1>
          <span className="sub">
            {loading ? 'Lade …' : `${clients.length} ${clients.length === 1 ? 'Kunde' : 'Kunden'}`}
          </span>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          + Kunde
        </button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      {!loading && clients.length === 0 && !error && (
        <div className="empty-state">
          <p>Noch keine Kunden angelegt.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ marginTop: 12 }}>
            + Ersten Kunden anlegen
          </button>
        </div>
      )}

      <div className="card-grid">
        {clients.map((c) => (
          <Link key={c.id} to={`/client/${c.id}`} className="client-card">
            <h3>{c.name}</h3>
            <div className="handles">
              {c.handle_ig && <span className="chip">IG @{c.handle_ig.replace(/^@/, '')}</span>}
              {c.handle_tiktok && <span className="chip">TT @{c.handle_tiktok.replace(/^@/, '')}</span>}
              {!c.handle_ig && !c.handle_tiktok && <span className="chip">keine Handles</span>}
            </div>
            <div className="meta">
              <span>
                <b>{c.video_count}</b> {c.video_count === 1 ? 'Video' : 'Videos'}
              </span>
            </div>
          </Link>
        ))}
        {clients.length > 0 && (
          <button className="add-card" onClick={() => setShowAdd(true)}>
            + Kunde hinzufuegen
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('clients').insert({
      name: name.trim(),
      handle_ig: ig.trim() || null,
      handle_tiktok: tiktok.trim() || null,
      notes: notes.trim() || null,
      created_by: userId,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal title="Neuen Kunden anlegen" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <div className="error-box">{error}</div>}
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
