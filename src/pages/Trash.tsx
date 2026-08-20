import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'

type Kind = 'videos' | 'video_ideas' | 'leads' | 'tasks'
interface Item {
  id: string
  label: string
  deleted_at: string
}
const KINDS: { key: Kind; title: string; icon: string; labelField: string }[] = [
  { key: 'videos', title: 'Videos', icon: '🎬', labelField: 'title' },
  { key: 'video_ideas', title: 'Ideen', icon: '💡', labelField: 'title' },
  { key: 'leads', title: 'Leads', icon: '🎯', labelField: 'name' },
  { key: 'tasks', title: 'Aufgaben', icon: '✓', labelField: 'title' },
]

export default function Trash() {
  const { toast } = useToast()
  const [data, setData] = useState<Record<Kind, Item[]>>({ videos: [], video_ideas: [], leads: [], tasks: [] })
  const [loading, setLoading] = useState(true)

  async function load() {
    const out: Record<Kind, Item[]> = { videos: [], video_ideas: [], leads: [], tasks: [] }
    for (const k of KINDS) {
      const { data: rows } = await supabase
        .from(k.key)
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      out[k.key] = (rows ?? []).map((r: any) => ({
        id: r.id,
        label: r[k.labelField] || '(ohne Titel)',
        deleted_at: r.deleted_at,
      }))
    }
    setData(out)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function restore(kind: Kind, id: string) {
    setData((prev) => ({ ...prev, [kind]: prev[kind].filter((i) => i.id !== id) }))
    await supabase.from(kind).update({ deleted_at: null }).eq('id', id)
    toast('Wiederhergestellt ✓')
  }

  async function purge(kind: Kind, id: string) {
    if (!confirm('Endgültig löschen? Das kann NICHT rückgängig gemacht werden.')) return
    setData((prev) => ({ ...prev, [kind]: prev[kind].filter((i) => i.id !== id) }))
    await supabase.from(kind).delete().eq('id', id)
    toast('Endgültig gelöscht')
  }

  const total = data.videos.length + data.leads.length + data.tasks.length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Papierkorb</h1>
          <span className="sub">{loading ? 'Lade …' : `${total} Einträge`}</span>
        </div>
      </div>

      {!loading && total === 0 && <div className="col-empty">Papierkorb ist leer. 🧹</div>}

      {KINDS.map((k) =>
        data[k.key].length === 0 ? null : (
          <div className="section-block" key={k.key}>
            <h2 className="section-title">{k.icon} {k.title}</h2>
            <div className="task-list">
              {data[k.key].map((it) => (
                <div className="task-item" key={it.id}>
                  <div className="task-body">
                    <div className="task-title">{it.label}</div>
                    <div className="task-meta">
                      gelöscht am {new Date(it.deleted_at).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={() => restore(k.key, it.id)}>
                    Wiederherstellen
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => purge(k.key, it.id)}>
                    Endgültig
                  </button>
                </div>
              ))}
            </div>
          </div>
        ),
      )}
    </>
  )
}
