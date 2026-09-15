// Daten eines anderen Kunden nachholen -- "wo sind meine Videos hin?"
// ---------------------------------------------------------------------------
// Zwei Faelle, ein Fenster:
//
//   1. Beim Zusammenlegen ist etwas liegen geblieben. Der alte Kunde ist im
//      Papierkorb, seine Videos haengen noch an ihm.
//   2. Das Zusammenlegen lief in die FALSCHE RICHTUNG. Dann ist am
//      geloeschten Kunden nichts mehr dran -- alles sitzt bei einem anderen
//      lebenden Kunden, und man findet es nicht, weil man nicht weiss, bei
//      welchem.
//
// Deshalb zeigt die Liste JEDEN Kunden mit seiner Videozahl, geloeschte
// eingeschlossen. Wo die Zahl steht, stecken die Daten.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import {
  bestandJeKunde, fuehreZusammen, videosGesamt, zaehleUmzug, TABELLEN_NAMEN,
  type KundenBestand, type MergeZaehlung,
} from '../lib/mergeClients'
import { holeAllesZurueck, papierkorbStand, TABELLE_NAME, type PapierkorbStand } from '../lib/papierkorb'

/**
 * Ohne zielId ist es reine Uebersicht: welcher Kunde hat wie viele Videos,
 * mit Sprung zum Kunden. Mit zielId kommt bei jedem Kunden der Knopf dazu,
 * alles zu diesem Ziel zu holen.
 */
