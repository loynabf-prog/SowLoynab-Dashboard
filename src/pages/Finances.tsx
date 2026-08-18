import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { euro, dateShort } from '../lib/format'
import type { Transaction, TransactionType } from '../lib/types'

interface TxRow extends Transaction {
  clients?: { name: string } | null
}
interface Option { id: string; name: string }

export default function Finances() {
  const { user } = useAuth()
  const [tx, setTx] = useState<TxRow[]>([])
  const [clients, setClients] = useState<Option[]>([])
  const [mrr, setMrr] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TxRow | null>(null)
  const [creating, setCreating] = useState<TransactionType | null>(null)

  async function load() {
    setError(null)
    const { data, error } = await supabase
      .from('transactions')
      .select('*, clients(name)')
      .order('occurred_on', { ascending: false })
    if (error) setError(error.message)
    else setTx((data ?? []) as TxRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('clients').select('id, name, monthly_fee, active').order('name').then(({ data }) => {
      const rows = (data ?? []) as any[]
      setClients(rows.map((c) => ({ id: c.id, name: c.name })))
      setMrr(rows.filter((c) => c.active).reduce((s, c) => s + (Number(c.monthly_fee) || 0), 0))
    })
    const ch = supabase
      .channel('tx-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function remove(id: string) {
    setTx((prev) => prev.filter((x) => x.id !== id))
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) load()
  }

  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const stats = useMemo(() => {
    const num = (v: any) => Number(v) || 0
    const recurringExp = tx.filter((t) => t.recurring && t.type === 'expense').reduce((s, t) => s + num(t.amount), 0)
    const monthIncome = tx.filter((t) => t.type === 'income' && t.occurred_on.startsWith(monthPrefix)).reduce((s, t) => s + num(t.amount), 0)
    const monthExpense = tx.filter((t) => t.type === 'expense' && t.occurred_on.startsWith(monthPrefix)).reduce((s, t) => s + num(t.amount), 0)
    return {
      recurringExp,
      monthIncome,
      monthExpense,
      monthNet: monthIncome - monthExpense,
      recurringNet: mrr - recurringExp,
    }
  }, [tx, mrr, monthPrefix])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Finanzen</h1>
          <span className="sub">Geschäftskonto · Einnahmen &amp; Ausgaben</span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setCreating('expense')}>– Ausgabe</button>
        <button className="btn btn-primary" onClick={() => setCreating('income')}>+ Einnahme</button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="fin-tiles">
        <div className="fin-tile">
          <span className="fin-label">Wiederkehrend / Monat (Kunden)</span>
          <span className="fin-value income">{euro(mrr)}</span>
          <span className="fin-sub">aus aktiven Kundenpaketen</span>
        </div>
        <div className="fin-tile">
          <span className="fin-label">Fixkosten / Monat (Abos)</span>
          <span className="fin-value expense">{euro(stats.recurringExp)}</span>
          <span className="fin-sub">wiederkehrende Ausgaben</span>
        </div>
        <div className="fin-tile">
          <span className="fin-label">Überschuss / Monat (Plan)</span>
          <span className={`fin-value ${stats.recurringNet >= 0 ? 'income' : 'expense'}`}>{euro(stats.recurringNet)}</span>
          <span className="fin-sub">wiederkehrend, ohne Einmaliges</span>
        </div>
        <div className="fin-tile">
          <span className="fin-label">Dieser Monat (real)</span>
          <span className={`fin-value ${stats.monthNet >= 0 ? 'income' : 'expense'}`}>{euro(stats.monthNet)}</span>
          <span className="fin-sub">+{euro(stats.monthIncome)} / −{euro(stats.monthExpense)}</span>
        </div>
      </div>

      <h2 style={{ fontSize: 16, margin: '26px 0 12px' }}>Buchungen</h2>
      {!loading && tx.length === 0 && <div className="col-empty">Noch keine Buchungen.</div>}

      <div className="tx-list">
        {tx.map((t) => (
          <div className="tx-row" key={t.id} onClick={() => setEditing(t)}>
            <span className={`tx-badge ${t.type}`}>{t.type === 'income' ? '▲' : '▼'}</span>
            <div className="tx-main">
              <div className="tx-desc">{t.description}</div>
              <div className="tx-meta">
                {dateShort(t.occurred_on)}
                {t.category && <> · {t.category}</>}
                {t.clients?.name && <> · {t.clients.name}</>}
                {t.recurring && <span className="chip" style={{ marginLeft: 6 }}>monatlich</span>}
              </div>
            </div>
            <span className={`tx-amount ${t.type}`}>
              {t.type === 'income' ? '+' : '−'}{euro(Number(t.amount))}
            </span>
            <button
              className="btn btn-sm btn-danger"
              onClick={(e) => {
                e.stopPropagation()
                remove(t.id)
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <TxModal
          tx={editing}
          defaultType={creating ?? 'expense'}
          userId={user?.id ?? null}
          clients={clients}
          onClose={() => {
            setCreating(null)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(null)
            setEditing(null)
            load()
          }}
        />
      )}
    </>
  )
}

function TxModal({
  tx,
  defaultType,
  userId,
  clients,
  onClose,
  onSaved,
}: {
  tx: TxRow | null
  defaultType: TransactionType
  userId: string | null
  clients: Option[]
  onClose: () => void
  onSaved: () => void
}) {
  // Modal wird nur importiert, wenn gebraucht — hier inline via require-Stil vermeiden
  const [type, setType] = useState<TransactionType>(tx?.type ?? defaultType)
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '')
  const [description, setDescription] = useState(tx?.description ?? '')
  const [category, setCategory] = useState(tx?.category ?? '')
  const [date, setDate] = useState(tx?.occurred_on ?? new Date().toISOString().slice(0, 10))
  const [recurring, setRecurring] = useState(tx?.recurring ?? false)
  const [clientId, setClientId] = useState(tx?.client_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount.replace(',', '.'))
    if (!description.trim() || !amt) return
    setBusy(true)
    setError(null)
    const payload = {
      type,
      amount: amt,
      description: description.trim(),
      category: category.trim() || null,
      occurred_on: date,
      recurring,
      client_id: clientId || null,
    }
    const res = tx
      ? await supabase.from('transactions').update(payload).eq('id', tx.id)
      : await supabase.from('transactions').insert({ ...payload, created_by: userId })
    setBusy(false)
    if (res.error) setError(res.error.message)
    else onSaved()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{tx ? 'Buchung bearbeiten' : type === 'income' ? 'Einnahme' : 'Ausgabe'}</h2>
        <form className="stack" onSubmit={save}>
          {error && <div className="error-box">{error}</div>}
          <div className="seg">
            <button type="button" className={`seg-btn ${type === 'income' ? 'on income' : ''}`} onClick={() => setType('income')}>
              Einnahme
            </button>
            <button type="button" className={`seg-btn ${type === 'expense' ? 'on expense' : ''}`} onClick={() => setType('expense')}>
              Ausgabe
            </button>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Betrag € *</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="z. B. 20" autoFocus required />
            </div>
            <div style={{ flex: 1 }}>
              <label>Datum</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label>Beschreibung *</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'expense' ? 'z. B. Claude-Abo' : 'z. B. Paket Restaurant Sahin'} required />
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Kategorie</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={type === 'expense' ? 'Software-Abo' : 'Kunde'} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Kunde (optional)</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ width: 'auto' }} />
            Monatlich wiederkehrend
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Speichere …' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
