import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import InspirationCard from '../components/InspirationCard'
import type { Inspiration } from '../lib/types'

interface Opt { id: string; name: string }

const ALLGEMEIN = '__allgemein__'

// Sammlung aller gemerkten Fremd-Videos — nach Kunde gruppiert, plus eine
// allgemeine Spalte für alles, was (noch) zu keinem Kunden gehört.
export default function Inspirations() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Inspiration[]>([])
  const [clients, setClients] = useState<Opt[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('') // '' = alle | ALLGEMEIN | client-id
  const [fehlt, setFehlt] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('inspirations')
      .select('*, clients(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    // Tabelle noch nicht angelegt (SQL-Skript 23 fehlt) — sauber melden
    if (error) { setFehlt(true); setLoading(false); return }
    setRows((data ?? []) as unknown as Inspiration[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setClients((data ?? []) as Opt[]))
    const ch = supabase.channel('insp-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspirations' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function remove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    await supabase.from('inspirations').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    toast('In den Papierkorb', {
      label: 'Rückgängig',
      onClick: async () => { await supabase.from('inspirations').update({ deleted_at: null }).eq('id', id); load() },
    })
  }

  async function assign(id: string, clientId: string | null) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, client_id: clientId } : r)))
    await supabase.from('inspirations').update({ client_id: clientId }).eq('id', id)
    toast(clientId ? 'Kunde zugeordnet ✓' : 'Nach „Allgemein" verschoben ✓')
  }

  const gefiltert = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === ALLGEMEIN && r.client_id) return false
      if (filter && filter !== ALLGEMEIN && r.client_id !== filter) return false
      if (!needle) return true
      return `${r.title ?? ''} ${r.author ?? ''} ${r.notes ?? ''} ${r.url}`.toLowerCase().includes(needle)
    })
  }, [rows, q, filter])

  // „Allgemein" steht bewusst oben — da landet alles Neue ohne Zuordnung.
  const gruppen = useMemo(() => {
    const map = new Map<string, { key: string; title: string; clientId: string | null; items: Inspiration[] }>()
    map.set(ALLGEMEIN, { key: ALLGEMEIN, title: 'Allgemein', clientId: null, items: [] })
    for (const r of gefiltert) {
      const key = r.client_id ?? ALLGEMEIN
      if (!map.has(key)) map.set(key, { key, title: r.clients?.name ?? 'Kunde', clientId: r.client_id, items: [] })
      map.get(key)!.items.push(r)
    }
    return [...map.values()].filter((g) => g.items.length > 0 || g.key === ALLGEMEIN)
  }, [gefiltert])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inspirationen 🔖</h1>
          <span className="sub">
            {loading ? 'Lade …' : `${rows.length} gemerkte ${rows.length === 1 ? 'Video' : 'Videos'}`}
          </span>
        </div>
        <div className="spacer" />
        <button
          className="btn btn-primary"
          onClick={() => window.dispatchEvent(new CustomEvent('open-quickadd', { detail: { type: 'inspiration' } }))}
        >
          + Inspiration
        </button>
      </div>

      {fehlt && (
        <div className="warn-box" style={{ marginBottom: 16 }}>
          ⚠ Dafür fehlt noch eine Ergänzung in der Datenbank. Bitte am PC im Supabase
          SQL-Editor einmal das Skript <strong>ALLES_offen_20-23.sql</strong> ausführen —
          danach ist der Bereich sofort da.
        </div>
      )}

      <div className="toolbar-row">
        <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Inspiration suchen …" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">Alle</option>
          <option value={ALLGEMEIN}>Allgemein (ohne Kunde)</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!loading && rows.length === 0 && !fehlt && (
        <div className="col-empty" style={{ padding: 30 }}>
          Noch nichts gemerkt. Wenn dir ein Video über den Weg läuft, das ihr so ähnlich machen
          wollt: Link kopieren, oben auf „+ Inspiration“. 🔖
        </div>
      )}

      {gruppen.map((g) => (
        <div className="section-block" key={g.key}>
          <h2 className="section-title">
            {g.clientId
              ? <Link to={`/client/${g.clientId}?tab=inspiration`}>{g.title}</Link>
              : g.title}
            <span className="col-count">{g.items.length}</span>
          </h2>
          {g.items.length === 0 ? (
            <div className="col-empty">Nichts Allgemeines gemerkt.</div>
          ) : (
            <div className="insp-grid">
              {g.items.map((r) => (
                <InspirationCard
                  key={r.id}
                  item={r}
                  clients={clients}
                  onAssign={(cid) => assign(r.id, cid)}
                  onDelete={() => remove(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
