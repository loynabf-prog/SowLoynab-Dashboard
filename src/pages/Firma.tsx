// Firmendaten -- der "Ausweis" der Agentur.
// ---------------------------------------------------------------------------
// Fassie (27.10.2026): "dass ich unsere Steuernummer nie verliere ... wenn
// jemand fragt, Steuernummer, hasch, dass ich die direkt habe".
// Darum: eine Lese-Seite, jede Zeile antippen = kopiert. Bearbeiten ist ein
// Knopf oben, kein Formular als Standardansicht. Gespeichert wird in
// app_settings.company -- dieselben Daten, die auf Rechnung und Vertrag stehen.

import { useEffect, useState } from 'react'
import { Copy, Check, Pencil, ExternalLink } from 'lucide-react'
import { getCompany, saveCompany, type Company } from '../lib/settings'
import { useToast } from '../context/ToastContext'

type Feld = { key: keyof Company; label: string; mehrzeilig?: boolean; platzhalter?: string; mono?: boolean }
type Gruppe = { titel: string; felder: Feld[] }

const BZST_ANTRAG = 'https://www.bzst.de/SiteGlobals/Kontaktformulare/DE/USt_IDNr/Probleme_Vergabe/kontakt_node.html'

const GRUPPEN: Gruppe[] = [
  { titel: 'Steuer', felder: [
    { key: 'taxId', label: 'Steuernummer', platzhalter: '337/5xxx/xxxx', mono: true },
    { key: 'vatId', label: 'USt-IdNr.', platzhalter: 'DE…', mono: true },
    { key: 'finanzamt', label: 'Finanzamt', platzhalter: 'Finanzamt Münster-Innenstadt' },
  ] },
  { titel: 'Firma', felder: [
    { key: 'name', label: 'Name', platzhalter: 'Sow & Loynab Media GbR' },
    { key: 'rechtsform', label: 'Rechtsform', platzhalter: 'GbR' },
    { key: 'inhaber', label: 'Gesellschafter', mehrzeilig: true, platzhalter: 'Name 1\nName 2' },
    { key: 'gruendung', label: 'Gegründet', platzhalter: '01.08.2026' },
    { key: 'address', label: 'Adresse', mehrzeilig: true, platzhalter: 'Straße 1\n48143 Münster' },
  ] },
  { titel: 'Kontakt', felder: [
    { key: 'email', label: 'E-Mail', platzhalter: 'hallo@sowloynab.de' },
    { key: 'phone', label: 'Telefon' },
    { key: 'website', label: 'Website', platzhalter: 'sowloynab.de' },
  ] },
  { titel: 'Bank', felder: [
    { key: 'iban', label: 'IBAN', mono: true, platzhalter: 'DE.. .... .... .... .... ..' },
    { key: 'bic', label: 'BIC', mono: true },
    { key: 'bank', label: 'Bank', platzhalter: 'FYRST' },
  ] },
  { titel: 'Sonstiges', felder: [
    { key: 'notizen', label: 'Notizen', mehrzeilig: true, platzhalter: 'z. B. Kammer, Versicherungsnummer, Logins-Hinweise' },
  ] },
]

/** Alles als Textblock -- zum Einfügen in eine Mail oder ein Formular. */
export function firmendatenText(c: Company): string {
  const z: string[] = []
  const add = (label: string, v?: string) => { if (v?.trim()) z.push(`${label}: ${v.trim().replace(/\n+/g, ', ')}`) }
  add('Firma', c.name); add('Rechtsform', c.rechtsform); add('Gesellschafter', c.inhaber)
  add('Adresse', c.address); add('Steuernummer', c.taxId); add('USt-IdNr.', c.vatId)
  add('Finanzamt', c.finanzamt); add('E-Mail', c.email); add('Telefon', c.phone); add('Website', c.website)
  add('IBAN', c.iban); add('BIC', c.bic); add('Bank', c.bank)
  return z.join('\n')
}

