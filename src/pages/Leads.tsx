import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { euro, dateRelative } from '../lib/format'
import { LEAD_STAGE_LABELS, LEAD_STAGE_ORDER, type Lead, type LeadStage } from '../lib/types'
import { usePointerBoard } from '../lib/usePointerBoard'
import Modal from '../components/Modal'
import ActivityLog from '../components/ActivityLog'
import { AssigneePicker, AssigneeChips } from '../components/Assignee'
import { useTeam } from '../context/TeamContext'
import { useIdentity } from '../context/IdentityContext'
import { useToast } from '../context/ToastContext'

export default function Leads() {
  const { user } = useAuth()
  const { members } = useTeam()
  const { memberId } = useIdentity()
  const { toast } = useToast()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [creating, setCreating] = useState(false)
  const [mapsOpen, setMapsOpen] = useState(false)
  const [q, setQ] = useState('')
  const [filterMember, setFilterMember] = useState<string>('')
  const { dragId, drop, startDrag } = usePointerBoard(moveLead)

  async function load() {
    setError(null)
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setLeads((data ?? []).filter((l: any) => !l.deleted_at) as Lead[])
    setLoading(false)
  }

  function orderVal(l: Lead) {
    return l.sort_order ?? new Date(l.created_at).getTime() / 1000
  }

  async function moveLead(leadId: string, targetStage: string, beforeId: string | null) {
    const col = leads
      .filter((l) => l.stage === targetStage && l.id !== leadId)
      .sort((a, b) => orderVal(a) - orderVal(b))
    let newOrder: number
    if (!beforeId) {
      newOrder = (col.length ? orderVal(col[col.length - 1]) : 0) + 1
    } else {
      const idx = col.findIndex((l) => l.id === beforeId)
      const target = col[idx]
      const prev = col[idx - 1]
      newOrder = idx <= 0 ? orderVal(target) - 1 : (orderVal(prev) + orderVal(target)) / 2
    }
    await patchLead(leadId, { stage: targetStage as LeadStage, sort_order: newOrder })
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function patchLead(id: string, patch: Partial<Lead>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    const { error } = await supabase.from('leads').update(patch).eq('id', id)
    if (error) {
      setError(error.message)
      load()
    }
  }

  async function deleteLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id))
    const { error } = await supabase
      .from('leads')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      setError(error.message)
      load()
      return
    }
    toast('In den Papierkorb', {
      label: 'Rückgängig',
      onClick: async () => {
        await supabase.from('leads').update({ deleted_at: null }).eq('id', id)
        load()
      },
    })
  }

  async function convertToClient(lead: Lead) {
    if (lead.converted_client_id) return
    if (!confirm(`"${lead.name}" als Kunde anlegen?`)) return
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name: lead.name,
        handle_ig: lead.handle_ig,
        notes: lead.notes,
        monthly_fee: lead.potential_fee,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()
    if (error) {
      setError(error.message)
      return
    }
    await patchLead(lead.id, { converted_client_id: (data as any).id, stage: 'won' })
  }

  const totalOpen = leads
    .filter((l) => l.stage !== 'won' && l.stage !== 'lost')
    .reduce((s, l) => s + (l.potential_fee ?? 0), 0)

  const shown = leads.filter((l) => {
    if (filterMember && !(l.assignee_ids ?? []).includes(filterMember)) return false
    if (q.trim()) {
      const hay = [l.name, l.city, l.contact_person, l.email, l.handle_ig]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <span className="sub">
            {loading
              ? 'Lade …'
              : `${leads.length} Leads · offenes Potenzial ${euro(totalOpen)}/Mon. · ${leads.filter((l) => l.stage === 'won').length} gewonnen`}
          </span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setMapsOpen(true)}>
          🗺️ Google Maps
        </button>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Lead
        </button>
      </div>

      <div className="toolbar-row">
        <input
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Lead suchen (Name, Ort, Kontakt …)"
        />
        <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)} className="filter-select">
          <option value="">Alle Zuständigen</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {memberId && (
          <button
            className={`btn ${filterMember === memberId ? 'btn-primary' : ''}`}
            onClick={() => setFilterMember(filterMember === memberId ? '' : memberId)}
          >
            🙋 Nur meine
          </button>
        )}
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="pipeline">
        {LEAD_STAGE_ORDER.map((stage) => {
          const items = shown
            .filter((l) => l.stage === stage)
            .sort((a, b) => orderVal(a) - orderVal(b))
          const sum = items.reduce((s, l) => s + (l.potential_fee ?? 0), 0)
          return (
            <div
              className={`pipe-col stage-${stage} ${drop?.lane === stage && dragId ? 'drop-active' : ''}`}
              key={stage}
              data-lane={stage}
            >
              <div className="pipe-head">
                <span className="pipe-dot" />
                {LEAD_STAGE_LABELS[stage]}
                <span className="col-count">{items.length}</span>
              </div>
              {sum > 0 && <div className="pipe-sum">{euro(sum)}/Mon.</div>}
              <div className="col-body">
                {items.length === 0 && (
                  <div className="col-empty">{dragId ? 'hierher ziehen' : 'noch nichts'}</div>
                )}
                {items.map((l) => {
                  const fu = dateRelative(l.next_followup)
                  return (
                    <div
                      className={`lead-card drag-wrap ${dragId === l.id ? 'ghost-source' : ''}`}
                      key={l.id}
                      data-card={l.id}
                    >
                      {drop?.lane === stage && drop.beforeId === l.id && <div className="drop-line" />}
                      <div
                        className="vc-grip"
                        data-drag-handle
                        title="Zum Verschieben ziehen"
                        onPointerDown={(e) => startDrag(e, l.id, stage)}
                      >
                        <span /><span /><span />
                      </div>
                      <div className="lead-name">
                        {l.name}
                        <AssigneeChips ids={l.assignee_ids ?? []} />
                      </div>
                      {(l.city || l.contact_person) && (
                        <div className="lead-sub">
                          {[l.city, l.contact_person].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {l.source && <span className="chip lead-source">📥 {l.source}</span>}
                      {l.potential_fee != null && (
                        <div className="lead-fee">{euro(l.potential_fee)}/Mon.</div>
                      )}
                      {l.next_followup && (
                        <div className={`lead-followup ${fu.overdue ? 'overdue' : fu.soon ? 'soon' : ''}`}>
                          ⏰ Follow-up: {fu.text}
                        </div>
                      )}

                      <select
                        className="stage-select"
                        value={l.stage}
                        onChange={(e) => patchLead(l.id, { stage: e.target.value as LeadStage })}
                      >
                        {LEAD_STAGE_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_STAGE_LABELS[s]}
                          </option>
                        ))}
                      </select>

                      <div className="lead-actions">
                        <button className="btn btn-sm" onClick={() => setEditing(l)}>
                          Details
                        </button>
                        {l.converted_client_id ? (
                          <Link className="btn btn-sm" to={`/client/${l.converted_client_id}`}>
                            → Kunde
                          </Link>
                        ) : (
                          l.stage === 'won' && (
                            <button className="btn btn-sm btn-primary" onClick={() => convertToClient(l)}>
                              In Kunde
                            </button>
                          )
                        )}
                        <div className="spacer" />
                        <button className="btn btn-sm btn-danger" onClick={() => deleteLead(l.id)}>
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
                {drop?.lane === stage && drop.beforeId === null && dragId && <div className="drop-line" />}
              </div>
            </div>
          )
        })}
      </div>

      {(creating || editing) && (
        <LeadModal
          lead={editing}
          userId={user?.id ?? null}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            load()
            toast('Gespeichert ✓')
          }}
        />
      )}

      {mapsOpen && (
        <GoogleMapsSearchModal
          userId={user?.id ?? null}
          onClose={() => setMapsOpen(false)}
          onImported={(n) => {
            setMapsOpen(false)
            load()
            toast(`${n} Leads importiert ✓`)
          }}
        />
      )}
    </>
  )
}

