// Den Monat verplanen -- das eine Fenster fuer die Posting-Organisation.
// ---------------------------------------------------------------------------
// Alles laeuft auf Monatsbasis: Monat waehlen, Menge festlegen, Rhythmus
// bestimmen, anlegen. Der Normalfall ist immer derselbe -- die zugesagte
// Menge gleichmaessig verteilt -- und steht deshalb vorne und vorbelegt da.
//
// Tage, an denen fuer diesen Kunden schon ein Video liegt, werden
// uebersprungen. Ein zweiter Durchlauf legt also nur nach, was fehlt,
// statt Dubletten zu erzeugen.

import { useMemo, useState } from 'react'
import Modal from './Modal'
import {
  WOCHENTAGE, gleichmaessigeTermine, monatVersetzt, monatsTitel,
  platzhalterNamen, terminVorschau, vorschlagAbstand, wochentagTermine,
  type Rhythmus,
} from '../lib/monatsrhythmus'

export interface PlanErgebnis {
  monatsKey: string
  menge: number
  zeilen: { title: string; scheduled_date: string; scheduled_time: string | null }[]
}

export default function MonatsplanModal({
  startMonat,
  retainer,
  mengeImMonat,
  belegteTage,
  vorhandeneNummern,
  onClose,
  onAnlegen,
}: {
  startMonat: string
  /** Was laut Vertrag normalerweise im Monat faellig ist. */
  retainer: number
  /** Gueltige Menge je Monat (Retainer oder Ausnahme) — fuer den Monatswechsel. */
  mengeImMonat: (key: string) => number
  /** Tage, an denen schon ein Video dieses Kunden liegt, je Monat. */
  belegteTage: (key: string) => string[]
  /** Hoechste vergebene Platzhalter-Nummer im Monat, damit weitergezaehlt wird. */
  vorhandeneNummern: (key: string) => number
  onClose: () => void
  onAnlegen: (e: PlanErgebnis) => Promise<void> | void
}) {
  const [monat, setMonat] = useState(startMonat)
  const [menge, setMenge] = useState(String(mengeImMonat(startMonat) || retainer || 8))
  const [rhythmus, setRhythmus] = useState<Rhythmus>('gleichmaessig')
  const [startTag, setStartTag] = useState(1)
  // Leer = automatisch. Sobald von Hand gesetzt, bleibt der Wert stehen.
  const [abstand, setAbstand] = useState<number | null>(null)
  const [tage, setTage] = useState<number[]>([1, 3]) // Di + Do
  const [zeit, setZeit] = useState('')
  const [busy, setBusy] = useState(false)

  const anzahl = Math.max(0, Number(menge.replace(/[^\d]/g, '')) || 0)
  const autoAbstand = vorschlagAbstand(monat, anzahl, startTag)
  const echterAbstand = abstand ?? autoAbstand

  function wechsel(n: number) {
    const neu = monatVersetzt(monat, n)
    setMonat(neu)
    setMenge(String(mengeImMonat(neu) || retainer || 8))
    setAbstand(null)
  }

  const termine = useMemo(() => (
    rhythmus === 'gleichmaessig'
      ? gleichmaessigeTermine({ monatsKey: monat, anzahl, startTag, abstand: echterAbstand })
      : wochentagTermine({ monatsKey: monat, anzahl, tage, abTag: startTag })
  ), [rhythmus, monat, anzahl, startTag, echterAbstand, tage])

  const belegt = useMemo(() => new Set(belegteTage(monat)), [monat, belegteTage])
  const frei = termine.filter((t) => !belegt.has(t))
  const schonDa = termine.length - frei.length
  const passenNicht = anzahl - termine.length

  async function anlegen() {
    if (frei.length === 0) return
    setBusy(true)
    const namen = platzhalterNamen(monat, frei.length, vorhandeneNummern(monat))
    await onAnlegen({
      monatsKey: monat,
      menge: anzahl,
      zeilen: frei.map((d, i) => ({ title: namen[i], scheduled_date: d, scheduled_time: zeit || null })),
    })
    setBusy(false)
  }

  return (
    <Modal title="📅 Monatsplan" onClose={onClose}>
      <div className="stack">
        <div className="mp-monat">
          <button type="button" className="mp-pfeil" onClick={() => wechsel(-1)} aria-label="Monat zurück">‹</button>
          <div className="mp-monat-name">{monatsTitel(monat)}</div>
          <button type="button" className="mp-pfeil" onClick={() => wechsel(1)} aria-label="Monat vor">›</button>
        </div>

        <div>
          <label htmlFor="mpmenge">Wie viele Videos?</label>
          <div className="mp-menge">
            <input
              id="mpmenge"
              value={menge}
              onChange={(e) => { setMenge(e.target.value); setAbstand(null) }}
              inputMode="numeric"
            />
            {retainer > 0 && anzahl !== retainer && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMenge(String(retainer)); setAbstand(null) }}>
                zurück auf {retainer}
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>
            {retainer > 0
              ? anzahl === retainer
                ? `Entspricht dem Retainer (${retainer} pro Monat).`
                : `Weicht vom Retainer (${retainer}) ab — gilt nur für ${monatsTitel(monat)}.`
              : 'Für diesen Kunden ist kein Retainer hinterlegt.'}
          </p>
        </div>

        <div>
          <label>Rhythmus</label>
          <div className="seg">
            <button
              type="button"
              className={`seg-btn ${rhythmus === 'gleichmaessig' ? 'on' : ''}`}
              onClick={() => setRhythmus('gleichmaessig')}
            >
              Gleichmäßig
            </button>
            <button
              type="button"
              className={`seg-btn ${rhythmus === 'wochentage' ? 'on' : ''}`}
              onClick={() => setRhythmus('wochentage')}
            >
              Wochentage
            </button>
          </div>
        </div>

        {rhythmus === 'gleichmaessig' ? (
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="mpabst">Alle … Tage</label>
              <input
                id="mpabst"
                value={String(echterAbstand)}
                onChange={(e) => setAbstand(Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 1))}
                inputMode="numeric"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="mpstart">Start am</label>
              <input
                id="mpstart"
                value={String(startTag)}
                onChange={(e) => { setStartTag(Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 1)); setAbstand(null) }}
                inputMode="numeric"
              />
            </div>
          </div>
        ) : (
          <div>
            <label>An welchen Tagen?</label>
            <div className="mp-wochentage">
              {WOCHENTAGE.map((w, i) => (
                <button
                  type="button"
                  key={w}
                  className={`mp-wt ${tage.includes(i) ? 'on' : ''}`}
                  aria-pressed={tage.includes(i)}
                  onClick={() => setTage((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i].sort()))}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="mpzeit">Uhrzeit (optional)</label>
          <input id="mpzeit" type="time" value={zeit} onChange={(e) => setZeit(e.target.value)} />
        </div>

        {/* Die Vorschau ist der eigentliche Beweis: hier steht schwarz auf
            weiss, an welchen Tagen etwas entsteht. */}
        <div className="mp-vorschau">
          {frei.length === 0 ? (
            <span className="muted">
              {anzahl === 0 ? 'Trag oben eine Menge ein.' : 'Für diese Einstellung bleibt kein freier Tag übrig.'}
            </span>
          ) : (
            <>
              <div className="mp-tage">{terminVorschau(termine)}</div>
              <div className="mp-summe">
                <strong>{frei.length}</strong> {frei.length === 1 ? 'Video wird' : 'Videos werden'} angelegt
                {schonDa > 0 && <> · {schonDa} {schonDa === 1 ? 'Tag ist' : 'Tage sind'} schon belegt</>}
              </div>
            </>
          )}
          {passenNicht > 0 && (
            <div className="mp-warn">
              {passenNicht} {passenNicht === 1 ? 'Termin passt' : 'Termine passen'} mit diesem Abstand nicht mehr
              in den Monat. Abstand verkleinern oder früher starten.
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Abbrechen</button>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={anlegen} disabled={busy || frei.length === 0}>
            {busy ? 'Lege an …' : `${frei.length} anlegen`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