export default function NachholenModal({
  zielId,
  zielName,
  onClose,
  onFertig,
}: {
  zielId?: string
  zielName?: string
  onClose: () => void
  onFertig?: () => void
}) {
  const [liste, setListe] = useState<KundenBestand[] | null>(null)
  const [summe, setSumme] = useState<{ aktiv: number; imPapierkorb: number } | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [detail, setDetail] = useState<MergeZaehlung[] | null>(null)
  // Was liegt bei dem aufgeklappten Kunden im Papierkorb? Videos koennen
  // beim richtigen Kunden haengen und trotzdem unsichtbar sein, weil sie
  // selbst als geloescht markiert sind.
  const [muell, setMuell] = useState<PapierkorbStand[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function laden() {
    setError(null)
    const alle = await bestandJeKunde()
    // Die mit dem meisten Inhalt zuerst -- danach sucht man hier.
    alle.sort((a, b) => (b.videos + b.imPapierkorb) - (a.videos + a.imPapierkorb))
    setListe(alle)
    setSumme(await videosGesamt())
  }

  useEffect(() => { laden() }, [zielId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function aufklappen(k: KundenBestand) {
    if (offen === k.id) { setOffen(null); setDetail(null); setMuell(null); return }
    setOffen(k.id)
    setDetail(null)
    setMuell(null)
    setDetail(await zaehleUmzug(k.id))
    setMuell(await papierkorbStand(k.id))
  }

  /** Alles, was bei diesem Kunden im Papierkorb liegt, wieder sichtbar machen. */
  async function ausPapierkorb(k: KundenBestand, stand: PapierkorbStand[]) {
    const was = stand.map((x) => `${x.anzahl} ${TABELLE_NAME[x.tabelle]}`).join(', ')
    if (!confirm(`${was} bei "${k.name}" aus dem Papierkorb holen?`)) return
    setBusy(k.id)
    setError(null)
    const { anzahl, error: e } = await holeAllesZurueck(k.id)
    setBusy(null)
    if (e) { setError(e); return }
    setMuell(await papierkorbStand(k.id))
    await laden()
    onFertig?.()
    alert(anzahl === 0
      ? 'Es war nichts zum Zurückholen da.'
      : `${anzahl} Einträge sind wieder da.`)
  }

  async function hol(k: KundenBestand) {
    if (!zielId || !zielName) return
    const warnung = k.geloescht
      ? `Alles von "${k.name}" zu "${zielName}" holen?`
      : `Alles von "${k.name}" zu "${zielName}" holen?\n\n"${k.name}" wandert danach in den Papierkorb.`
    if (!confirm(warnung)) return
    setBusy(k.id)
    setError(null)
    const { error: e } = await fuehreZusammen(k.id, zielId)
    setBusy(null)
    if (e) { setError(e); return }
    setOffen(null); setDetail(null)
    await laden()
    onFertig?.()
  }

  const ich = zielId ? liste?.find((k) => k.id === zielId) : undefined
  const andere = (liste ?? []).filter((k) => k.id !== zielId)

  return (
    <Modal title="Daten nachholen" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}

        <p className="info-box" style={{ fontSize: 13 }}>
          Hier steht, bei welchem Kunden die Videos tatsächlich hängen — auch bei
          gelöschten. Wo die Zahl steht, stecken die Daten. Auf einen Kunden tippen
          zeigt, was genau an ihm hängt.{!zielId && ' Von dort kommst du direkt zum Kunden.'}
        </p>

        {summe && (
          <div className="bestand-summe">
            In der Datenbank liegen insgesamt <strong>{summe.aktiv + summe.imPapierkorb}</strong>{' '}
            Videos{summe.imPapierkorb > 0 && <> — davon {summe.imPapierkorb} im Papierkorb</>}.
            {ich && <> <strong>{zielName}</strong> hat davon <strong>{ich.videos}</strong>.</>}
          </div>
        )}

        {liste === null ? (
          <p className="muted" style={{ fontSize: 13 }}>Zähle …</p>
        ) : andere.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Es gibt keinen anderen Kunden.</p>
        ) : (
          andere.map((k) => (
            <div className={`nachhol-block ${k.videos + k.imPapierkorb > 0 ? 'hat-was' : ''}`} key={k.id}>
              <button type="button" className="nachhol-kopf" onClick={() => aufklappen(k)}>
                <div>
                  <div className="nachhol-name">
                    {k.name}
                    {k.geloescht && <span className="nachhol-tag">Papierkorb</span>}
                  </div>
                  <div className="nachhol-datum">
                    {k.videos > 0
                      ? `${k.videos} ${k.videos === 1 ? 'Video' : 'Videos'} hängen hier`
                      : 'keine Videos'}
                    {k.imPapierkorb > 0 && ` · ${k.imPapierkorb} im Papierkorb`}
                  </div>
                </div>
                <div className="spacer" />
                <span className="nachhol-pfeil">{offen === k.id ? '▾' : '▸'}</span>
              </button>

              {offen === k.id && (
                <div className="nachhol-detail">
                  {/* Zuerst der Papierkorb: liegt hier etwas drin, ist das
                      fast immer die Antwort -- die Sachen sind schon beim
                      richtigen Kunden, nur unsichtbar. */}
                  {muell != null && muell.length > 0 && (
                    <div className="muell-hinweis">
                      <div>
                        <strong>Im Papierkorb dieses Kunden liegen:</strong>{' '}
                        {muell.map((x) => `${x.anzahl} ${TABELLE_NAME[x.tabelle]}`).join(', ')}.
                        Sie hängen schon hier — sie sind nur ausgeblendet.
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy != null}
                        onClick={() => ausPapierkorb(k, muell)}
                      >
                        {busy === k.id ? 'Hole …' : 'Alle wieder sichtbar machen'}
                      </button>
                    </div>
                  )}

                  {detail === null ? (
                    <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Zähle …</p>
                  ) : detail.length === 0 ? (
                    muell != null && muell.length > 0 ? null : (
                      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                        Hier hängt nichts dran.
                      </p>
                    )
                  ) : (
                    <>
                      <div className="merge-liste">
                        {detail.map((x) => (
                          <div className="merge-zeile" key={x.tabelle}>
                            <span className="merge-anzahl">{x.anzahl}</span>
                            <span>{TABELLEN_NAMEN[x.tabelle] ?? x.tabelle}</span>
                          </div>
                        ))}
                      </div>
                      {zielId ? (
                        <>
                          <button
                            className="btn btn-sm btn-primary"
                            style={{ marginTop: 10 }}
                            disabled={busy != null}
                            onClick={() => hol(k)}
                          >
                            {busy === k.id ? 'Hole …' : `Alles zu ${zielName} holen`}
                          </button>
                          {!k.geloescht && (
                            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                              „{k.name}" wandert danach in den Papierkorb und lässt sich von
                              dort wiederherstellen.
                            </p>
                          )}
                        </>
                      ) : k.geloescht ? (
                        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                          Dieser Kunde liegt im Papierkorb. Geh zu dem Kunden, bei dem die
                          Videos landen sollen, und hol sie dort.
                        </p>
                      ) : (
                        <Link
                          className="btn btn-sm btn-primary"
                          style={{ marginTop: 10 }}
                          to={`/client/${k.id}`}
                          onClick={onClose}
                        >
                          Zu {k.name} →
                        </Link>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* Damit erkennbar ist, ob das Handy noch eine alte Fassung zeigt. */}
        <p className="muted" style={{ fontSize: 11, textAlign: 'center', margin: 0 }}>
          App-Stand: {new Date(__BUILD__).toLocaleString('de-DE')}
        </p>

        <div className="modal-actions">
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </Modal>
  )
}
