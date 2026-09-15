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
import Modal from './Modal'
import {
  bestandJeKunde, fuehreZusammen, zaehleUmzug, TABELLEN_NAMEN,
  type KundenBestand, type MergeZaehlung,
} from '../lib/mergeClients'

export default function NachholenModal({
  zielId,
  zielName,
  onClose,
  onFertig,
}: {
  zielId: string
  zielName: string
  onClose: () => void
  onFertig: () => void
}) {
  const [liste, setListe] = useState<KundenBestand[] | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [detail, setDetail] = useState<MergeZaehlung[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function laden() {
    setError(null)
    const alle = await bestandJeKunde()
    // Die mit dem meisten Inhalt zuerst -- danach sucht man hier.
    alle.sort((a, b) => b.videos - a.videos)
    setListe(alle)
  }

  useEffect(() => { laden() }, [zielId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function aufklappen(k: KundenBestand) {
    if (offen === k.id) { setOffen(null); setDetail(null); return }
    setOffen(k.id)
    setDetail(null)
    setDetail(await zaehleUmzug(k.id))
  }

  async function hol(k: KundenBestand) {
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
    onFertig()
  }

  const ich = liste?.find((k) => k.id === zielId)
  const andere = (liste ?? []).filter((k) => k.id !== zielId)

  return (
    <Modal title="Daten nachholen" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}

        <p className="info-box" style={{ fontSize: 13 }}>
          Hier steht, bei welchem Kunden die Videos tatsächlich hängen — auch bei
          gelöschten. Wo die Zahl steht, stecken die Daten. Auf einen Kunden tippen
          zeigt, was genau an ihm hängt.
        </p>

        {ich && (
          <div className="bestand-ich">
            <strong>{zielName}</strong> hat aktuell{' '}
            <strong>{ich.videos}</strong> {ich.videos === 1 ? 'Video' : 'Videos'}.
          </div>
        )}

        {liste === null ? (
          <p className="muted" style={{ fontSize: 13 }}>Zähle …</p>
        ) : andere.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Es gibt keinen anderen Kunden.</p>
        ) : (
          andere.map((k) => (
            <div className={`nachhol-block ${k.videos > 0 ? 'hat-was' : ''}`} key={k.id}>
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
                  </div>
                </div>
                <div className="spacer" />
                <span className="nachhol-pfeil">{offen === k.id ? '▾' : '▸'}</span>
              </button>

              {offen === k.id && (
                <div className="nachhol-detail">
                  {detail === null ? (
                    <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Zähle …</p>
                  ) : detail.length === 0 ? (
                    <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                      Hier hängt nichts dran.
                    </p>
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
                  )}
                </div>
              )}
            </div>
          ))
        )}

        <div className="modal-actions">
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </Modal>
  )
}