export default function Firma() {
  const { toast } = useToast()
  const [c, setC] = useState<Company>({})
  const [entwurf, setEntwurf] = useState<Company>({})
  const [laden, setLaden] = useState(true)
  const [bearbeiten, setBearbeiten] = useState(false)
  const [busy, setBusy] = useState(false)
  const [kopiert, setKopiert] = useState<string | null>(null)

  useEffect(() => {
    getCompany().then((x) => {
      setC(x); setEntwurf(x); setLaden(false)
      // Ganz leer? Dann direkt im Bearbeiten-Modus starten.
      if (!x || Object.values(x).every((v) => v == null || v === '')) setBearbeiten(true)
    }).catch(() => setLaden(false))
  }, [])

  async function kopiere(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setKopiert(key)
      setTimeout(() => setKopiert((k) => (k === key ? null : k)), 1500)
      toast('Kopiert')
    } catch {
      toast('Kopieren ging nicht — lang drücken und markieren')
    }
  }

  async function speichern() {
    setBusy(true)
    try {
      // Leerzeichen am Rand weg, sonst landen sie beim Kopieren mit im Formular
      const sauber: Company = { ...entwurf }
      for (const [k, v] of Object.entries(sauber)) if (typeof v === 'string') (sauber as any)[k] = v.trim()
      await saveCompany(sauber)
      setC(sauber); setEntwurf(sauber); setBearbeiten(false)
      toast('Firmendaten gespeichert')
    } catch (e) {
      toast('Speichern fehlgeschlagen: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (laden) return <div className="col-empty">Lade …</div>

  return (
    <>
      <div className="page-head">
        <div><h1>Firmendaten</h1><span className="sub">Antippen = kopiert. Steuernummer, Adresse, Bank — alles an einem Ort.</span></div>
        <div className="row" style={{ gap: 8 }}>
          {!bearbeiten && (
            <>
              <button className="btn" onClick={() => kopiere('__alles', firmendatenText(c))}>
                {kopiert === '__alles' ? <Check size={16} /> : <Copy size={16} />} Alles
              </button>
              <button className="btn" onClick={() => { setEntwurf(c); setBearbeiten(true) }}><Pencil size={16} /> Bearbeiten</button>
            </>
          )}
        </div>
      </div>

      {!bearbeiten && !c.vatId?.trim() && (
        <div className="info-box firma-hinweis">
          <strong>USt-IdNr. fehlt noch.</strong> Kostenlos beim Bundeszentralamt für Steuern beantragen — du brauchst nur Steuernummer, Finanzamt, Name und Adresse. Die Nummer kommt per Post.
          {c.vatIdNotiz ? <div className="muted" style={{ marginTop: 6 }}>{c.vatIdNotiz}</div> : null}
          <div style={{ marginTop: 10 }}>
            <a className="btn btn-primary" href={BZST_ANTRAG} target="_blank" rel="noreferrer">Beim BZSt beantragen <ExternalLink size={14} /></a>
          </div>
        </div>
      )}

      {GRUPPEN.map((g) => (
        <section className="firma-gruppe" key={g.titel}>
          <div className="firma-titel">{g.titel}</div>
          <div className="firma-liste">
            {g.felder.map((f) => {
              const wert = String((bearbeiten ? entwurf[f.key] : c[f.key]) ?? '')
              if (bearbeiten) {
                return (
                  <label className="firma-zeile firma-edit" key={f.key}>
                    <span className="firma-label">{f.label}</span>
                    {f.mehrzeilig
                      ? <textarea rows={2} value={wert} placeholder={f.platzhalter} onChange={(e) => setEntwurf((p) => ({ ...p, [f.key]: e.target.value }))} />
                      : <input value={wert} placeholder={f.platzhalter} onChange={(e) => setEntwurf((p) => ({ ...p, [f.key]: e.target.value }))} />}
                  </label>
                )
              }
              const leer = !wert.trim()
              return (
                <button
                  type="button"
                  className={`firma-zeile${leer ? ' leer' : ''}`}
                  key={f.key}
                  disabled={leer}
                  onClick={() => kopiere(String(f.key), wert)}
                >
                  <span className="firma-label">{f.label}</span>
                  <span className={`firma-wert${f.mono ? ' mono' : ''}`}>{leer ? 'fehlt noch' : wert}</span>
                  {!leer && (kopiert === f.key ? <Check size={16} className="firma-icon ok" /> : <Copy size={16} className="firma-icon" />)}
                </button>
              )
            })}
            {bearbeiten && g.titel === 'Steuer' && (
              <label className="firma-zeile firma-edit">
                <span className="firma-label">Stand USt-IdNr.</span>
                <input value={entwurf.vatIdNotiz ?? ''} placeholder="z. B. beantragt am 28.10." onChange={(e) => setEntwurf((p) => ({ ...p, vatIdNotiz: e.target.value }))} />
              </label>
            )}
          </div>
        </section>
      ))}

      {bearbeiten && (
        <div className="modal-actions" style={{ marginTop: 16 }}>
          {Object.keys(c).length > 0 && <button className="btn" onClick={() => { setEntwurf(c); setBearbeiten(false) }}>Abbrechen</button>}
          <button className="btn btn-primary" onClick={speichern} disabled={busy}>{busy ? 'Speichere …' : 'Speichern'}</button>
        </div>
      )}

      {!bearbeiten && (
        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
          Diese Daten stehen auch automatisch auf Rechnungen und Verträgen.
        </p>
      )}
    </>
  )
}
