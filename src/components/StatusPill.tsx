import { STATUS_LABELS, STATUS_ORDER, type VideoStatus } from '../lib/types'

interface Props {
  status: VideoStatus
  onChange: (next: VideoStatus) => void
}

// Klick schaltet zum naechsten Status weiter (todo -> ready -> posted -> todo).
export default function StatusPill({ status, onChange }: Props) {
  function cycle() {
    const idx = STATUS_ORDER.indexOf(status)
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
    onChange(next)
  }

  return (
    <button
      type="button"
      className={`status-pill ${status}`}
      onClick={cycle}
      title="Klick = Status weiterschalten"
    >
      <span className="dot" />
      {STATUS_LABELS[status]}
    </button>
  )
}
