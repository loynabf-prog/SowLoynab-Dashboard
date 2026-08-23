import { dateRelative } from '../lib/format'
import type { Task } from '../lib/types'
import { AssigneeChips } from './Assignee'
import { useCategories } from '../context/CategoryContext'
import { prioById } from '../lib/priority'

export interface TaskRow extends Task {
  clients?: { name: string } | null
  leads?: { name: string } | null
}

// Eine Aufgaben-Zeile — identisch auf Startseite und Aufgabenseite.
export default function TaskItem({
  t,
  onToggle,
  onEdit,
  onDelete,
}: {
  t: TaskRow
  onToggle: () => void
  onEdit: () => void
  onDelete?: () => void
}) {
  const { byId } = useCategories()
  const cat = byId(t.category)
  const prio = prioById(t.priority)
  const barColor = prio?.color ?? cat?.color
  const due = t.due_date ? dateRelative(t.due_date) : null
  const linked = t.clients?.name || t.leads?.name
  return (
    <div className="task-item" style={barColor ? { borderLeft: `3px solid ${barColor}` } : undefined}>
      <button className={`task-check ${t.done ? 'on' : ''}`} onClick={onToggle} aria-label="erledigt umschalten">
        {t.done ? '✓' : ''}
      </button>
      <div className="task-body" onClick={onEdit}>
        <div className={`task-title ${t.done ? 'strike' : ''}`}>{t.title}</div>
        <div className="task-meta">
          {due && (
            <span className={`task-due ${due.overdue ? 'overdue' : due.soon ? 'soon' : ''}`}>
              {due.overdue ? '⚠ ' : '📅 '}
              {due.text}
            </span>
          )}
          {prio && <span className="cat-tag" style={{ background: prio.color }}>{prio.label}</span>}
          {cat && <span className="cat-tag" style={{ background: cat.color }}>{cat.name}</span>}
          {linked && <span className="chip">{t.clients?.name ? '👤 ' : '🎯 '}{linked}</span>}
          <AssigneeChips ids={t.assignee_ids ?? []} />
        </div>
      </div>
      {onDelete && (
        <button className="btn btn-sm btn-danger hide-mobile" onClick={onDelete} title="löschen">
          ✕
        </button>
      )}
    </div>
  )
}
