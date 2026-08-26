import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadLogo } from '../lib/storage'
import {
  STATUS_LABELS,
  STATUS_ORDER,
  type Client,
  type Video,
  type VideoStatus,
  type VideoIdea,
  type Inspiration,
} from '../lib/types'
import VideoCard from '../components/VideoCard'
import LogoFrame from '../components/LogoFrame'
import LogoCropper from '../components/LogoCropper'
import Modal from '../components/Modal'
import ActivityLog from '../components/ActivityLog'
import Spinner from '../components/Spinner'
import { generateCaption } from '../lib/caption'
import { generateIdeas } from '../lib/ideas'
import { usePointerBoard } from '../lib/usePointerBoard'
import { celebrate } from '../lib/confetti'
import NudgeModal from '../components/NudgeModal'
import RepeatPicker from '../components/RepeatPicker'
import { occurrences, recommendedIntervalDays, type RepeatRule } from '../lib/recurrence'
import { insertRows, updateRow } from '../lib/db'
import { useCategories } from '../context/CategoryContext'
import LineChart, { type Series } from '../components/LineChart'
import SwipeRow from '../components/SwipeRow'
import InspirationCard from '../components/InspirationCard'
import { useToast } from '../context/ToastContext'

type ClientTab = 'board' | 'pool' | 'analyse' | 'inspiration'

