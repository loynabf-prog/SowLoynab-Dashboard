import { useTeam } from '../context/TeamContext'

function initials(name: string): string {
  const p = name.trim().split(/\s+/)
  return (p.length > 1 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase()
}

// Kleine farbige Avatare fuer die Zuständigen (auf Karten/Zeilen).
export function AssigneeChips({ ids }: { ids: string[] }) {
  const { byId } = useTeam()
  if (!ids || ids.length === 0) return null
  return (
    <span className="assignee-chips">
      {ids.map((id) => {
        const m = byId(id)
        if (!m) return null
        return (
          <span key={id} className="assignee-avatar" style={{ background: m.color }} title={m.name}>
            {initials(m.name)}
          </span>
        )
      })}
    </span>
  )
}

// Mehrfachauswahl der Zuständigen (Fassie/Lion/… – „beide" = mehrere).
export function AssigneePicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { members } = useTeam()
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }
  if (members.length === 0) {
    return <div className="muted" style={{ fontSize: 13 }}>Noch keine Team-Mitglieder (unter „Team" anlegen).</div>
  }
  return (
    <div className="assignee-picker">
      {members.map((m) => {
        const on = value.includes(m.id)
        return (
          <button
            type="button"
            key={m.id}
            className={`assignee-opt ${on ? 'on' : ''}`}
            onClick={() => toggle(m.id)}
            style={on ? { background: m.color, borderColor: m.color, color: '#fff' } : {}}
          >
            <span className="assignee-avatar sm" style={{ background: on ? 'rgba(255,255,255,0.3)' : m.color }}>
              {initials(m.name)}
            </span>
            {m.name}
          </button>
        )
      })}
    </div>
  )
}
