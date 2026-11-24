// Rechnungen -- reine Anzeige. Quelle ist ausschliesslich Lexware:
// der Abgleich (claude.lexware_sync_start, tagsueber stuendlich + nachts)
// schreibt invoices, ein Trigger zieht den Zahlstatus in die Monatsplaene.
// Hier wird nichts von Hand geaendert -- Aenderungen laufen ueber Claude.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { euro } from '../lib/format'
import { heute } from '../lib/datum'
import BereichReiter from '../components/BereichReiter'
import LexwareStand from '../components/LexwareStand'

interface Invoice {
  id: string
  number: string | null
  amount: number
  status: string
  due_date: string | null
  paid_on: string | null
  service_period?: string | null
  client_name?: string
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Entwurf', cls: 'draft' },
  sent: { label: 'Offen', cls: 'sent' },
  open: { label: 'Offen', cls: 'sent' },
  paid: { label: 'Bezahlt', cls: 'paid' },
  overdue: { label: 'Überfällig', cls: 'overdue' },
  voided: { label: 'Storniert', cls: 'draft' },
}

export default function Invoices() {
  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase
      .from('invoices')
      .select('id, number, amount, status, lexware_status, due_date, paid_on, service_period, clients(name)')
      .order('issued_on', { ascending: false })
    const today = heute()
    const mapped = (data ?? []).map((r: any) => {
      const s = r.lexware_status ?? r.status
      return {
        ...r,
        client_name: r.clients?.name ?? '—',
        status: s !== 'paid' && s !== 'voided' && s !== 'draft' && r.due_date && r.due_date < today ? 'overdue' : s,
      }
    }) as Invoice[]
    setRows(mapped.filter((r) => r.status !== 'voided'))
    setLoading(false)
  }

  useEffect(() => {
    load()
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rechnungen</h1>
          <span className="sub">{loading ? 'Lade …' : 'aus Lexware'}</span>
        </div>
      </div>
      <BereichReiter />
      <LexwareStand />

      <div className="fin-tiles" style={{ marginBottom: 22 }}>
        <div className="fin-tile"><span className="fin-label">Offen</span><span className="fin-value">{euro(totals.open)}</span><span className="fin-sub">noch nicht bezahlt</span></div>
        <div className="fin-tile"><span className="fin-label">Bezahlt / Monat</span><span className="fin-value income">{euro(totals.paidMonth)}</span><span className="fin-sub">eingegangen</span></div>
        <div className="fin-tile"><span className="fin-label">Überfällig</span><span className={`fin-value ${totals.overdue > 0 ? 'expense' : ''}`}>{euro(totals.overdue)}</span><span className="fin-sub">nachhaken!</span></div>
      </div>

      {!loading && rows.length === 0 && <div className="col-empty">Noch keine Rechnungen in Lexware.</div>}

      <div className="inv-list">
        {rows.map((r) => (
          <div className="inv-row" key={r.id}>
            <div className="inv-main">
              <div className="inv-top">
                <span className="inv-number">{r.number || 'ohne Nr.'}</span>
                <span className={`inv-badge ${STATUS[r.status]?.cls ?? 'draft'}`}>{STATUS[r.status]?.label ?? r.status}</span>
              </div>
              <div className="inv-sub">
                {r.client_name}
                {r.status === 'paid' && r.paid_on
                  ? ` · bezahlt ${new Date(r.paid_on).toLocaleDateString('de-DE')}`
                  : ` · fällig ${r.due_date ? new Date(r.due_date).toLocaleDateString('de-DE') : '—'}`}
              </div>
            </div>
            <div className="inv-amount">{euro(Number(r.amount))}</div>
          </div>
        ))}
      </div>
    </>
  )
}
