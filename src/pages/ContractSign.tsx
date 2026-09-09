import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { contractPdf, contractFilename } from '../lib/contractPdf'
import type { ContractBody } from '../lib/contract'

interface Row {
  id: string
  title: string
  body: ContractBody
  status: string
  signed_at: string | null
  signer_name: string | null
  starts_on: string | null
  client_name: string
}

// Öffentliche Seite zum Lesen und Unterschreiben (ohne Login). Der Kunde
// bekommt den Link per Mail. Zugriff läuft über zwei abgesicherte Funktionen
// (Skript 25) — die Tabelle selbst bleibt gesperrt.
export default function ContractSign() {
  const { token } = useParams<{ token: string }>()
  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [rolle, setRolle] = useState('')
  const [zugestimmt, setZugestimmt] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!token) return
    const { data, error } = await supabase.rpc('get_contract_by_token', { t: token })
    if (error) { setError(error.message); setLoading(false); return }
    const r = (data ?? [])[0]
    if (!r) { setError('Dieser Link ist ungültig oder nicht mehr gültig.'); setLoading(false); return }
    setRow(r as Row)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function unterschreiben() {
    if (!token || !name.trim()) return
    setBusy(true)
    const { error } = await supabase.rpc('sign_contract', { t: token, name: name.trim(), role: rolle.trim() })
    setBusy(false)
    if (error) { setError(error.message); return }
    load()
  }

  function pdf() {
    if (!row) return
    const doc = contractPdf(row.body, {
      signed_at: row.signed_at,
      signer_name: row.signer_name,
      client_name: row.client_name,
    })
    doc.save(contractFilename(row.body, !!row.signed_at))
  }

  if (loading) return <div className="approval-wrap"><div className="approval-card">Lade …</div></div>

  if (error || !row) {
    return (
      <div className="approval-wrap">
        <div className="approval-card">
          <div className="approval-brand"><span className="brand-dot" /> Sow&nbsp;&amp;&nbsp;Loynab</div>
          <p style={{ marginTop: 16 }}>{error ?? 'Nicht gefunden.'}</p>
        </div>
      </div>
    )
  }

  const b = row.body
  const unterschrieben = row.status === 'signed'
  const partei = (p: { name: string; vertreten?: string | null; adresse?: string | null }) =>
    [p.name, p.vertreten ? `vertreten durch ${p.vertreten}` : null, p.adresse].filter(Boolean).join(', ')

  return (
    <div className="approval-wrap">
      <div className="approval-card contract-card">
        <div className="approval-brand"><span className="brand-dot" /> Sow&nbsp;&amp;&nbsp;Loynab</div>

        <h1 className="contract-title">{b.titel}</h1>

        {unterschrieben && (
          <div className="contract-done">
            ✅ Bestätigt am{' '}
            {row.signed_at
              ? new Date(row.signed_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : ''}{' '}
            Uhr durch <strong>{row.signer_name}</strong>. Beide Seiten sind an diesen Vertrag gebunden.
          </div>
        )}

        <div className="contract-parties">
          <div><span className="contract-label">Agentur</span>{partei(b.agentur)}</div>
          <div><span className="contract-label">Kunde</span>{partei(b.kunde)}</div>
        </div>

        <div className="contract-body">
          {b.paragraphen.map((p) => (
            <section key={p.titel}>
              <h2>{p.titel}</h2>
              {p.absaetze.map((a, i) => (
                <p key={i}><span className="contract-nr">({i + 1})</span> {a}</p>
              ))}
            </section>
          ))}
        </div>

        {!unterschrieben ? (
          <div className="contract-sign">
            <h2>Vertrag bestätigen</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Mit dem Bestätigen kommt der Vertrag rechtsverbindlich zustande. Bitte lies ihn
              vorher vollständig durch — du kannst ihn dir auch als PDF herunterladen.
            </p>
            <div className="stack">
              <div>
                <label>Dein Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" autoComplete="name" />
              </div>
              <div>
                <label>Funktion <span className="muted">(optional)</span></label>
                <input value={rolle} onChange={(e) => setRolle(e.target.value)} placeholder="z. B. Inhaber" />
              </div>
              <label className="contract-check">
                <input type="checkbox" checked={zugestimmt} onChange={(e) => setZugestimmt(e.target.checked)} />
                <span>
                  Ich habe den Vertrag gelesen und bin berechtigt, ihn für {b.kunde.name} abzuschließen.
                </span>
              </label>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={pdf}>PDF herunterladen</button>
                <div className="spacer" />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={unterschreiben}
                  disabled={busy || !name.trim() || !zugestimmt}
                >
                  {busy ? 'Wird bestätigt …' : '✓ Rechtsverbindlich bestätigen'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <div className="spacer" />
            <button type="button" className="btn btn-primary" onClick={pdf}>PDF herunterladen</button>
          </div>
        )}
      </div>
    </div>
  )
}
