import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadLogo } from '../lib/storage'
import type { Client, VideoStatus } from '../lib/types'
import Modal from '../components/Modal'
import LogoFrame from '../components/LogoFrame'
import LogoCropper from '../components/LogoCropper'

interface ClientWithCount extends Client {
  video_count: number
}

// Tage bis Vertragsende (negativ = abgelaufen); null = kein Vertrag hinterlegt
function contractDaysLeft(end: string | null | undefined): number | null {
  if (!end) return null
  const d = new Date(end + 'T00:00:00')
  const n = new Date(); n.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - n.getTime()) / 86400000)
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
  const [postedMonth, setPostedMonth] = useState<Record<string, number>>({})
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
      .is('deleted_at', null)
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

  async function loadPostedMonth() {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const { data } = await supabase
      .from('videos')
      .select('client_id')
      .is('deleted_at', null)
      .gte('posted_at', monthStart)
    const map: Record<string, number> = {}
    for (const v of (data ?? []) as any[]) map[v.client_id] = (map[v.client_id] ?? 0) + 1
    setPostedMonth(map)
  }

  useEffect(() => {
    load()
    loadUpcoming()
    loadPostedMonth()
    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => {
        load()
        loadUpcoming()
        loadPostedMonth()
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
            {c.health && <span className={`health-dot ${c.health}`} title={`Status: ${c.health}`} />}
            <LogoFrame name={c.name} logoUrl={c.logo_url} />
            <div className="tile-body">
              <div className="tile-name">{c.name}</div>
              <div className="tile-meta">
                {c.monthly_quota
                  ? <span className={`quota-chip ${(postedMonth[c.id] ?? 0) >= c.monthly_quota ? 'done' : ''}`}>🎬 {postedMonth[c.id] ?? 0}/{c.monthly_quota} · Monat</span>
                  : <>{c.video_count} {c.video_count === 1 ? 'Video' : 'Videos'}</>}
                {(() => {
                  const dl = contractDaysLeft(c.contract_end)
                  if (dl === null || dl > 30) return null
                  if (dl < 0) return <span className="contract-chip expired">⚠ Vertrag abgelaufen</span>
                  return <span className="contract-chip soon">⏳ Vertrag endet {dl === 0 ? 'heute' : dl === 1 ? 'morgen' : `in ${dl} Tg`}</span>
                })()}
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
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [ig, setIg] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [quota, setQuota] = useState('')
  const [contractEnd, setContractEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCropFile(file) // erst zuschneiden
    e.target.value = ''
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      let logo_url: string | null = null
      if (logoFile) logo_url = await uploadLogo(logoFile)
      const payload: Record<string, any> = {
        name: name.trim(),
        logo_url,
        handle_ig: ig.trim() || null,
        handle_tiktok: tiktok.trim() || null,
        monthly_quota: quota ? Number(quota) : null,
        contract_end: contractEnd || null,
        notes: notes.trim() || null,
        created_by: userId,
      }
      // schema-sicher: falls contract_end-Spalte noch fehlt, ohne sie erneut versuchen
      let res = await supabase.from('clients').insert(payload).select('id').single()
      if (res.error && (res.error.code === 'PGRST204' || /contract_end|schema cache/i.test(res.error.message))) {
        const { contract_end, ...rest } = payload
        res = await supabase.from('clients').insert(rest).select('id').single()
      }
      if (res.error) throw res.error
      onSaved()
      // Direkt weiter zum Content-Plan-Schritt beim neuen Kunden
      const newId = (res.data as any)?.id
      if (newId) navigate(`/client/${newId}?onboard=1`)
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
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="cquota">Videos pro Monat</label>
            <input id="cquota" value={quota} onChange={(e) => setQuota(e.target.value)} inputMode="numeric" placeholder="z. B. 10" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="cend">Vertragsende <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <input id="cend" type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="cnotes">Notizen</label>
          <textarea id="cnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="info-box" style={{ fontSize: 13 }}>
          Nach dem Anlegen schlagen wir dir direkt einen <b>Content-Plan</b> vor (gleichmäßiger Rhythmus passend zu den Videos/Monat) — du kannst ihn dort anpassen.
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Speichere …' : 'Anlegen & weiter'}
          </button>
        </div>
      </form>
      {cropFile && (
        <LogoCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(cropped) => {
            setLogoFile(cropped)
            setLogoPreview(URL.createObjectURL(cropped))
            setCropFile(null)
          }}
        />
      )}
    </Modal>
  )
}
