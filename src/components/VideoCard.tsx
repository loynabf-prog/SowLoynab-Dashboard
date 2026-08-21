import { useRef, useState } from 'react'
import type { Video, VideoStatus } from '../lib/types'
import { STATUS_ORDER, STATUS_LABELS } from '../lib/types'
import StatusPill from './StatusPill'

interface Props {
  video: Video
  onPatch: (patch: Partial<Video>) => void
  onEdit: () => void
  onDelete: () => void
  onCaption: () => void
  onLink: () => void
  onNudge: () => void
}

function fmtDate(d: string | null, time: string | null): string {
  if (!d) return 'kein Datum'
  const date = new Date(d + 'T00:00:00')
  const dateFmt = date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
  return time ? `${dateFmt} · ${time.slice(0, 5)} Uhr` : dateFmt
}

function fmtNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k'
  return String(n)
}

function isDue(v: Video): boolean {
  if (v.status === 'posted' || !v.scheduled_date) return false
  const d = new Date(v.scheduled_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() <= today.getTime() + 86400000
}

export default function VideoCard({ video, onPatch, onEdit, onDelete, onCaption, onLink, onNudge }: Props) {
  const [title, setTitle] = useState(video.title)
  const [hint, setHint] = useState<string | null>(null)
  const due = isDue(video)
  const sw = useRef<{ x: number; y: number } | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, button, select, a, .vc-grip')) { sw.current = null; return }
    sw.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!sw.current) return
    const dx = e.changedTouches[0].clientX - sw.current.x
    const dy = e.changedTouches[0].clientY - sw.current.y
    sw.current = null
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return // nur klare Horizontal-Wische
    const i = STATUS_ORDER.indexOf(video.status)
    const next = dx > 0 ? STATUS_ORDER[i + 1] : STATUS_ORDER[i - 1]
    if (!next) return
    onPatch({ status: next })
    setHint(`→ ${STATUS_LABELS[next]}`)
    setTimeout(() => setHint(null), 1100)
  }

  function commitTitle() {
    const t = title.trim() || 'Neue Idee'
    if (t !== video.title) onPatch({ title: t })
    setTitle(t)
  }

  return (
    <div className={`video-card ${due ? 'due' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {hint && <div className="swipe-hint">{hint}</div>}
      <input
        className="vc-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        aria-label="Video-Titel"
      />

      <div className="vc-line">
        <StatusPill status={video.status} onChange={(next: VideoStatus) => onPatch({ status: next })} />
        {video.approval_status === 'approved' && <span className="approval-badge ok">✅ Freigegeben</span>}
        {video.approval_status === 'changes' && <span className="approval-badge chg">📝 Änderung</span>}
      </div>

      <div className="vc-line">
        📅 {fmtDate(video.scheduled_date, video.scheduled_time)}
        {due && <span className="due-tag">fällig</span>}
      </div>

      {video.caption && (
        <span className="vc-caption">
          {video.caption.length > 90 ? video.caption.slice(0, 90) + ' …' : video.caption}
        </span>
      )}

      {video.video_url ? (
        <div className="vc-videolink">
          <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="vc-open">
            🎬 Video öffnen / laden
          </a>
          <button className="vc-linkedit" onClick={onLink} title="Link aendern">
            ✎
          </button>
        </div>
      ) : (
        <button className="vc-upload" onClick={onLink}>
          ＋ Video-Link einfügen
        </button>
      )}

      {video.status === 'posted' && (video.views || video.reach || video.likes || video.comments) ? (
        <div className="vc-stats">
          {video.views != null && <span>👁 {fmtNum(video.views)}</span>}
          {video.reach != null && <span>📡 {fmtNum(video.reach)}</span>}
          {video.likes != null && <span>❤️ {fmtNum(video.likes)}</span>}
          {video.comments != null && <span>💬 {fmtNum(video.comments)}</span>}
        </div>
      ) : null}

      <div className="vc-flags">
        <span
          className={`flag ${video.posted_ig ? 'on' : ''}`}
          onClick={() => onPatch({ posted_ig: !video.posted_ig })}
          role="checkbox"
          aria-checked={video.posted_ig}
        >
          {video.posted_ig ? '✓' : ''} IG
        </span>
        <span
          className={`flag ${video.posted_tiktok ? 'on' : ''}`}
          onClick={() => onPatch({ posted_tiktok: !video.posted_tiktok })}
          role="checkbox"
          aria-checked={video.posted_tiktok}
        >
          {video.posted_tiktok ? '✓' : ''} TikTok
        </span>
      </div>

      <div className="vc-actions">
        <button className="btn btn-sm" onClick={onEdit}>
          Bearbeiten
        </button>
        <button className="btn btn-sm" onClick={onCaption} title="Auto-Caption per Claude">
          ✨ Caption
        </button>
        <button className="btn btn-sm" onClick={onNudge} title="Person anstupsen">
          👉 Anstupsen
        </button>
        <div className="spacer" />
        <button className="btn btn-sm btn-danger" onClick={onDelete} title="Video loeschen">
          Loeschen
        </button>
      </div>
    </div>
  )
}
