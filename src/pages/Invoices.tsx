import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { euro } from '../lib/format'
import Modal from '../components/Modal'

interface Invoice {
  id: string
  client_id: string | null
  number: string | null
  amount: number
  status: string
  issued_on: string
  due_date: string | null
  paid_on: string | null
  notes: string | null
  client_name?: string
}
interface Opt { id: string; name: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Entwurf', cls: 'draft' },
  sent: { label: 'Offen', cls: 'sent' },
  paid: { label: 'Bezahlt', cls: 'paid' },
  overdue: { label: 'Überfällig', cls: 'overdue' },
}

export default function Invoices() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [rows, setRows] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Opt[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .order('issued_on', { ascending: false })
    const today = new Date().toISOString().slice(0, 10)
    const mapped = (data ?? []).map((r: any) => ({
      ...r,
      client_name: r.clients?.name ?? '—',
      // überfällig automatisch markieren (Anzeige)
      status: r.status !== 'paid' && r.due_date && r.due_date < today && r.status !== 'draft' ? 'overdue' : r.status,
    })) as Invoice[]
    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setClients((data ?? []) as Opt[]))
    const ch = supabase.channel('inv-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const totals = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7)
    let open = 0, paidMonth = 0, overdue = 0
    for (const r of rows) {
      if (r.status === 'paid') { if ((r.paid_on ?? '').startsWith(monthPrefix)) paidMonth += Number(r.amount) }
      else if (r.status !== 'draft') { open += Number(r.amount); if (r.status === 'overdue') overdue += Number(r.amount) }
    }
    return { open, paidMonth, overdue }
  }, [rows])

  async function markPaid(inv: Invoice) {
    setRows((prev) => prev.map((r) => (r.id === inv.id ? { ...r, status: 'paid', paid_on: new Date().toISOString().slice(0, 10) } : r)))
    await supabase.from('invoices').update({ status: 'paid', paid_on: new Date().toISOString().slice(0, 10) }).eq('id', inv.id)
    toast('Als bezahlt markiert ✓')
  }

  async function remove(id: string) {
    if (!confirm('Rechnung löschen?')) return
    setRows((prev) => prev.filter((r) => r.id !== id))
    await supabase.from('invoices').delete().eq('id', id)
    toast('Gelöscht')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rechnungen</h1>
          <span className="sub">{loading ? 'Lade …' : `${rows.length} Rechnungen`}</span>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Rechnung</button>
      </div>

      <div className="fin-tiles" style={{ marginBottom: 22 }}>
        <div className="fin-tile"><span className="fin-label">Offen</span><span className="fin-value">{euro(totals.open)}</span><span className="fin-sub">noch nicht bezahlt</span></div>
        <div className="fin-tile"><span className="fin-label">Bezahlt / Monat</span><span className="fin-value income">{euro(totals.paidMonth)}</span><span className="fin-sub">eingegangen</span></div>
        <div className="fin-tile"><span className="fin-label">Überfällig</span><span className={`fin-value ${totals.overdue > 0 ? 'expense' : ''}`}>{euro(totals.overdue)}</span><span className="fin-sub">nachhaken!</span></div>
      </div>

      {!loading && rows.length === 0 && <div className="col-empty">Noch keine Rechnungen. Leg die erste an. 🧾</div>}

      <div className="inv-list">
        {rows.map((r) => (
          <div className="inv-row" key={r.id}>
            <div className="inv-main" onClick={() => setEditing(r)}>
              <div className="inv-top">
                <span className="inv-number">{r.number || 'ohne Nr.'}</span>
                <span className={`inv-badge ${STATUS[r.status]?.cls ?? 'draft'}`}>{STATUS[r.status]?.label ?? r.status}</span>
              </div>
              <div className="inv-sub">{r.client_name} · fällig {r.due_date ? new Date(r.due_date).toLocaleDateString('de-DE') : '—'}</div>
            </div>
            <div className="inv-amount">{euro(Number(r.amount))}</div>
            <div className="inv-actions">
              {r.status !== 'paid' && <button className="btn btn-sm btn-primary" onClick={() => markPaid(r)}>Bezahlt</button>}
              <button className="btn btn-sm btn-danger" onClick={() => remove(r.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <InvoiceModal
          invoice={editing}
          clients={clients}
          userId={user?.id ?? null}
          nextNumber={`${new Date().getFullYear()}-${String(rows.length + 1).padStart(3, '0')}`}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load(); toast('Gespeichert ✓') }}
        />
      )}
    </>
  )
}

function InvoiceModal({ invoice, clients, userId, nextNumber, onClose, onSaved }: {
  invoice: Invoice | null; clients: Opt[]; userId: string | null; nextNumber: string; onClose: () => void; onSaved: () => void
}) {
  const [number, setNumber] = useState(invoice?.number ?? nextNumber)
  const [clientId, setClientId] = useState(invoice?.client_id ?? '')
  const [amount, setAmount] = useState(invoice ? String(invoice.amount) : '')
  const [status, setStatus] = useState(invoice?.status ?? 'sent')
  const [issued, setIssued] = useState(invoice?.issued_on ?? new Date().toISOString().slice(0, 10))
  const [due, setDue] = useState(invoice?.due_date ?? '')
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!amount.trim()) { setError('Bitte einen Betrag angeben.'); return }
    setBusy(true); setError(null)
    const payload = {
      number: number.trim() || null,
      client_id: clientId || null,
      amount: Number(amount.replace(',', '.')),
      status,
      issued_on: issued,
      due_date: due || null,
      paid_on: status === 'paid' ? (invoice?.paid_on ?? new Date().toISOString().slice(0, 10)) : null,
      notes: notes.trim() || null,
    }
    const res = invoice
      ? await supabase.from('invoices').update(payload).eq('id', invoice.id)
      : await supabase.from('invoices').insert({ ...payload, created_by: userId })
    setBusy(false)
    if (res.error) setError(res.error.message)
    else onSaved()
  }

  return (
    <Modal title={invoice ? 'Rechnung bearbeiten' : 'Neue Rechnung'} onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Rechnungsnummer</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Betrag € *</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="z. B. 500" autoFocus />
          </div>
        </div>
        <div>
          <label>Kunde</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— keiner —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label>Rechnungsdatum</label>
            <input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label>Fällig am</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Entwurf</option>
              <option value="sent">Offen (verschickt)</option>
              <option value="paid">Bezahlt</option>
            </select>
          </div>
        </div>
        <div>
          <label>Notiz</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Speichere …' : 'Speichern'}</button>
        </div>
      </div>
    </Modal>
  )
}
