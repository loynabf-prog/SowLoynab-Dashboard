import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { euro, dateRelative } from '../lib/format'
import { LEAD_STAGE_LABELS, LEAD_STAGE_ORDER, type Lead, type LeadStage } from '../lib/types'
import Modal from '../components/Modal'

export default function Leads() {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    setError(null)
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('next_followup', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setLeads((data ?? []) as Lead[])
    setLoading(false)
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
    if (!confirm('Diesen Lead wirklich loeschen?')) return
    setLeads((prev) => prev.filter((l) => l.id !== id))
    const { error } = await supabase.from('leads').delete().eq('id', id)
    if (error) {
      setError(error.message)
      load()
    }
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <span className="sub">
            {loading ? 'Lade …' : `${leads.length} Leads · offenes Potenzial ${euro(totalOpen)}/Mon.`}
          </span>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Lead
        </button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="pipeline">
        {LEAD_STAGE_ORDER.map((stage) => {
          const items = leads.filter((l) => l.stage === stage)
          const sum = items.reduce((s, l) => s + (l.potential_fee ?? 0), 0)
          return (
            <div className={`pipe-col stage-${stage}`} key={stage}>
              <div className="pipe-head">
                <span className="pipe-dot" />
                {LEAD_STAGE_LABELS[stage]}
                <span className="col-count">{items.length}</span>
              </div>
              {sum > 0 && <div className="pipe-sum">{euro(sum)}/Mon.</div>}
              <div className="col-body">
                {items.length === 0 && <div className="col-empty">—</div>}
                {items.map((l) => {
                  const fu = dateRelative(l.next_followup)
                  return (
                    <div className="lead-card" key={l.id}>
                      <div className="lead-name">{l.name}</div>
                      {(l.city || l.contact_person) && (
                        <div className="lead-sub">
                          {[l.city, l.contact_person].filter(Boolean).join(' · ')}
                        </div>
                      )}
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
          }}
        />
      )}
    </>
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
    potential_fee: lead?.potential_fee != null ? String(lead.potential_fee) : '',
    next_followup: lead?.next_followup ?? '',
    notes: lead?.notes ?? '',
  })
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
      potential_fee: f.potential_fee ? Number(f.potential_fee.replace(',', '.')) : null,
      next_followup: f.next_followup || null,
      notes: f.notes.trim() || null,
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
        <div>
          <label>Nächster Follow-up</label>
          <input type="date" value={f.next_followup} onChange={(e) => set('next_followup', e.target.value)} />
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
    </Modal>
  )
}
