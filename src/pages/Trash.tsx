import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'

type Kind = 'clients' | 'videos' | 'video_ideas' | 'inspirations' | 'leads' | 'tasks'
interface Item {
  id: string
  label: string
  deleted_at: string
}
// "endgueltig" fehlt bei Kunden mit Absicht: daran haengen Videos,
// Rechnungen und Zahlen, die beim echten Loeschen stumm mitgehen wuerden.
// Wiederherstellen ja, unwiderruflich vernichten nicht per Knopfdruck.
const KINDS: { key: Kind; title: string; icon: string; labelField: string; endgueltig?: boolean }[] = [
  { key: 'clients', title: 'Kunden', icon: '👤', labelField: 'name', endgueltig: false },
  { key: 'videos', title: 'Videos', icon: '🎬', labelField: 'title' },
  { key: 'video_ideas', title: 'Ideen', icon: '💡', labelField: 'title' },
  { key: 'inspirations', title: 'Inspirationen', icon: '🔖', labelField: 'title' },
  { key: 'leads', title: 'Leads', icon: '🎯', labelField: 'name' },
  { key: 'tasks', title: 'Aufgaben', icon: '✓', labelField: 'title' },
]

export default function Trash() {
  const { toast } = useToast()
  const [data, setData] = useState<Record<Kind, Item[]>>({ clients: [], videos: [], video_ideas: [], inspirations: [], leads: [], tasks: [] })
  const [loading, setLoading] = useState(true)

  async function load() {
    const out: Record<Kind, Item[]> = { clients: [], videos: [], video_ideas: [], inspirations: [], leads: [], tasks: [] }
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

  // Bei zwei Dutzend Videos ist Einzeln-Antippen keine Bedienung, sondern
  // eine Strafe. Der Knopf steht bewusst neben der Ueberschrift und nennt
  // die Zahl -- damit klar ist, was gleich passiert.
  async function restoreAll(kind: Kind) {
    const n = data[kind].length
    if (n === 0) return
    const titel = KINDS.find((k) => k.key === kind)?.title ?? kind
    if (!confirm(`Alle ${n} ${titel} wiederherstellen?`)) return
    const ids = data[kind].map((i) => i.id)
    setData((prev) => ({ ...prev, [kind]: [] }))
    const { error } = await supabase.from(kind).update({ deleted_at: null }).in('id', ids)
    if (error) { toast('Fehler: ' + error.message); load(); return }
    toast(`${n} wiederhergestellt ✓`)
  }

  async function purge(kind: Kind, id: string) {
    if (!confirm('Endgültig löschen? Das kann NICHT rückgängig gemacht werden.')) return
    setData((prev) => ({ ...prev, [kind]: prev[kind].filter((i) => i.id !== id) }))
    await supabase.from(kind).delete().eq('id', id)
    toast('Endgültig gelöscht')
  }

  const total = KINDS.reduce((n, k) => n + data[k.key].length, 0)

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
            <div className="trash-head">
              <h2 className="section-title" style={{ margin: 0 }}>{k.icon} {k.title}</h2>
              <div className="spacer" />
              {data[k.key].length > 1 && (
                <button className="btn btn-sm btn-primary" onClick={() => restoreAll(k.key)}>
                  Alle {data[k.key].length} wiederherstellen
                </button>
              )}
            </div>
            {k.key === 'clients' && (
              <p className="muted" style={{ fontSize: 12.5, margin: '-4px 0 8px' }}>
                Videos, Zahlen und Rechnungen hängen weiter am Kunden — beim
                Wiederherstellen sind sie alle wieder da.
              </p>
            )}
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
                  {k.endgueltig !== false && (
                    <button className="btn btn-sm btn-danger" onClick={() => purge(k.key, it.id)}>
                      Endgültig
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ),
      )}
    </>
  )
}
