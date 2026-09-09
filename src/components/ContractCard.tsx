import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getCompany } from '../lib/settings'
import { agenturAus, buildContract, type ContractBody } from '../lib/contract'
import { contractPdf, contractFilename } from '../lib/contractPdf'
import { seit } from '../lib/format'
import { tableMissing } from '../lib/db'
import type { Client } from '../lib/types'
import Modal from './Modal'

interface ContractRow {
  id: string
  client_id: string
  title: string
  body: ContractBody
  status: 'draft' | 'sent' | 'signed' | 'cancelled'
  token: string
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
  signer_role: string | null
  starts_on: string | null
}

const heute = () => new Date().toISOString().slice(0, 10)

// Rahmenvertrag pro Kunde: anlegen, Link verschicken, Stand sehen.
// Der Kunde bestätigt über /vertrag/<token> ohne Login.
export default function ContractCard({ client }: { client: Client }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [row, setRow] = useState<ContractRow | null>(null)
  const [fehlt, setFehlt] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('client_id', client.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) { setFehlt(tableMissing(error) != null); return }
    setFehlt(false)
    setRow(((data ?? [])[0] as ContractRow) ?? null)
  }, [client.id])

  useEffect(() => { load() }, [load])

  function pdf() {
    if (!row) return
    const doc = contractPdf(row.body, {
      signed_at: row.signed_at,
      signer_name: row.signer_name,
      signer_role: row.signer_role,
      client_name: client.name,
    })
    doc.save(contractFilename(row.body, row.status === 'signed'))
  }

  // BASE_URL endet auf "/" — beim GitHub-Pages-Unterpfad muss er mit rein,
  // sonst zeigt der Link ins Leere.
  const link = row ? `${window.location.origin}${import.meta.env.BASE_URL}vertrag/${row.token}` : ''

  async function linkKopieren() {
    try {
      await navigator.clipboard.writeText(link)
      toast('Link kopiert ✓')
    } catch {
      // Auf manchen iPhones ist die Zwischenablage gesperrt — dann zum Markieren anzeigen
      window.prompt('Link zum Kopieren:', link)
    }
  }

  if (fehlt) {
    return (
      <div className="section-block">
        <h2 className="section-title">Vertrag</h2>
        <div className="warn-box">
          ⚠ Dafür fehlt noch eine Ergänzung in der Datenbank. Bitte am PC im Supabase
          SQL-Editor einmal <strong>0025_contracts.sql</strong> ausführen.
        </div>
      </div>
    )
  }

  return (
    <div className="section-block">
      <h2 className="section-title">Vertrag</h2>

      {!row ? (
        <div className="contract-row">
          <span className="contract-state none">Kein Vertrag hinterlegt</span>
          <div className="spacer" />
          <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>+ Rahmenvertrag anlegen</button>
        </div>
      ) : (
        <div className="contract-row">
          {row.status === 'signed' ? (
            <span className="contract-state signed">
              ✅ Unterschrieben von {row.signer_name}
              {row.signed_at ? ` · ${seit(row.signed_at)}` : ''}
            </span>
          ) : row.status === 'sent' ? (
            <span className="contract-state sent">
              ⏳ Versendet{row.sent_at ? ` ${seit(row.sent_at)}` : ''} — wartet auf Bestätigung
            </span>
          ) : (
            <span className="contract-state draft">✎ Entwurf — noch nicht versendet</span>
          )}
          <div className="spacer" />
          {row.status === 'sent' && (
            <button className="btn btn-sm" onClick={linkKopieren}>Link kopieren</button>
          )}
          <button className="btn btn-sm" onClick={pdf}>PDF</button>
          <button className="btn btn-sm" onClick={() => setOpen(true)}>
            {row.status === 'signed' ? 'Ansehen' : 'Bearbeiten'}
          </button>
        </div>
      )}

      {open && (
        <ContractModal
          client={client}
          row={row}
          userId={user?.id ?? null}
          onClose={() => setOpen(false)}
          onSaved={(msg) => { setOpen(false); load(); toast(msg) }}
        />
      )}
    </div>
  )
}