// ============================ Google Maps -> Leads ============================
interface Place {
  name: string
  address: string | null
  city: string | null
  phone: string | null
  website: string | null
  category: string | null
  rating: number | null
  reviews: number | null
  mapsUrl: string | null
}

const MAPS_CATEGORIES = ['Restaurant', 'Café', 'Imbiss', 'Eisdiele', 'Bar']

// Der Supabase-Client zeigt bei Fehlerstatus nur "non-2xx status code" —
// die eigentliche Meldung steckt im Antwort-Körper.
async function readFnError(err: any): Promise<string> {
  try {
    const body = await err?.context?.json?.()
    if (body?.error) return String(body.error)
  } catch { /* kein JSON-Körper */ }
  try {
    const txt = await err?.context?.text?.()
    if (txt) return String(txt).slice(0, 300)
  } catch { /* nichts lesbar */ }
  return err?.message ?? 'Unbekannter Fehler'
}

function GoogleMapsSearchModal({
  userId,
  onClose,
  onImported,
}: {
  userId: string | null
  onClose: () => void
  onImported: (count: number) => void
}) {
  const [category, setCategory] = useState('Restaurant')
  const [city, setCity] = useState('Münster')
  const [maxResults, setMaxResults] = useState(60)
  const [results, setResults] = useState<Place[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const norm = (s: string) => s.toLowerCase().trim()
    Promise.all([
      supabase.from('leads').select('name').is('deleted_at', null),
      supabase.from('clients').select('name').is('deleted_at', null),
    ]).then(([l, c]) => {
      const names = new Set<string>()
      ;(l.data ?? []).forEach((r: any) => names.add(norm(r.name)))
      ;(c.data ?? []).forEach((r: any) => names.add(norm(r.name)))
      setExistingNames(names)
    })
  }, [])

  function isDuplicate(name: string): boolean {
    return existingNames.has(name.toLowerCase().trim())
  }

  async function runSearch() {
    if (!category.trim()) { setError('Bitte eine Kategorie angeben.'); return }
    setBusy(true)
    setError(null)
    setResults(null)
    try {
      const query = `${category.trim()} in ${city.trim() || 'Münster'}`
      const { data, error } = await supabase.functions.invoke('apify-places-search', { body: { query, maxResults } })
      if (error) throw new Error(await readFnError(error))
      if (data?.error) throw new Error(data.error)
      const places = (data?.places ?? []) as Place[]
      setResults(places)
      setSelected(new Set(places.map((_, i) => i).filter((i) => !isDuplicate(places[i].name))))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function importSelected() {
    if (!results || selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const rows = results
        .filter((_, i) => selected.has(i))
        .map((p) => ({
          name: p.name,
          phone: p.phone,
          website: p.website,
          city: p.city || city.trim() || null,
          stage: 'new',
          source: 'Google Maps',
          notes: [p.category, p.address, p.rating != null ? `⭐ ${p.rating}${p.reviews != null ? ` (${p.reviews} Bewertungen)` : ''}` : null, p.mapsUrl]
            .filter(Boolean)
            .join('\n'),
          created_by: userId,
        }))
      const { error } = await supabase.from('leads').insert(rows)
      if (error) throw error
      onImported(rows.length)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="🗺️ Google Maps durchsuchen" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}

        {!results ? (
          <>
            <div className="info-box" style={{ fontSize: 13 }}>
              Sucht öffentliche Google-Maps-Einträge (Name, Adresse, Telefon, Website, Bewertung) und schlägt sie dir zum Import vor. Kostet ca. 4 $ pro 1.000 Ergebnisse bei Apify.
            </div>
            <div>
              <label>Kategorie</label>
              <div className="cat-chips">
                {MAPS_CATEGORIES.map((c) => (
                  <button type="button" key={c} className={`cat-chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="oder eigener Begriff, z. B. Bäckerei" style={{ marginTop: 8 }} />
            </div>
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label>Ort</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Max. Ergebnisse</label>
                <select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))}>
                  {[30, 60, 100, 150].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
              <button type="button" className="btn btn-primary" onClick={runSearch} disabled={busy || !category.trim()}>
                {busy ? 'Suche läuft …' : '🔍 Suchen'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">{results.length} gefunden{results.length > 0 ? `, ${selected.size} ausgewählt` : ''}. Bereits vorhandene sind abgewählt.</p>
            {results.length === 0 && <div className="col-empty">Nichts gefunden. Anderen Begriff oder Ort versuchen.</div>}
            <div className="ai-idea-list">
              {results.map((p, i) => (
                <label className={`ai-idea ${selected.has(i) ? 'on' : ''}`} key={i}>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  <span>
                    <span className="ai-idea-title">
                      {p.name}
                      {isDuplicate(p.name) && <span className="muted"> · bereits vorhanden</span>}
                    </span>
                    <span className="ai-idea-notes">
                      {[p.category, p.address, p.rating != null ? `⭐ ${p.rating}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setResults(null)}>← Neue Suche</button>
              <div className="spacer" />
              <button type="button" className="btn btn-primary" onClick={importSelected} disabled={busy || selected.size === 0}>
                {busy ? 'Importiere …' : `${selected.size} Leads importieren`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function LeadModal({
  lead,
  userId,
  onClose,
  onSaved,
}: {
  lead: Lead | null
  userId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    name: lead?.name ?? '',
    contact_person: lead?.contact_person ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    handle_ig: lead?.handle_ig ?? '',
    website: lead?.website ?? '',
    city: lead?.city ?? '',
    stage: lead?.stage ?? ('new' as LeadStage),
    source: lead?.source ?? '',
    potential_fee: lead?.potential_fee != null ? String(lead.potential_fee) : '',
    next_followup: lead?.next_followup ?? '',
    notes: lead?.notes ?? '',
  })
  const [assignees, setAssignees] = useState<string[]>(lead?.assignee_ids ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    setError(null)
    const payload = {
      name: f.name.trim(),
      contact_person: f.contact_person.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      handle_ig: f.handle_ig.trim() || null,
      website: f.website.trim() || null,
      city: f.city.trim() || null,
      stage: f.stage,
      source: f.source.trim() || null,
      potential_fee: f.potential_fee ? Number(f.potential_fee.replace(',', '.')) : null,
      next_followup: f.next_followup || null,
      notes: f.notes.trim() || null,
      // assignee_ids nur mitschicken, wenn Team-Feature aktiv (Skript 5)
      ...(assignees.length ? { assignee_ids: assignees } : {}),
    }
    const res = lead
      ? await supabase.from('leads').update(payload).eq('id', lead.id)
      : await supabase.from('leads').insert({ ...payload, created_by: userId })
    setBusy(false)
    if (res.error) setError(res.error.message)
    else onSaved()
  }

  return (
    <Modal title={lead ? 'Lead bearbeiten' : 'Neuen Lead anlegen'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <div className="error-box">{error}</div>}
        <div>
          <label>Restaurant / Name *</label>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus required />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Ansprechpartner</label>
            <input value={f.contact_person} onChange={(e) => set('contact_person', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Ort</label>
            <input value={f.city} onChange={(e) => set('city', e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Telefon</label>
            <input value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>E-Mail</label>
            <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Instagram</label>
            <input value={f.handle_ig} onChange={(e) => set('handle_ig', e.target.value)} placeholder="restaurant_xy" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Website</label>
            <input value={f.website} onChange={(e) => set('website', e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Phase</label>
            <select value={f.stage} onChange={(e) => set('stage', e.target.value)}>
              {LEAD_STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Potenzial €/Mon.</label>
            <input value={f.potential_fee} onChange={(e) => set('potential_fee', e.target.value)} placeholder="z. B. 500" inputMode="decimal" />
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Nächster Follow-up</label>
            <input type="date" value={f.next_followup} onChange={(e) => set('next_followup', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Quelle</label>
            <select value={f.source} onChange={(e) => set('source', e.target.value)}>
              <option value="">— unbekannt —</option>
              {['Instagram', 'TikTok', 'Google Maps', 'Empfehlung', 'Kaltakquise', 'Website', 'Netzwerk', 'Sonstige'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label>Zuständig</label>
          <AssigneePicker value={assignees} onChange={setAssignees} />
        </div>
        <div>
          <label>Notizen</label>
          <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !f.name.trim()}>
            {busy ? 'Speichere …' : lead ? 'Speichern' : 'Anlegen'}
          </button>
        </div>
      </form>

      {lead && (
        <div className="section-block" style={{ marginTop: 22 }}>
          <h2 className="section-title">Verlauf</h2>
          <ActivityLog leadId={lead.id} />
        </div>
      )}
    </Modal>
  )
}
