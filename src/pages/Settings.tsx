import { useEffect, useState } from 'react'
import { getCompany, saveCompany, type Company } from '../lib/settings'
import { useToast } from '../context/ToastContext'

export default function Settings() {
  const { toast } = useToast()
  const [c, setC] = useState<Company>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Company, v: any) => setC((p) => ({ ...p, [k]: v }))

  useEffect(() => { getCompany().then((x) => { setC(x); setLoading(false) }) }, [])

  async function save() {
    setBusy(true)
    await saveCompany(c)
    setBusy(false)
    toast('Firmendaten gespeichert ✓')
  }

  if (loading) return <div className="col-empty">Lade …</div>

  return (
    <>
      <div className="page-head">
        <div><h1>Einstellungen</h1><span className="sub">Firmendaten für Rechnungen</span></div>
      </div>

      <div className="settings-card">
        <div className="info-box" style={{ marginBottom: 16 }}>
          🧾 Diese Daten stehen auf jeder PDF-Rechnung (Absender, Steuer, Bankverbindung). Einmal ausfüllen — fertig.
        </div>

        <div className="stack">
          <div>
            <label>Firmenname *</label>
            <input value={c.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Sow & Loynab Media" />
          </div>
          <div>
            <label>Adresse (mehrzeilig)</label>
            <textarea value={c.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder={'Musterstraße 1\n48143 Münster'} />
          </div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}><label>Telefon</label><input value={c.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 150 }}><label>E-Mail</label><input value={c.email ?? ''} onChange={(e) => set('email', e.target.value)} /></div>
          </div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}><label>Steuernummer</label><input value={c.taxId ?? ''} onChange={(e) => set('taxId', e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 150 }}><label>USt-IdNr</label><input value={c.vatId ?? ''} onChange={(e) => set('vatId', e.target.value)} placeholder="DE…" /></div>
          </div>

          <div className="section-divider">Bankverbindung</div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200 }}><label>IBAN</label><input value={c.iban ?? ''} onChange={(e) => set('iban', e.target.value)} placeholder="DE.. .... .... .... .... .." /></div>
            <div style={{ flex: 1, minWidth: 120 }}><label>BIC</label><input value={c.bic ?? ''} onChange={(e) => set('bic', e.target.value)} /></div>
          </div>
          <div><label>Bank</label><input value={c.bank ?? ''} onChange={(e) => set('bank', e.target.value)} /></div>

          <div className="section-divider">Umsatzsteuer</div>
          <label className="check-row">
            <input type="checkbox" checked={!!c.kleinunternehmer} onChange={(e) => set('kleinunternehmer', e.target.checked)} style={{ width: 'auto' }} />
            Kleinunternehmer (§ 19 UStG — keine Umsatzsteuer auf Rechnungen)
          </label>
          {!c.kleinunternehmer && (
            <div style={{ maxWidth: 200 }}>
              <label>Standard-USt-Satz %</label>
              <input value={c.defaultVat ?? 19} onChange={(e) => set('defaultVat', Number(e.target.value) || 0)} inputMode="numeric" />
            </div>
          )}

          <div className="modal-actions">
            <button className="btn btn-primary" onClick={save} disabled={busy || !c.name}>{busy ? 'Speichere …' : 'Speichern'}</button>
          </div>
        </div>
      </div>
    </>
  )
}
