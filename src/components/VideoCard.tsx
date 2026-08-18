import { useState } from 'react'
import type { Video, VideoStatus } from '../lib/types'
import StatusPill from './StatusPill'

interface Props {
  video: Video
  onPatch: (patch: Partial<Video>) => void
  onEdit: () => void
  onDelete: () => void
  onCaption: () => void
  onLink: () => void
}

function fmtDate(d: string | null, time: string | null): string {
  if (!d) return 'kein Datum'
  const date = new Date(d + 'T00:00:00')
  const dateFmt = date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
  return time ? `${dateFmt} · ${time.slice(0, 5)} Uhr` : dateFmt
}

function isDue(v: Video): boolean {
  if (v.status === 'posted' || !v.scheduled_date) return false
  const d = new Date(v.scheduled_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() <= today.getTime() + 86400000
}

export default function VideoCard({ video, onPatch, onEdit, onDelete, onCaption, onLink }: Props) {
  const [title, setTitle] = useState(video.title)
  const due = isDue(video)

  function commitTitle() {
    const t = title.trim() || 'Neue Idee'
    if (t !== video.title) onPatch({ title: t })
    setTitle(t)
  }

  return (
    <div className={`video-card ${due ? 'due' : ''}`}>
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
        <div className="spacer" />
        <button className="btn btn-sm btn-danger" onClick={onDelete} title="Video loeschen">
          Loeschen
        </button>
      </div>
    </div>
  )
}