function ContractModal({
  client, row, userId, onClose, onSaved,
}: {
  client: Client
  row: ContractRow | null
  userId: string | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const gesperrt = row?.status === 'signed'
  const [vertreten, setVertreten] = useState(row?.body?.kunde?.vertreten ?? client.contact_person ?? '')
  const [adresse, setAdresse] = useState(
    row?.body?.kunde?.adresse ?? [client.city].filter(Boolean).join(', '),
  )
  const [agenturVertreten, setAgenturVertreten] = useState(row?.body?.agentur?.vertreten ?? '')
  const [beginn, setBeginn] = useState(row?.starts_on ?? heute())
  const [satz, setSatz] = useState(row?.body?.stundensatz != null ? String(row.body.stundensatz) : '90')
  const [schleifen, setSchleifen] = useState(String(row?.body?.korrekturschleifen ?? 2))
  const [frist, setFrist] = useState(row?.body?.kuendigungsfrist ?? 'vier Wochen zum Ende eines Kalendermonats')
  const [ort, setOrt] = useState(row?.body?.gerichtsstand ?? 'Münster')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vorschau, setVorschau] = useState(false)

  async function bauen(): Promise<ContractBody> {
    const co = await getCompany()
    return buildContract({
      agentur: { ...agenturAus(co), vertreten: agenturVertreten.trim() || null },
      kunde: { name: client.name, vertreten: vertreten.trim() || null, adresse: adresse.trim() || null },
      stundensatz: satz.trim() === '' ? null : Number(satz.replace(',', '.')),
      korrekturschleifen: Math.max(1, Math.min(5, Number(schleifen) || 2)),
      kuendigungsfrist: frist.trim() || 'vier Wochen zum Ende eines Kalendermonats',
      gerichtsstand: ort.trim() || 'Münster',
      reisekostenOrt: ort.trim() || 'Münster',
      beginn: beginn || null,
    })
  }

  // Speichern und – auf Wunsch – gleich zum Versenden freigeben. Ab „sent"
  // ist der Link gültig; danach wird der Text nicht mehr angefasst, damit
  // niemand nachträglich ändert, was der Kunde gesehen hat.
  async function speichern(status: 'draft' | 'sent') {
    setBusy(true); setError(null)
    try {
      const body = await bauen()
      const felder = {
        client_id: client.id,
        title: body.titel,
        body: body as unknown as Record<string, unknown>,
        status,
        starts_on: beginn || null,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      }
      if (row) {
        const { error } = await supabase.from('contracts').update(felder).eq('id', row.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('contracts').insert({ ...felder, created_by: userId })
        if (error) throw error
      }
      onSaved(status === 'sent' ? 'Vertrag freigegeben — Link kann raus ✓' : 'Entwurf gespeichert ✓')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  async function pdfVorschau() {
    const body = await bauen()
    contractPdf(body).save(contractFilename(body, false))
  }

  return (
    <Modal title={gesperrt ? '📄 Vertrag (unterschrieben)' : row ? '📄 Vertrag bearbeiten' : '📄 Rahmenvertrag anlegen'} onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}

        {gesperrt ? (
          <div className="info-box" style={{ fontSize: 13 }}>
            Dieser Vertrag wurde am{' '}
            {row?.signed_at ? new Date(row.signed_at).toLocaleString('de-DE') : ''} von{' '}
            <strong>{row?.signer_name}</strong> bestätigt und lässt sich nicht mehr ändern.
            Für Änderungen legst du einen neuen Vertrag an.
          </div>
        ) : (
          <div className="info-box" style={{ fontSize: 13 }}>
            Die Vertragsbedingungen sind fest hinterlegt — hier füllst du nur die Felder aus,
            die sich je Kunde unterscheiden. Danach freigeben und den Link verschicken.
          </div>
        )}

        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Kunde vertreten durch</label>
            <input value={vertreten} onChange={(e) => setVertreten(e.target.value)} placeholder="z. B. Herr Sahin" disabled={gesperrt} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Agentur vertreten durch</label>
            <input value={agenturVertreten} onChange={(e) => setAgenturVertreten(e.target.value)} placeholder="z. B. Fassie" disabled={gesperrt} />
          </div>
        </div>

        <div>
          <label>Anschrift des Kunden</label>
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Straße, PLZ Ort" disabled={gesperrt} />
        </div>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label>Beginn</label>
            <input type="date" value={beginn} onChange={(e) => setBeginn(e.target.value)} disabled={gesperrt} />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label>Stundensatz €</label>
            <input inputMode="decimal" value={satz} onChange={(e) => setSatz(e.target.value)} disabled={gesperrt} />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label>Korrekturschleifen</label>
            <input inputMode="numeric" value={schleifen} onChange={(e) => setSchleifen(e.target.value)} disabled={gesperrt} />
          </div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Kündigungsfrist</label>
            <input value={frist} onChange={(e) => setFrist(e.target.value)} disabled={gesperrt} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Gerichtsstand</label>
            <input value={ort} onChange={(e) => setOrt(e.target.value)} disabled={gesperrt} />
          </div>
        </div>

        <button type="button" className="btn btn-sm" onClick={() => setVorschau((v) => !v)}>
          {vorschau ? '▴ Vertragstext ausblenden' : '▾ Vollständigen Vertragstext lesen'}
        </button>
        {vorschau && row?.body && (
          <div className="contract-preview">
            {row.body.paragraphen.map((p) => (
              <section key={p.titel}>
                <h3>{p.titel}</h3>
                {p.absaetze.map((a, i) => <p key={i}>({i + 1}) {a}</p>)}
              </section>
            ))}
          </div>
        )}
        {vorschau && !row?.body && (
          <p className="muted" style={{ fontSize: 12 }}>
            Lade das PDF herunter, um den vollständigen Text zu lesen — er wird beim Speichern erzeugt.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Schließen</button>
          <button type="button" className="btn" onClick={pdfVorschau}>PDF ansehen</button>
          <div className="spacer" />
          {!gesperrt && (
            <>
              <button type="button" className="btn" onClick={() => speichern('draft')} disabled={busy}>
                Als Entwurf sichern
              </button>
              <button type="button" className="btn btn-primary" onClick={() => speichern('sent')} disabled={busy}>
                {busy ? 'Speichere …' : 'Freigeben & Link erzeugen'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