export default function ClientPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { toast } = useToast()
  const [client, setClient] = useState<Client | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Video | null>(null)
  const [linking, setLinking] = useState<Video | null>(null)
  // Pro Spalte werden nur die naechsten 3 gezeigt; aufgeklappt alle.
  const [openCols, setOpenCols] = useState<Record<string, boolean>>({})
  const [captioning, setCaptioning] = useState<Video | null>(null)
  const [editClient, setEditClient] = useState(false)
  const [creating, setCreating] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [tab, setTab] = useState<ClientTab>('board')
  const [ideas, setIdeas] = useState<VideoIdea[]>([])
  const [inspirations, setInspirations] = useState<Inspiration[]>([])
  const [nudging, setNudging] = useState<Video | null>(null)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [growthOpen, setGrowthOpen] = useState(false)
  const [stats, setStats] = useState<any[]>([])
  const [flashId, setFlashId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

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
      .order('created_at', { ascending: true })
    if (error) {
      setError(error.message)
      return
    }
    // Papierkorb clientseitig ausblenden (robust, falls Spalte fehlt)
    setVideos((data ?? []).filter((v: any) => !v.deleted_at) as Video[])
  }, [id])

  const loadIdeas = useCallback(async () => {
    if (!id) return
    // Ideenspeicher; still robust falls Tabelle noch fehlt (Skript 8)
    const { data, error } = await supabase
      .from('video_ideas')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
    if (error) return
    setIdeas((data ?? []).filter((i: any) => !i.deleted_at && !i.moved_video_id) as VideoIdea[])
  }, [id])

  const loadInspirations = useCallback(async () => {
    if (!id) return
    // Inspirationen dieses Kunden; still robust, falls die Tabelle noch
    // fehlt (SQL-Skript 23 nicht eingespielt).
    const { data, error } = await supabase
      .from('inspirations')
      .select('*')
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) return
    setInspirations((data ?? []) as unknown as Inspiration[])
  }, [id])

  const loadStats = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase
      .from('client_stats')
      .select('*')
      .eq('client_id', id)
      .order('captured_on', { ascending: true })
    if (!error) setStats(data ?? [])
  }, [id])

  useEffect(() => {
    if (!id) return
    async function loadAll() {
      setLoading(true)
      await Promise.all([loadClient(), loadVideos(), loadIdeas(), loadStats(), loadInspirations()])
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_ideas', filter: `client_id=eq.${id}` },
        () => loadIdeas(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inspirations', filter: `client_id=eq.${id}` },
        () => loadInspirations(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, loadClient, loadVideos, loadIdeas, loadStats, loadInspirations])

  // Deep-Link (?video=<id>) aus einem Anstupser: zur Karte springen + hervorheben
  useEffect(() => {
    const focus = searchParams.get('video')
    if (loading || !focus) return
    if (!videos.some((v) => v.id === focus)) return
    setTab('board')
    setFlashId(focus)
    const t = setTimeout(() => {
      document.getElementById(`vid-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    const clear = setTimeout(() => setFlashId(null), 2800)
    // Parameter entfernen, damit ein Reload nicht erneut springt
    searchParams.delete('video')
    setSearchParams(searchParams, { replace: true })
    return () => {
      clearTimeout(t)
      clearTimeout(clear)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, videos])

  // Deep-Link (?tab=inspiration) — z. B. nach dem Merken einer Inspiration.
  // Haengt bewusst an searchParams: der Sprung kann auch auf der schon
  // geoeffneten Kundenseite passieren, dann wird die Seite nicht neu geladen.
  useEffect(() => {
    const t = searchParams.get('tab')
    if (!t) return
    if (t === 'inspiration' || t === 'pool' || t === 'analyse' || t === 'board') setTab(t)
    searchParams.delete('tab')
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Onboarding (?onboard=1): direkt den Content-Plan-Schritt öffnen
  useEffect(() => {
    if (loading || !client) return
    if (searchParams.get('onboard') !== '1') return
    setSeriesOpen(true)
    searchParams.delete('onboard')
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, client])

  async function patchVideo(videoId: string, patch: Partial<Video>) {
    // Wechsel auf "Gepostet" -> feiern + Zeitstempel setzen (echte Post-Statistik)
    const before = videos.find((v) => v.id === videoId)
    let p: Partial<Video> = patch
    if (patch.status === 'posted' && before && before.status !== 'posted') {
      p = { ...patch, posted_at: new Date().toISOString() }
      celebrate()
      toast('Gepostet — stark! 🎉')
    }
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, ...p } : v)))
    const { error } = await updateRow('videos', p as Record<string, any>, 'id', videoId)
    if (error) {
      setError(error.message)
      loadVideos()
    }
  }

  // Reihenfolge im Board ist immer fix nach Postingdatum (nächster Termin oben) —
  // kein Datum landet ganz hinten. So bleibt die Liste übersichtlich und lässt
  // sich nicht mehr aus Versehen durcheinanderbringen.
  function orderVal(v: Video) {
    return v.scheduled_date ? new Date(v.scheduled_date + 'T00:00:00').getTime() : Infinity
  }

  // Drag & Drop (Finger/Maus): Video nur zwischen Spalten (Status) verschieben —
  // die Position innerhalb einer Spalte lässt sich nicht mehr manuell setzen.
  async function moveVideo(videoId: string, targetStatus: string, _beforeId: string | null) {
    const dragged = videos.find((v) => v.id === videoId)
    if (!dragged || dragged.status === targetStatus) return
    await patchVideo(videoId, { status: targetStatus as VideoStatus })
  }

  const { dragId, drop, startDrag } = usePointerBoard(moveVideo)

  async function deleteInspiration(inspId: string) {
    setInspirations((prev) => prev.filter((i) => i.id !== inspId))
    await supabase.from('inspirations').update({ deleted_at: new Date().toISOString() }).eq('id', inspId)
    toast('In den Papierkorb', {
      label: 'Rückgängig',
      onClick: async () => { await supabase.from('inspirations').update({ deleted_at: null }).eq('id', inspId); loadInspirations() },
    })
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
    // Soft-Delete -> Papierkorb, mit Undo
    setVideos((prev) => prev.filter((v) => v.id !== videoId))
    const { error } = await supabase
      .from('videos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', videoId)
    if (error) {
      setError(error.message)
      loadVideos()
      return
    }
    toast('In den Papierkorb', {
      label: 'Rückgängig',
      onClick: async () => {
        await supabase.from('videos').update({ deleted_at: null }).eq('id', videoId)
        loadVideos()
      },
    })
  }

  // ---------- Ideenspeicher ----------
  async function addPoolIdeas(rows: { title: string; notes: string | null; source: 'manual' | 'ai' }[]) {
    if (!id || rows.length === 0) return
    const { error } = await supabase.from('video_ideas').insert(
      rows.map((r) => ({ client_id: id, title: r.title, notes: r.notes, source: r.source, created_by: user?.id ?? null })),
    )
    if (error) setError(error.message)
    else loadIdeas()
  }

  async function deletePoolIdea(ideaId: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== ideaId))
    const { error } = await supabase
      .from('video_ideas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ideaId)
    if (error) {
      loadIdeas()
      return
    }
    toast('In den Papierkorb', {
      label: 'Rückgängig',
      onClick: async () => {
        await supabase.from('video_ideas').update({ deleted_at: null }).eq('id', ideaId)
        loadIdeas()
      },
    })
  }

  // Idee aus dem Speicher ins Board holen -> wird echtes Video (Zu bearbeiten)
  async function moveIdeaToBoard(idea: VideoIdea) {
    if (!id) return
    setIdeas((prev) => prev.filter((i) => i.id !== idea.id))
    const { data, error } = await supabase
      .from('videos')
      .insert({
        client_id: id,
        title: idea.title,
        status: 'todo' as VideoStatus,
        notes: idea.notes,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()
    if (error) {
      setError(error.message)
      loadIdeas()
      return
    }
    await supabase.from('video_ideas').update({ moved_video_id: data.id }).eq('id', idea.id)
    loadVideos()
    loadIdeas()
    toast('Ins Board übernommen ✓', {
      label: 'Zurück in den Speicher',
      onClick: async () => {
        await supabase.from('videos').update({ deleted_at: new Date().toISOString() }).eq('id', data.id)
        await supabase.from('video_ideas').update({ moved_video_id: null }).eq('id', idea.id)
        loadVideos()
        loadIdeas()
      },
    })
  }

  async function createSeries(rows: { title: string; scheduled_date: string; scheduled_time: string | null }[]) {
    if (!id || rows.length === 0) return
    const series_id = crypto.randomUUID()
    const { error } = await insertRows('videos',
      rows.map((r) => ({ client_id: id, title: r.title, status: 'todo' as VideoStatus, scheduled_date: r.scheduled_date, scheduled_time: r.scheduled_time, series_id, created_by: user?.id ?? null })),
    )
    if (error) { setError(error.message); return }
    setSeriesOpen(false)
    loadVideos()
    toast(`${rows.length} Videos angelegt ✓`)
  }

  const monthKey = new Date().toISOString().slice(0, 7)
  const postedMonthVideos = videos.filter((v) => (v.posted_at ?? '').slice(0, 7) === monthKey)
  const postedThisMonth = postedMonthVideos.length
  const reachThisMonth = postedMonthVideos.reduce((s, v) => s + (v.reach ?? v.views ?? 0), 0)

  // „Gepostet" ist eine 24-h-Leiste: heute gepostete bleiben bis Mitternacht, danach fallen sie vom Board.
  const isToday = (ts: string | null) => {
    if (!ts) return false
    const d = new Date(ts), n = new Date()
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  }
  const boardVideos = videos.filter((v) => v.status !== 'posted' || isToday(v.posted_at))
  // Analyse: alle geposteten Videos dieses Kunden — dauerhaft, neueste zuerst
  const postedVideos = videos.filter((v) => v.status === 'posted').sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''))

  if (loading) return <Spinner />

  if (!client) {
    return (
      <div className="empty-state">
        <p>Kunde nicht gefunden.</p>
        <Link to="/kunden" className="btn" style={{ marginTop: 12 }}>
          Zurueck zu den Kunden
        </Link>
      </div>
    )
  }

  return (
    <>
      <Link to="/kunden" className="back-link">
        ← Alle Kunden
      </Link>

      <div className="page-head client-head-anim" style={{ alignItems: 'center' }}>
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
        <button className="btn btn-sm" onClick={() => setSeriesOpen(true)}>
          📅 Content-Plan
        </button>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Idee
        </button>
      </div>

      <ClientCockpit client={client} postedThisMonth={postedThisMonth} reachThisMonth={reachThisMonth} stats={stats} />

      <GrowthSection stats={stats} onAdd={() => setGrowthOpen(true)} />

      {client.notes && (
        <div className="info-box" style={{ marginBottom: 20 }}>
          📝 {client.notes}
        </div>
      )}

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="seg client-tabs">
        <button className={`seg-btn ${tab === 'board' ? 'on' : ''}`} onClick={() => setTab('board')}>
          🎬 In Umsetzung
          <span className="col-count">{boardVideos.length}</span>
        </button>
        <button className={`seg-btn ${tab === 'pool' ? 'on' : ''}`} onClick={() => setTab('pool')}>
          💡 Ideenspeicher
          <span className="col-count">{ideas.length}</span>
        </button>
        <button className={`seg-btn ${tab === 'inspiration' ? 'on' : ''}`} onClick={() => setTab('inspiration')}>
          🔖 Inspiration
          <span className="col-count">{inspirations.length}</span>
        </button>
        <button className={`seg-btn ${tab === 'analyse' ? 'on' : ''}`} onClick={() => setTab('analyse')}>
          📊 Analyse
          <span className="col-count">{postedVideos.length}</span>
        </button>
      </div>

      {tab === 'board' && (
      <div className="board">
        {(() => {
          const draggedStatus = dragId ? videos.find((v) => v.id === dragId)?.status : null
          const laneChanging = !!drop && !!draggedStatus && drop.lane !== draggedStatus
          return STATUS_ORDER.map((status) => {
          const items = boardVideos
            .filter((v) => v.status === status)
            .sort((a, b) => orderVal(a) - orderVal(b))
          // Nur die naechsten 3 — beim Ziehen immer alle, sonst kann man
          // nicht auf eine verdeckte Position ablegen.
          const expanded = !!openCols[status] || !!dragId
          const shown = expanded ? items : items.slice(0, 3)
          const rest = items.length - shown.length
          return (
            <div
              className={`board-col ${drop?.lane === status && dragId ? 'drop-active' : ''}`}
              key={status}
              data-lane={status}
            >
              <div
                className={`col-head status-pill ${status}`}
                style={{ border: 'none', background: 'transparent', padding: 0 }}
              >
                <span className="dot" />
                {STATUS_LABELS[status]}
                <span className="col-count">{items.length}</span>
              </div>
              <div className="col-body">
                {items.length === 0 && (
                  <div className="col-empty">{dragId ? 'hierher ziehen' : 'noch nichts'}</div>
                )}
                {shown.map((v) => (
                  <div
                    key={v.id}
                    id={`vid-${v.id}`}
                    data-card={v.id}
                    className={`drag-wrap ${dragId === v.id ? 'ghost-source' : ''} ${flashId === v.id ? 'flash' : ''}`}
                  >
                    {laneChanging && drop?.lane === status && drop.beforeId === v.id && <div className="drop-line" />}
                    <div
                      className="vc-grip"
                      data-drag-handle
                      title="In eine andere Spalte ziehen"
                      onPointerDown={(e) => startDrag(e, v.id, status)}
                    >
                      <span /><span /><span />
                    </div>
                    <VideoCard
                      video={v}
                      onPatch={(patch) => patchVideo(v.id, patch)}
                      onEdit={() => setEditing(v)}
                      onDelete={() => deleteVideo(v.id)}
                      onLink={() => setLinking(v)}
                      onCaption={() => setCaptioning(v)}
                      onNudge={() => setNudging(v)}
                    />
                  </div>
                ))}
                {laneChanging && drop?.lane === status && drop.beforeId === null && <div className="drop-line" />}
                {items.length > 3 && !dragId && (
                  <button
                    type="button"
                    className="col-more"
                    onClick={() => setOpenCols((o) => ({ ...o, [status]: !o[status] }))}
                  >
                    {expanded
                      ? <>▴ Weniger zeigen</>
                      : <>▾ Alle {items.length} zeigen <span className="col-more-rest">+{rest}</span></>}
                  </button>
                )}
              </div>
            </div>
          )
          })
        })()}
      </div>
      )}

      {tab === 'pool' && (
        <IdeaPool
          client={client}
          ideas={ideas}
          onAdd={addPoolIdeas}
          onMove={moveIdeaToBoard}
          onDelete={deletePoolIdea}
          onEditClient={() => setEditClient(true)}
        />
      )}

      {tab === 'inspiration' && (
        <div className="pool-anim">
          <div className="info-box" style={{ marginBottom: 16 }}>
            🔖 Fremde Videos, die ihr für <strong>{client.name}</strong> so ähnlich machen wollt.
            Link aus TikTok oder Instagram einfügen — die Zahlen holen wir automatisch dazu.
          </div>

          <div className="toolbar-row">
            <div className="spacer" />
            <button
              className="btn btn-primary"
              onClick={() => window.dispatchEvent(new CustomEvent('open-quickadd', { detail: { type: 'inspiration', clientId: client.id } }))}
            >
              + Inspiration
            </button>
          </div>

          {inspirations.length === 0 ? (
            <div className="col-empty" style={{ padding: 30 }}>
              Noch nichts gemerkt. Link kopieren, oben auf „+ Inspiration“. 🔖
            </div>
          ) : (
            <div className="insp-grid">
              {inspirations.map((i) => (
                <InspirationCard key={i.id} item={i} onDelete={() => deleteInspiration(i.id)} />
              ))}
            </div>
          )}

          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Alle Inspirationen — auch die ohne Kunden — findest du unter <strong>Mehr → Inspirationen</strong>.
          </p>
        </div>
      )}

      {tab === 'analyse' && (
        <AnalyseSection videos={postedVideos} onEdit={(v) => setEditing(v)} onDelete={deleteVideo} />
      )}

      {editing && (
        <EditVideoModal
          video={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await patchVideo(editing.id, patch)
            setEditing(null)
          }}
          onDeleteSeries={async () => {
            if (!editing.series_id) return
            if (!confirm('Die ganze Serie (alle noch offenen Karten dieser Wiederholung) in den Papierkorb legen?')) return
            await supabase.from('videos').update({ deleted_at: new Date().toISOString() }).eq('series_id', editing.series_id).is('deleted_at', null)
            setEditing(null)
            loadVideos()
            toast('Serie in den Papierkorb ✓')
          }}
        />
      )}

      {tab === 'board' && (
        <div className="section-block">
          <h2 className="section-title">Verlauf</h2>
          <ActivityLog clientId={client.id} />
        </div>
      )}

      {creating && (
        <NewIdeaModal onClose={() => setCreating(false)} onSave={createIdea} />
      )}

      {nudging && (
        <NudgeModal
          defaultBody={`„${nudging.title}" ist fertig – kannst du posten? 🎬`}
          link={`/client/${client.id}?video=${nudging.id}`}
          onClose={() => setNudging(null)}
        />
      )}

      {seriesOpen && (
        <SeriesModal
          onClose={() => setSeriesOpen(false)}
          onCreate={createSeries}
          quota={client.monthly_quota ?? 0}
          recommendDays={recommendedIntervalDays(client.monthly_quota ?? 0)}
          defaultUntil={client.contract_end ?? null}
        />
      )}

      {growthOpen && (
        <GrowthModal
          clientId={client.id}
          onClose={() => setGrowthOpen(false)}
          onSaved={() => { setGrowthOpen(false); loadStats(); toast('Wachstum erfasst ✓') }}
        />
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

      {captioning && (
        <CaptionModal
          video={captioning}
          client={client}
          onClose={() => setCaptioning(null)}
          onApply={async (caption) => {
            await patchVideo(captioning.id, { caption })
            setCaptioning(null)
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

function CaptionModal({
  video,
  client,
  onClose,
  onApply,
}: {
  video: Video
  client: Client
  onClose: () => void
  onApply: (caption: string) => void
}) {
  const [description, setDescription] = useState('')
  const [extra, setExtra] = useState('')
  const [result, setResult] = useState(video.caption ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate() {
    if (!description.trim()) return
    setBusy(true)
    setError(null)
    try {
      const caption = await generateCaption(video, client, description.trim(), extra.trim())
      setResult(caption)
    } catch (err: any) {
      setError(err.message ?? 'Fehler bei der Caption-Erstellung')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal title="✨ Auto-Caption" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          generate()
        }}
      >
        {error && <div className="error-box">{error}</div>}
        <div>
          <label>Beschreib das Video in einem Satz *</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="z. B. Frische Pasta wird vor Gästen an der Theke gemacht"
            autoFocus
          />
        </div>
        <div>
          <label>Zusatzwunsch (optional)</label>
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="z. B. lustiger Ton, oder Aktion erwähnen"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !description.trim()}>
          {busy ? 'Claude schreibt …' : result ? 'Neu generieren' : '✨ Caption generieren'}
        </button>

        {result && (
          <div>
            <label>Ergebnis (frei editierbar)</label>
            <textarea value={result} onChange={(e) => setResult(e.target.value)} style={{ minHeight: 150 }} />
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          {result && (
            <>
              <button type="button" className="btn" onClick={copy}>
                {copied ? '✓ Kopiert' : 'Kopieren'}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => onApply(result.trim())}>
                In Caption übernehmen
              </button>
            </>
          )}
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

// Summe zweier Eingabefelder als Text — leer bleibt leer
function sumPair(a: string, b: string): string {
  const x = a.trim() === '' ? null : Number(a.replace(/[^\d]/g, ''))
  const y = b.trim() === '' ? null : Number(b.replace(/[^\d]/g, ''))
  if (x == null && y == null) return ''
  return String((x ?? 0) + (y ?? 0))
}

function EditVideoModal({
  video,
  onClose,
  onSave,
  onDeleteSeries,
}: {
  video: Video
  onClose: () => void
  onSave: (patch: Partial<Video>) => void
  onDeleteSeries: () => void
}) {
  const [title, setTitle] = useState(video.title)
  const [date, setDate] = useState(video.scheduled_date ?? '')
  const [time, setTime] = useState(video.scheduled_time ? video.scheduled_time.slice(0, 5) : '')
  const [caption, setCaption] = useState(video.caption ?? '')
  const [notes, setNotes] = useState(video.notes ?? '')
  const [views, setViews] = useState(video.views != null ? String(video.views) : '')
  const [likes, setLikes] = useState(video.likes != null ? String(video.likes) : '')
  const [comments, setComments] = useState(video.comments != null ? String(video.comments) : '')
  const [reach, setReach] = useState(video.reach != null ? String(video.reach) : '')
  // Getrennt pro Plattform — damit sichtbar ist, welche Zahlen woher stammen
  const st = (v: number | null | undefined) => (v != null ? String(v) : '')
  const [igStats, setIgStats] = useState({
    views: st(video.views_ig), likes: st(video.likes_ig),
    comments: st(video.comments_ig), shares: st(video.shares_ig),
  })
  const [ttStats, setTtStats] = useState({
    views: st(video.views_tiktok), likes: st(video.likes_tiktok),
    comments: st(video.comments_tiktok), shares: st(video.shares_tiktok),
  })
  const [ttUrl, setTtUrl] = useState(video.tiktok_url ?? '')
  const [igUrl, setIgUrl] = useState(video.instagram_url ?? '')
  const [category, setCategory] = useState<string | null>(video.category ?? null)
  const [copied, setCopied] = useState(false)
  const { categories } = useCategories()
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[^\d]/g, '')))

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
            views: num(views),
            likes: num(likes),
            comments: num(comments),
            reach: num(reach),
            views_ig: num(igStats.views), likes_ig: num(igStats.likes),
            comments_ig: num(igStats.comments), shares_ig: num(igStats.shares),
            views_tiktok: num(ttStats.views), likes_tiktok: num(ttStats.likes),
            comments_tiktok: num(ttStats.comments), shares_tiktok: num(ttStats.shares),
            tiktok_url: ttUrl.trim() || null,
            instagram_url: igUrl.trim() || null,
            category: category || null,
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
        {categories.length > 0 && (
          <div>
            <label>Markierung <span className="muted">(farbiger Ring im Kalender)</span></label>
            <div className="cat-chips">
              <button type="button" className={`cat-chip ${!category ? 'on' : ''}`} onClick={() => setCategory(null)}>
                <span className="cat-swatch" style={{ background: 'var(--border-strong)' }} />Keine
              </button>
              {categories.map((c) => (
                <button type="button" key={c.id} className={`cat-chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
                  <span className="cat-swatch" style={{ background: c.color }} />{c.name}
                </button>
              ))}
            </div>
          </div>
        )}
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

        {video.share_token && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/freigabe/${video.share_token}`)
              setCopied(true)
              setTimeout(() => setCopied(false), 1800)
            }}
          >
            {copied ? '✓ Link kopiert' : '🔗 Freigabe-Link für den Kunden kopieren'}
          </button>
        )}

        <div className="section-divider">🔗 Live-Links (Auto-Statistik)</div>
        <div className="info-box" style={{ fontSize: 13 }}>
          Nach dem Posten die öffentlichen Links einfügen — die Zahlen werden dann täglich automatisch aktualisiert.
          {video.stats_updated_at && <><br />✅ Zuletzt aktualisiert: {new Date(video.stats_updated_at).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</>}
        </div>
        <div>
          <label>🎵 TikTok-Link</label>
          <input type="url" value={ttUrl} onChange={(e) => setTtUrl(e.target.value)} placeholder="https://www.tiktok.com/@…/video/…" />
        </div>
        <div>
          <label>📸 Instagram-Link</label>
          <input type="url" value={igUrl} onChange={(e) => setIgUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
        </div>

        <div className="section-divider">📈 Zahlen — getrennt nach Plattform</div>
        <div className="info-box" style={{ fontSize: 13 }}>
          Hier siehst du genau, welche Zahlen von welcher Plattform stammen. Änderst du Instagram
          oder TikTok, wird die Gesamtspalte automatisch neu gerechnet — du kannst sie aber auch
          direkt überschreiben.
        </div>
        <div className="stats-grid">
          <div className="stats-head" />
          <div className="stats-head">📸 Instagram</div>
          <div className="stats-head">🎵 TikTok</div>
          <div className="stats-head">Σ Gesamt</div>
          {([
            ['views', 'Aufrufe', views, setViews],
            ['likes', 'Likes', likes, setLikes],
            ['comments', 'Kommentare', comments, setComments],
          ] as const).map(([key, label, total, setTotal]) => (
            <Fragment key={key}>
              <div className="stats-label">{label}</div>
              <input
                inputMode="numeric" placeholder="–" value={igStats[key]}
                onChange={(e) => {
                  const next = { ...igStats, [key]: e.target.value }
                  setIgStats(next)
                  setTotal(sumPair(next[key], ttStats[key]))
                }}
              />
              <input
                inputMode="numeric" placeholder="–" value={ttStats[key]}
                onChange={(e) => {
                  const next = { ...ttStats, [key]: e.target.value }
                  setTtStats(next)
                  setTotal(sumPair(igStats[key], next[key]))
                }}
              />
              <input inputMode="numeric" placeholder="0" value={total} onChange={(e) => setTotal(e.target.value)} />
            </Fragment>
          ))}
          <div className="stats-label">Shares</div>
          <input inputMode="numeric" placeholder="–" value={igStats.shares}
            onChange={(e) => setIgStats({ ...igStats, shares: e.target.value })} />
          <input inputMode="numeric" placeholder="–" value={ttStats.shares}
            onChange={(e) => setTtStats({ ...ttStats, shares: e.target.value })} />
          <div className="stats-sum">{sumPair(igStats.shares, ttStats.shares) || '–'}</div>
          <div className="stats-label">Reichweite</div>
          <div className="stats-na">—</div>
          <div className="stats-na">—</div>
          <input inputMode="numeric" placeholder="0" value={reach} onChange={(e) => setReach(e.target.value)} />
        </div>

        {video.series_id && (
          <div className="info-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>🔁 Teil einer Serie.</span>
            <button type="button" className="btn btn-sm btn-danger" onClick={onDeleteSeries}>Ganze Serie löschen</button>
          </div>
        )}

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
  const [aiBrief, setAiBrief] = useState(client.ai_brief ?? '')
  const [pkg, setPkg] = useState(client.package ?? '')
  const [fee, setFee] = useState(client.monthly_fee != null ? String(client.monthly_fee) : '')
  const [active, setActive] = useState(client.active ?? true)
  const [contact, setContact] = useState(client.contact_person ?? '')
  const [phone, setPhone] = useState(client.phone ?? '')
  const [email, setEmail] = useState(client.email ?? '')
  const [website, setWebsite] = useState(client.website ?? '')
  const [city, setCity] = useState(client.city ?? '')
  const [quota, setQuota] = useState(client.monthly_quota != null ? String(client.monthly_quota) : '')
  const [contractEnd, setContractEnd] = useState(client.contract_end ?? '')
  const [health, setHealth] = useState(client.health ?? '')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(client.logo_url)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCropFile(file)
    e.target.value = ''
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      let logo_url = client.logo_url
      if (logoFile) logo_url = await uploadLogo(logoFile)
      const { error } = await updateRow('clients', {
        name: name.trim(),
        logo_url,
        handle_ig: ig.trim() || null,
        handle_tiktok: tiktok.trim() || null,
        notes: notes.trim() || null,
        package: pkg.trim() || null,
        monthly_fee: fee ? Number(fee.replace(',', '.')) : null,
        active,
        contact_person: contact.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        city: city.trim() || null,
        monthly_quota: quota ? Number(quota) : null,
        contract_end: contractEnd || null,
        health: health || null,
        ...(aiBrief.trim() || client.ai_brief ? { ai_brief: aiBrief.trim() || null } : {}),
      }, 'id', client.id)
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
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="ecpkg">Paket</label>
            <input id="ecpkg" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="z. B. Basis / Premium" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="ecfee">Honorar €/Mon.</label>
            <input id="ecfee" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="z. B. 500" />
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Ziel Videos/Monat</label>
            <input value={quota} onChange={(e) => setQuota(e.target.value)} inputMode="numeric" placeholder="z. B. 8" />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Vertragsende</label>
            <input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Status</label>
            <select value={health} onChange={(e) => setHealth(e.target.value)}>
              <option value="">— neutral —</option>
              <option value="gut">🟢 Gut</option>
              <option value="mittel">🟡 Mittel</option>
              <option value="kritisch">🔴 Kritisch</option>
            </select>
          </div>
        </div>

        <div className="section-divider">Kontakt</div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Ansprechpartner</label>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="z. B. Herr Sahin" />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Telefon</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+49 …" />
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>E-Mail</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Ort</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
        <div>
          <label>Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
        </div>

        <label className="check-row">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 'auto' }} />
          Aktiver Kunde (zählt zu den monatlichen Einnahmen)
        </label>
        <div>
          <label htmlFor="ecnotes">Notizen</label>
          <textarea id="ecnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ecbrief">🤖 KI-Briefing (Randbedingungen für Videoideen)</label>
          <textarea
            id="ecbrief"
            value={aiBrief}
            onChange={(e) => setAiBrief(e.target.value)}
            style={{ minHeight: 90 }}
            placeholder="Was verkauft der Betrieb? Aktuelle Angebote/Aktionen? Zielgruppe? Tonalität? Besonderheiten? — Je mehr hier steht, desto besser werden die automatischen Ideen."
          />
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

// ============================ Ideenspeicher ============================
function IdeaPool({
  client,
  ideas,
  onAdd,
  onMove,
  onDelete,
  onEditClient,
}: {
  client: Client
  ideas: VideoIdea[]
  onAdd: (rows: { title: string; notes: string | null; source: 'manual' | 'ai' }[]) => Promise<void>
  onMove: (idea: VideoIdea) => void
  onDelete: (id: string) => void
  onEditClient: () => void
}) {
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const filtered = ideas.filter((i) => {
    if (!q.trim()) return true
    const hay = `${i.title} ${i.notes ?? ''}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })

  return (
    <div className="pool-anim">
      <div className="info-box" style={{ marginBottom: 16 }}>
        💡 Dein Ideen-Vorrat für <strong>{client.name}</strong>. Sammle hier so viele Ideen wie
        du willst. Wenn ihr eine drehen wollt, mit einem Klick <strong>ins Board</strong> holen —
        dann wird sie zur echten Videoidee in Umsetzung.
      </div>

      <div className="toolbar-row">
        <input
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Idee suchen …"
        />
        <button className="btn" onClick={() => setAdding(true)}>+ Idee</button>
        <button className="btn btn-primary" onClick={() => setAiOpen(true)}>✨ KI-Ideen</button>
      </div>

      {!client.ai_brief && (
        <div className="pool-hint">
          Tipp: Hinterlege ein <strong>KI-Briefing</strong> (was der Betrieb verkauft, Angebote,
          Zielgruppe) unter „Kunde bearbeiten" — dann werden die automatischen Ideen richtig gut.
          <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={onEditClient}>
            KI-Briefing hinterlegen
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="col-empty" style={{ padding: 30 }}>
          {ideas.length === 0 ? 'Noch keine Ideen im Speicher. Leg welche an oder lass die KI ran. ✨' : 'Keine Treffer.'}
        </div>
      ) : (
        <div className="pool-grid">
          {filtered.map((idea) => (
            <div className="pool-card" key={idea.id}>
              <div className="pool-card-head">
                <span className={`pool-badge ${idea.source}`}>{idea.source === 'ai' ? '🤖 KI' : '✍️ manuell'}</span>
                <button className="pool-x" onClick={() => onDelete(idea.id)} title="löschen">✕</button>
              </div>
              <div className="pool-title">{idea.title}</div>
              {idea.notes && <div className="pool-notes">{idea.notes}</div>}
              <button className="btn btn-sm btn-primary pool-move" onClick={() => onMove(idea)}>
                → Ins Board holen
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <ManualIdeaModal
          onClose={() => setAdding(false)}
          onSave={async (title, notes) => {
            await onAdd([{ title, notes, source: 'manual' }])
            setAdding(false)
          }}
        />
      )}

      {aiOpen && (
        <AiIdeasModal
          client={client}
          existing={ideas.map((i) => i.title)}
          onClose={() => setAiOpen(false)}
          onSave={async (rows) => {
            await onAdd(rows.map((r) => ({ ...r, source: 'ai' as const })))
            setAiOpen(false)
          }}
        />
      )}
    </div>
  )
}

function ManualIdeaModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (title: string, notes: string | null) => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  return (
    <Modal title="Idee in den Speicher" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          onSave(title.trim(), notes.trim() || null)
        }}
      >
        <div>
          <label htmlFor="pit">Idee *</label>
          <input id="pit" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required placeholder="z. B. Blick in die Küche: Teig kneten" />
        </div>
        <div>
          <label htmlFor="pin">Notiz (optional)</label>
          <textarea id="pin" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Was zeigen, worauf achten …" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>Speichern</button>
        </div>
      </form>
    </Modal>
  )
}

function AiIdeasModal({
  client,
  existing,
  onClose,
  onSave,
}: {
  client: Client
  existing: string[]
  onClose: () => void
  onSave: (rows: { title: string; notes: string | null }[]) => void
}) {
  const [count, setCount] = useState(5)
  const [theme, setTheme] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ title: string; notes: string | null; on: boolean }[] | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const ideas = await generateIdeas(client, count, theme.trim() || null, existing)
      setResult(ideas.map((i) => ({ title: i.title, notes: i.notes, on: true })))
    } catch (e: any) {
      setError(e.message ?? 'Fehler bei der Ideen-Erstellung')
    } finally {
      setBusy(false)
    }
  }

  const chosen = (result ?? []).filter((r) => r.on)

  return (
    <Modal title="✨ KI-Videoideen" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}

        {!result && (
          <>
            <p className="info-box">
              Ich erstelle Ideen aus dem Briefing von <strong>{client.name}</strong>
              {client.ai_brief ? '' : ' (Tipp: noch kein KI-Briefing hinterlegt — die Ideen werden allgemeiner)'}.
            </p>
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label>Wie viele?</label>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} Ideen</option>)}
                </select>
              </div>
            </div>
            <div>
              <label>Schwerpunkt (optional)</label>
              <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="z. B. Weihnachtsaktion, Team vorstellen, neues Gericht" />
            </div>
            <button className="btn btn-primary" onClick={run} disabled={busy}>
              {busy ? 'KI denkt nach …' : `✨ ${count} Ideen erstellen`}
            </button>
          </>
        )}

        {result && (
          <>
            <p className="muted">Häkchen raus = wird nicht gespeichert. Du kannst sie danach im Speicher einzeln bearbeiten.</p>
            <div className="ai-idea-list">
              {result.map((r, idx) => (
                <label className={`ai-idea ${r.on ? 'on' : ''}`} key={idx}>
                  <input
                    type="checkbox"
                    checked={r.on}
                    onChange={(e) => setResult((prev) => prev!.map((x, i) => (i === idx ? { ...x, on: e.target.checked } : x)))}
                  />
                  <span>
                    <span className="ai-idea-title">{r.title}</span>
                    {r.notes && <span className="ai-idea-notes">{r.notes}</span>}
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setResult(null)}>← Neu</button>
              <div className="spacer" />
              <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={chosen.length === 0}
                onClick={() => onSave(chosen.map((r) => ({ title: r.title, notes: r.notes })))}
              >
                {chosen.length} in den Speicher
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ============================ Content-Serie ============================
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SeriesModal({
  onClose,
  onCreate,
  quota = 0,
  recommendDays,
  defaultUntil = null,
}: {
  onClose: () => void
  onCreate: (rows: { title: string; scheduled_date: string; scheduled_time: string | null }[]) => void
  quota?: number
  recommendDays?: number
  defaultUntil?: string | null
}) {
  const today = iso(new Date())
  const [title, setTitle] = useState('Reel')
  const [start, setStart] = useState(today)
  const [time, setTime] = useState('')
  // Vorbelegt mit dem empfohlenen Rhythmus (falls Videos/Monat gepflegt) + Vertragsende als Enddatum
  const [rule, setRule] = useState<RepeatRule>(
    recommendDays
      ? { kind: 'days', interval: recommendDays, until: defaultUntil }
      : { kind: 'weekly', until: defaultUntil },
  )

  const dates = start ? (rule.kind === 'none' ? [start] : occurrences(start, rule)) : []

  function generate() {
    if (!title.trim() || dates.length === 0) return
    onCreate(dates.map((d) => ({ title: title.trim(), scheduled_date: d, scheduled_time: time || null })))
  }

  return (
    <Modal title="📅 Content-Plan anlegen" onClose={onClose}>
      <div className="stack">
        {recommendDays && quota > 0 ? (
          <p className="info-box">
            💡 Empfehlung bei <b>{quota} Videos/Monat</b>: <b>alle {recommendDays} Tage</b> — gleichmäßiger Abstand.
            {defaultUntil ? ' Bis zum Vertragsende vorbelegt.' : ' Enddatum leer = erstmal 3 Monate.'} Du kannst alles unten ändern
            (andere Tage, feste Wochentage, monatlich …).
          </p>
        ) : (
          <p className="info-box">
            Legt automatisch mehrere Video-Karten an – z. B. „alle 3 Tage", „jeden Montag &amp; Donnerstag"
            oder „monatlich". Enddatum leer = unbegrenzt (erstmal 3 Monate, später verlängerbar).
          </p>
        )}
        <div>
          <label>Titel *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="z. B. Wochen-Reel" />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Startdatum</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Uhrzeit (optional)</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <RepeatPicker value={rule} onChange={setRule} anchor={start} />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn-primary" onClick={generate} disabled={!title.trim() || dates.length === 0}>
            {dates.length} Videos anlegen
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ============================ Analyse (gepostete Videos) ============================
function AnalyseSection({ videos, onEdit, onDelete }: { videos: Video[]; onEdit: (v: Video) => void; onDelete: (id: string) => void }) {
  const num = (n: number) => n.toLocaleString('de-DE')
  const posts = videos.length
  if (posts === 0) {
    return (
      <div className="col-empty" style={{ padding: '28px 4px' }}>
        Noch keine geposteten Videos. Sobald du ein Video auf „Gepostet" ziehst, landet es hier dauerhaft in der Analyse. 📊
      </div>
    )
  }
  const totalReach = videos.reduce((s, v) => s + (v.reach ?? v.views ?? 0), 0)
  const totalLikes = videos.reduce((s, v) => s + (v.likes ?? 0), 0)
  const totalComments = videos.reduce((s, v) => s + (v.comments ?? 0), 0)
  const totalViewsIg = videos.reduce((s, v) => s + (v.views_ig ?? 0), 0)
  const totalViewsTiktok = videos.reduce((s, v) => s + (v.views_tiktok ?? 0), 0)
  const hasPlatformSplit = videos.some((v) => v.views_ig != null || v.views_tiktok != null)
  return (
    <div className="analyse">
      <div className="fin-tiles" style={{ marginBottom: hasPlatformSplit ? 10 : 18 }}>
        <div className="fin-tile"><span className="fin-label">Posts gesamt</span><span className="fin-value">{num(posts)}</span><span className="fin-sub">gepostete Videos</span></div>
        <div className="fin-tile"><span className="fin-label">Reichweite gesamt</span><span className="fin-value income">{num(totalReach)}</span><span className="fin-sub">Ø {num(Math.round(totalReach / posts))} / Post</span></div>
        <div className="fin-tile"><span className="fin-label">Interaktionen</span><span className="fin-value">{num(totalLikes)}</span><span className="fin-sub">Likes · {num(totalComments)} Kommentare</span></div>
      </div>
      {hasPlatformSplit && (
        <div className="fin-tiles" style={{ marginBottom: 18 }}>
          <div className="fin-tile"><span className="fin-label">📸 Instagram</span><span className="fin-value">{num(totalViewsIg)}</span><span className="fin-sub">Views gesamt</span></div>
          <div className="fin-tile"><span className="fin-label">🎵 TikTok</span><span className="fin-value">{num(totalViewsTiktok)}</span><span className="fin-sub">Views gesamt</span></div>
        </div>
      )}
      <div className="analyse-list">
        {videos.map((v) => (
          <SwipeRow key={v.id} onDelete={() => onDelete(v.id)}>
            <div className="analyse-row-wrap">
              <button className="analyse-row" onClick={() => onEdit(v)} title="Zahlen bearbeiten">
                <div className="analyse-main">
                  <div className="analyse-title">{v.title}</div>
                  <div className="analyse-date">{v.posted_at ? new Date(v.posted_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                </div>
                <div className="analyse-stats">
                  <span title="Reichweite">▶ {num(v.reach ?? v.views ?? 0)}</span>
                  <span title="Likes">❤ {num(v.likes ?? 0)}</span>
                  <span title="Kommentare">💬 {num(v.comments ?? 0)}</span>
                  <span title="Shares">↗ {num(v.shares ?? 0)}</span>
                </div>
              </button>
              <button
                className="btn btn-sm btn-danger analyse-del hide-mobile"
                onClick={() => onDelete(v.id)}
                title="Video löschen — fliegt aus allen Statistiken"
              >
                ✕
              </button>
            </div>
          </SwipeRow>
        ))}
      </div>
    </div>
  )
}

// ============================ Kunden-Cockpit ============================
function ProgressRing({ value, max }: { value: number; max: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const done = pct >= 1
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="ring">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="7" />
      <circle
        cx="32" cy="32" r={r} fill="none"
        stroke={done ? 'var(--posted)' : 'var(--brand)'}
        strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 32 32)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="32" y="37" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--text)" fontFamily="var(--font-head)">{value}</text>
    </svg>
  )
}

function ContactBtn({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="contact-btn" title={label}>
      <span>{icon}</span>
      <span className="contact-btn-label">{label}</span>
    </a>
  )
}

function fmtK(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k'
  return String(n)
}

function ClientCockpit({ client, postedThisMonth, reachThisMonth, stats }: { client: Client; postedThisMonth: number; reachThisMonth: number; stats: any[] }) {
  const quota = client.monthly_quota ?? 0
  const digits = (client.phone ?? '').replace(/[^\d+]/g, '').replace(/^\+/, '')
  const ig = client.handle_ig?.replace(/^@/, '')
  const tt = client.handle_tiktok?.replace(/^@/, '')
  const contacts = [
    client.phone && { href: `tel:${client.phone}`, icon: '📞', label: 'Anrufen' },
    digits && { href: `https://wa.me/${digits}`, icon: '💬', label: 'WhatsApp' },
    client.email && { href: `mailto:${client.email}`, icon: '✉️', label: 'Mail' },
    ig && { href: `https://instagram.com/${ig}`, icon: '📸', label: 'Instagram' },
    tt && { href: `https://www.tiktok.com/@${tt}`, icon: '🎵', label: 'TikTok' },
    client.website && { href: client.website, icon: '🌐', label: 'Website' },
  ].filter(Boolean) as { href: string; icon: string; label: string }[]

  // Neuester Follower-Stand (stats ist aufsteigend nach Datum sortiert)
  const latestStat = stats.length ? stats[stats.length - 1] : null
  const totalFollowers = latestStat ? (latestStat.followers_ig ?? 0) + (latestStat.followers_tiktok ?? 0) : 0

  if (quota <= 0 && contacts.length === 0 && reachThisMonth === 0 && totalFollowers === 0) return null

  return (
    <div className="client-cockpit">
      {quota > 0 && (
        <div className="cockpit-quota">
          <ProgressRing value={postedThisMonth} max={quota} />
          <div>
            <div className="cockpit-quota-title">{postedThisMonth} / {quota} Posts</div>
            <div className="cockpit-quota-sub">diesen Monat</div>
          </div>
        </div>
      )}
      {totalFollowers > 0 && (
        <div className="cockpit-stat" title={`📸 ${fmtK(latestStat.followers_ig ?? 0)} · 🎵 ${fmtK(latestStat.followers_tiktok ?? 0)}`}>
          <div className="cockpit-quota-title">👥 {fmtK(totalFollowers)}</div>
          <div className="cockpit-quota-sub">Follower gesamt</div>
        </div>
      )}
      {reachThisMonth > 0 && (
        <div className="cockpit-stat">
          <div className="cockpit-quota-title">📡 {fmtK(reachThisMonth)}</div>
          <div className="cockpit-quota-sub">Reichweite / Monat</div>
        </div>
      )}
      {contacts.length > 0 && (
        <div className="contact-bar">
          {contacts.map((c, i) => <ContactBtn key={i} {...c} />)}
        </div>
      )}
    </div>
  )
}

// ============================ Wachstum (Follower-Verlauf) ============================
function GrowthSection({ stats, onAdd }: { stats: any[]; onAdd: () => void }) {
  const ig = stats.filter((s) => s.followers_ig != null).map((s) => ({ x: s.captured_on, y: Number(s.followers_ig) }))
  const tt = stats.filter((s) => s.followers_tiktok != null).map((s) => ({ x: s.captured_on, y: Number(s.followers_tiktok) }))
  const series: Series[] = []
  if (ig.length) series.push({ key: 'ig', label: 'Instagram', color: '#e0521a', points: ig })
  if (tt.length) series.push({ key: 'tt', label: 'TikTok', color: '#2563eb', points: tt })
  const enough = ig.length >= 2 || tt.length >= 2

  return (
    <div className="growth-block">
      <div className="growth-head">
        <h2 className="section-title" style={{ margin: 0 }}>📊 Wachstum</h2>
        <button className="btn btn-sm" onClick={onAdd}>＋ Zahlen erfassen</button>
      </div>
      {enough ? (
        <LineChart series={series} />
      ) : (
        <div className="col-empty" style={{ padding: 18 }}>
          Noch zu wenig Daten. Trag die aktuellen Follower ein — ab dem 2. Eintrag siehst du die Kurve. 📈
        </div>
      )}
    </div>
  )
}

function GrowthModal({ clientId, onClose, onSaved }: { clientId: string; onClose: () => void; onSaved: () => void }) {
  const [ig, setIg] = useState('')
  const [tt, setTt] = useState('')
  const [reach, setReach] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[^\d]/g, '')))

  async function save() {
    if (!ig.trim() && !tt.trim() && !reach.trim()) { setError('Bitte mindestens eine Zahl eintragen.'); return }
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('client_stats').insert({
      client_id: clientId,
      captured_on: date,
      followers_ig: num(ig),
      followers_tiktok: num(tt),
      reach: num(reach),
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title="📊 Wachstum erfassen" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}
        <p className="info-box">Trag die aktuellen Zahlen ein (am besten wöchentlich). Daraus entsteht die Verlaufskurve.</p>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>📸 Instagram-Follower</label>
            <input value={ig} onChange={(e) => setIg(e.target.value)} inputMode="numeric" placeholder="z. B. 2400" autoFocus />
          </div>
          <div style={{ flex: 1 }}>
            <label>🎵 TikTok-Follower</label>
            <input value={tt} onChange={(e) => setTt(e.target.value)} inputMode="numeric" placeholder="z. B. 1200" />
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Reichweite (optional)</label>
            <input value={reach} onChange={(e) => setReach(e.target.value)} inputMode="numeric" placeholder="z. B. 50000" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Datum</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Speichere …' : 'Speichern'}</button>
        </div>
      </div>
    </Modal>
  )
}
