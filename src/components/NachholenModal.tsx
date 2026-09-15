// Daten eines geloeschten Kunden nachholen.
// ---------------------------------------------------------------------------
// Wenn beim Zusammenlegen etwas liegen geblieben ist -- oder ein Kunde von
// Hand geloescht wurde, obwohl noch Videos an ihm hingen -- ist nichts
// verloren: Geloescht heisst Papierkorb, die Zeilen haengen nur weiter am
// alten Kunden.
//
// Dieses Fenster zeigt jeden Kunden im Papierkorb mit allem, was noch an ihm
// haengt, und holt es auf Knopfdruck zum aktuellen Kunden herueber.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { fuehreZusammen, zaehleUmzug, TABELLEN_NAMEN, type MergeZaehlung } from '../lib/mergeClients'

interface Geloeschter {
  id: string
  name: string
  deleted_at: string | null
  zaehlung: MergeZaehlung[]
  gesamt: number
}

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
  const [liste, setListe] = useState<Geloeschter[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function laden() {
    setError(null)
    const { data, error: e } = await supabase
      .from('clients')
      .select('id, name, deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(50)
    if (e) { setError(e.message); setListe([]); return }

    const out: Geloeschter[] = []
    for (const c of (data ?? []) as any[]) {
      if (c.id === zielId) continue
      const zaehlung = await zaehleUmzug(c.id)
      out.push({
        id: c.id,
        name: c.name,
        deleted_at: c.deleted_at,
        zaehlung,
        gesamt: zaehlung.reduce((s, z) => s + z.anzahl, 0),
      })
    }
    // Die mit Inhalt zuerst -- danach sucht man hier.
    out.sort((a, b) => b.gesamt - a.gesamt)
    setListe(out)
  }

  useEffect(() => { laden() }, [zielId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function hol(g: Geloeschter) {
    if (!confirm(`Alles von "${g.name}" zu "${zielName}" holen?`)) return
    setBusy(g.id)
    setError(null)
    const { error: e } = await fuehreZusammen(g.id, zielId)
    setBusy(null)
    if (e) { setError(e); return }
    await laden()
    onFertig()
  }

  return (
    <Modal title="Daten nachholen" onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}

        <p className="info-box" style={{ fontSize: 13 }}>
          Gelöschte Kunden landen im Papierkorb — ihre Videos, Zahlen und Rechnungen
          bleiben erhalten. Hier siehst du, was noch an ihnen hängt, und holst es zu{' '}
          <strong>{zielName}</strong>.
        </p>

        {liste === null ? (
          <p className="muted" style={{ fontSize: 13 }}>Suche …</p>
        ) : liste.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Es liegt kein Kunde im Papierkorb.</p>
        ) : (
          liste.map((g) => (
            <div className="nachhol-block" key={g.id}>
              <div className="nachhol-kopf">
                <div>
                  <div className="nachhol-name">{g.name}</div>
                  <div className="nachhol-datum">
                    gelöscht am {g.deleted_at ? new Date(g.deleted_at).toLocaleDateString('de-DE') : '–'}
                  </div>
                </div>
                <div className="spacer" />
                {g.gesamt > 0 && (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy != null}
                    onClick={() => hol(g)}
                  >
                    {busy === g.id ? 'Hole …' : 'Alles holen'}
                  </button>
                )}
              </div>

              {g.gesamt === 0 ? (
                <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
                  Hier hängt nichts mehr dran — bei diesem Kunden ist alles schon umgezogen.
                </p>
              ) : (
                <div className="merge-liste" style={{ marginTop: 8 }}>
                  {g.zaehlung.map((x) => (
                    <div className="merge-zeile" key={x.tabelle}>
                      <span className="merge-anzahl">{x.anzahl}</span>
                      <span>{TABELLEN_NAMEN[x.tabelle] ?? x.tabelle}</span>
                    </div>
                  ))}
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
