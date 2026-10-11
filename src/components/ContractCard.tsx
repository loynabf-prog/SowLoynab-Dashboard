import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getCompany } from '../lib/settings'
import {
  agenturAus, betrag, buildContract, fehlendeAngaben, konditionenVon, ustAus,
  FRIST_MONATLICH, type ContractBody, type ContractVars,
} from '../lib/contract'
import { contractPdf, contractFilename } from '../lib/contractPdf'
import { archiviere, mailVorlage, nachricht, teile, vertragPdf, whatsappLink } from '../lib/vertragAkte'
import { blobToBase64, sendMail } from '../lib/mail'
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
  pdf_path: string | null
  mail_sent_at: string | null
  mail_to: string | null
}

const heute = () => new Date().toISOString().slice(0, 10)

// Vertrag pro Kunde: vorbereiten, Lücken später füllen, Link verschicken,
// unterschreiben lassen. Danach liegt die Kopie im System und lässt sich per
// Mail oder WhatsApp weitergeben. Der Kunde bestätigt über /vertrag/<token>.
export default function ContractCard({ client }: { client: Client }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [row, setRow] = useState<ContractRow | null>(null)
  const [fehlt, setFehlt] = useState(false)
  const [open, setOpen] = useState(false)
  const [versand, setVersand] = useState(false)
  const [archivFehler, setArchivFehler] = useState<string | null>(null)

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

  // Sobald ein Vertrag unterschrieben ist, wandert die PDF-Kopie automatisch
  // in den Storage. So liegt der Beleg im System, auch wenn niemand ihn
  // herunterlädt.
  useEffect(() => {
    if (!row || row.status !== 'signed' || row.pdf_path) return
    archiviere(row, client.name)
      .then(() => load())
      .catch((e) => setArchivFehler((e as Error).message))
  }, [row, client.name, load])

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

  // Teilen über das iPhone-Menü (WhatsApp, Mail, Dateien). Kann das Gerät
  // keine Dateien teilen, geht ersatzweise ein WhatsApp-Text mit dem Link raus.
  async function teilen() {
    if (!row) return
    const { blob, name } = vertragPdf(row, client.name)
    const text = nachricht(client.name, link)
    const ok = await teile(blob, name, text)
    if (!ok) window.open(whatsappLink(text, client.phone), '_blank')
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

  const k = row ? konditionenVon(row.body) : null
  const eckdaten = k
    ? [
        k.videos != null ? `${k.videos} Video${k.videos === 1 ? '' : 's'}/Monat` : null,
        k.netto != null ? `${betrag(k.ust === 0 ? k.netto : k.brutto)} brutto` : null,
      ].filter(Boolean).join(' · ')
    : ''

  return (
    <div className="section-block">
      <h2 className="section-title">Vertrag</h2>

      {!row ? (
        <div className="contract-row">
          <span className="contract-state none">Kein Vertrag hinterlegt</span>
          <div className="spacer" />
          <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>+ Vertrag vorbereiten</button>
        </div>
      ) : (
        <div className="contract-row">
          <div className="vertrag-stand">
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
            {eckdaten && <span className="vertrag-eckdaten">{eckdaten}</span>}
            {row.status === 'signed' && row.pdf_path && (
              <span className="vertrag-eckdaten">Kopie im System hinterlegt ✓</span>
            )}
            {row.mail_sent_at && (
              <span className="vertrag-eckdaten">Per Mail an {row.mail_to} · {seit(row.mail_sent_at)}</span>
            )}
          </div>
          <div className="spacer" />
          {row.status !== 'draft' && (
            <button className="btn btn-sm" onClick={linkKopieren}>Link</button>
          )}
          <button className="btn btn-sm" onClick={pdf}>PDF</button>
          {row.status === 'signed' && (
            <>
              <button className="btn btn-sm" onClick={() => setVersand(true)}>Per Mail</button>
              <button className="btn btn-sm" onClick={teilen}>Teilen</button>
            </>
          )}
          <button className="btn btn-sm" onClick={() => setOpen(true)}>
            {row.status === 'signed' ? 'Ansehen' : 'Bearbeiten'}
          </button>
        </div>
      )}

      {archivFehler && (
        <div className="warn-box" style={{ marginTop: 10 }}>
          ⚠ Die Kopie konnte nicht im System abgelegt werden ({archivFehler}). Herunterladen
          und Verschicken geht trotzdem. Fehlt der Ablageort, einmal am PC im Supabase
          SQL-Editor <strong>0035_vertrag_konditionen.sql</strong> ausführen.
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

      {versand && row && (
        <VersandModal
          client={client}
          row={row}
          link={link}
          onClose={() => setVersand(false)}
          onSent={(msg) => { setVersand(false); load(); toast(msg) }}
        />
      )}
    </div>
  )
}

// --- Vertrag anlegen und nachbessern ---------------------------------------

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
  const vorhanden = konditionenVon(row?.body)
  const kundenAnschrift = row?.body?.kunde?.adresse ?? [client.city].filter(Boolean).join(', ')

  const [vertreten, setVertreten] = useState(row?.body?.kunde?.vertreten ?? client.contact_person ?? '')
  const [adresse, setAdresse] = useState(kundenAnschrift)
  const [agenturVertreten, setAgenturVertreten] = useState(row?.body?.agentur?.vertreten ?? '')
  const [beginn, setBeginn] = useState(row?.starts_on ?? heute())

  const [videos, setVideos] = useState(
    vorhanden.videos != null ? String(vorhanden.videos) : client.monthly_quota != null ? String(client.monthly_quota) : '',
  )
  const [netto, setNetto] = useState(
    vorhanden.netto != null ? String(vorhanden.netto).replace('.', ',') : client.monthly_fee != null ? String(client.monthly_fee).replace('.', ',') : '',
  )
  const [ust, setUst] = useState(vorhanden.ust != null ? String(vorhanden.ust) : '')
  const [rechnungName, setRechnungName] = useState(vorhanden.rechnung.name ?? '')
  const [rechnungAdresse, setRechnungAdresse] = useState(vorhanden.rechnung.adresse ?? '')
  const [rechnungMail, setRechnungMail] = useState(vorhanden.rechnung.email ?? client.email ?? '')

  const [satz, setSatz] = useState(row?.body?.stundensatz != null ? String(row.body.stundensatz) : '90')
  const [schleifen, setSchleifen] = useState(String(row?.body?.korrekturschleifen ?? 2))
  const [frist, setFrist] = useState(row?.body?.kuendigungsfrist ?? FRIST_MONATLICH)
  const [ort, setOrt] = useState(row?.body?.gerichtsstand ?? 'Münster')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vorschau, setVorschau] = useState<ContractBody | null>(null)

  // Beim ersten Vertrag den Steuersatz aus den Firmendaten vorbelegen —
  // Kleinunternehmer heißt 0 %, sonst der hinterlegte Regelsatz.
  useEffect(() => {
    if (ust !== '' || row) return
    getCompany().then((co) => setUst(String(ustAus(co)))).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const zahl = (s: string): number | null => {
    const t = s.trim().replace(/\./g, '').replace(',', '.')
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  const nettoZahl = zahl(netto)
  const ustZahl = ust === '' ? null : Number(ust)
  const bruttoAnzeige = nettoZahl != null && ustZahl != null
    ? betrag(Math.round(nettoZahl * (1 + ustZahl / 100) * 100) / 100)
    : '—'

  async function vars(): Promise<ContractVars> {
    const co = await getCompany()
    return {
      agentur: { ...agenturAus(co), vertreten: agenturVertreten.trim() || null },
      kunde: { name: client.name, vertreten: vertreten.trim() || null, adresse: adresse.trim() || null },
      konditionen: {
        videos: zahl(videos),
        netto: nettoZahl,
        ust: ustZahl,
        rechnung: {
          name: rechnungName.trim() || null,
          adresse: rechnungAdresse.trim() || null,
          email: rechnungMail.trim() || null,
        },
      },
      stundensatz: zahl(satz),
      korrekturschleifen: Math.max(1, Math.min(5, Number(schleifen) || 2)),
      kuendigungsfrist: frist.trim() || FRIST_MONATLICH,
      gerichtsstand: ort.trim() || 'Münster',
      reisekostenOrt: ort.trim() || 'Münster',
      beginn: beginn || null,
    }
  }

  // Was noch fehlt, live — damit man sieht, was vor dem Verschicken noch
  // nachzutragen ist, ohne erst auf einen Fehler zu laufen.
  const offen = fehlendeAngaben({
    agentur: { name: '', vertreten: agenturVertreten.trim() || null },
    kunde: { name: client.name, vertreten: vertreten.trim() || null, adresse: adresse.trim() || null },
    konditionen: {
      videos: zahl(videos), netto: nettoZahl, ust: ustZahl,
      rechnung: { name: null, adresse: rechnungAdresse.trim() || null, email: null },
    },
    stundensatz: null, korrekturschleifen: 2, kuendigungsfrist: '', gerichtsstand: '',
    reisekostenOrt: '', beginn: beginn || null,
  })

  // Speichern und – auf Wunsch – gleich zum Versenden freigeben. Ab „sent"
  // ist der Link gültig. Danach darf der Text noch nachgebessert werden,
  // solange nicht unterschrieben ist.
  async function speichern(status: 'draft' | 'sent') {
    setBusy(true); setError(null)
    try {
      const body = buildContract(await vars())
      const felder: Record<string, unknown> = {
        client_id: client.id,
        title: body.titel,
        body: body as unknown as Record<string, unknown>,
        status,
        starts_on: beginn || null,
      }
      if (status === 'sent' && row?.status !== 'sent') felder.sent_at = new Date().toISOString()
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
    const body = buildContract(await vars())
    contractPdf(body).save(contractFilename(body, false))
  }

  async function textZeigen() {
    if (vorschau) { setVorschau(null); return }
    setVorschau(buildContract(await vars()))
  }

  return (
    <Modal
      title={gesperrt ? '📄 Vertrag (unterschrieben)' : row ? '📄 Vertrag bearbeiten' : '📄 Vertrag vorbereiten'}
      onClose={onClose}
    >
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
            Der Vertragstext steht fest — hier füllst du nur aus, was je Kunde anders ist.
            Du kannst alles als Entwurf sichern und die fehlenden Zahlen später nachtragen.
            Verschickt wird erst, wenn nichts mehr offen ist.
          </div>
        )}

        {!gesperrt && offen.length > 0 && (
          <div className="warn-box" style={{ fontSize: 13 }}>
            Noch offen: {offen.join(', ')}
          </div>
        )}

        <h3 className="form-head">Namen beider Seiten</h3>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Kunde vertreten durch</label>
            <input value={vertreten} onChange={(e) => setVertreten(e.target.value)} placeholder="Vor- und Nachname" disabled={gesperrt} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Agentur vertreten durch</label>
            <input value={agenturVertreten} onChange={(e) => setAgenturVertreten(e.target.value)} placeholder="Vor- und Nachname" disabled={gesperrt} />
          </div>
        </div>
        <div>
          <label>Anschrift des Kunden</label>
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Straße, PLZ Ort" disabled={gesperrt} />
        </div>

        <h3 className="form-head">Umfang und Vergütung</h3>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 110 }}>
            <label>Videos je Monat</label>
            <input inputMode="numeric" value={videos} onChange={(e) => setVideos(e.target.value)} placeholder="z. B. 12" disabled={gesperrt} />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label>Netto €/Monat</label>
            <input inputMode="decimal" value={netto} onChange={(e) => setNetto(e.target.value)} placeholder="z. B. 1000" disabled={gesperrt} />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label>Umsatzsteuer</label>
            <select value={ust} onChange={(e) => setUst(e.target.value)} disabled={gesperrt}>
              <option value="">— noch offen —</option>
              <option value="19">19 %</option>
              <option value="7">7 %</option>
              <option value="0">keine (§ 19 UStG)</option>
            </select>
          </div>
        </div>
        <div className="vertrag-brutto">
          Brutto je Monat: <strong>{bruttoAnzeige}</strong>
          {ustZahl === 0 && <span className="muted"> — Kleinunternehmer, keine Umsatzsteuer</span>}
        </div>

        <h3 className="form-head">Rechnung</h3>
        <div>
          <label>
            Rechnungsanschrift
            {!gesperrt && adresse.trim() && (
              <button type="button" className="btn-link" onClick={() => setRechnungAdresse(adresse)}>
                Kundenanschrift übernehmen
              </button>
            )}
          </label>
          <input value={rechnungAdresse} onChange={(e) => setRechnungAdresse(e.target.value)} placeholder="Straße, PLZ Ort" disabled={gesperrt} />
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 190 }}>
            <label>Empfänger <span className="muted">(wenn abweichend)</span></label>
            <input value={rechnungName} onChange={(e) => setRechnungName(e.target.value)} placeholder={client.name} disabled={gesperrt} />
          </div>
          <div style={{ flex: 1, minWidth: 190 }}>
            <label>Rechnung per Mail</label>
            <input type="email" value={rechnungMail} onChange={(e) => setRechnungMail(e.target.value)} placeholder="rechnung@…" disabled={gesperrt} />
          </div>
        </div>

        <h3 className="form-head">Laufzeit und Nebenpunkte</h3>
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
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Kündigungsfrist</label>
            <input value={frist} onChange={(e) => setFrist(e.target.value)} disabled={gesperrt} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label>Gerichtsstand</label>
            <input value={ort} onChange={(e) => setOrt(e.target.value)} disabled={gesperrt} />
          </div>
        </div>

        <button type="button" className="btn btn-sm" onClick={textZeigen}>
          {vorschau ? '▴ Vertragstext ausblenden' : '▾ Vollständigen Vertragstext lesen'}
        </button>
        {vorschau && (
          <div className="contract-preview">
            {vorschau.paragraphen.map((p) => (
              <section key={p.titel}>
                <h3>{p.titel}</h3>
                {p.absaetze.map((a, i) => <p key={i}>({i + 1}) {a}</p>)}
              </section>
            ))}
          </div>
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
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => speichern('sent')}
                disabled={busy || offen.length > 0}
                title={offen.length > 0 ? `Noch offen: ${offen.join(', ')}` : undefined}
              >
                {busy ? 'Speichere …' : row?.status === 'sent' ? 'Änderungen übernehmen' : 'Freigeben & Link erzeugen'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

// --- Unterschriebenen Vertrag verschicken ----------------------------------

function VersandModal({
  client, row, link, onClose, onSent,
}: {
  client: Client
  row: ContractRow
  link: string
  onClose: () => void
  onSent: (msg: string) => void
}) {
  const vorlage = mailVorlage(client.name, link)
  const k = konditionenVon(row.body)
  const [to, setTo] = useState(k.rechnung.email || client.email || '')
  const [subject, setSubject] = useState(vorlage.subject)
  const [text, setText] = useState(
    `Hallo,\n\nim Anhang findest du den unterschriebenen Vertrag zwischen Sow & Loynab Media und ${client.name} als PDF.\n\nDu kannst ihn jederzeit auch online ansehen: ${link}\n\nViele Grüße\nSow & Loynab Media`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function senden() {
    if (!to.trim()) { setError('Bitte eine Empfängeradresse eintragen.'); return }
    setBusy(true); setError(null)
    try {
      const { blob, name } = vertragPdf(row, client.name)
      await sendMail({
        to: to.trim(),
        subject: subject.trim() || vorlage.subject,
        html: text.split('\n').map((z) => (z.trim() === '' ? '<br>' : `<p>${z}</p>`)).join(''),
        attachments: [{ filename: name, mime: 'application/pdf', base64: await blobToBase64(blob) }],
      })
      await supabase.from('contracts')
        .update({ mail_sent_at: new Date().toISOString(), mail_to: to.trim() })
        .eq('id', row.id)
      onSent('Vertrag per Mail verschickt ✓')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="✉️ Vertrag verschicken" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}
        <div className="info-box" style={{ fontSize: 13 }}>
          Der unterschriebene Vertrag geht als PDF-Anhang über euer Zoho-Postfach raus
          und landet dort auch im Ordner „Gesendet“.
        </div>
        <div>
          <label>An</label>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="kunde@beispiel.de" />
        </div>
        <div>
          <label>Betreff</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label>Text</label>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={senden} disabled={busy}>
            {busy ? 'Verschicke …' : 'Mit PDF verschicken'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
