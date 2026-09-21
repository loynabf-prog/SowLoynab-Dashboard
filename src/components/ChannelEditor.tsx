// Die Kanäle eines Kunden bearbeiten.
// ---------------------------------------------------------------------------
// Ein Kanal ist ein Betrieb unter dem Dach des Kunden -- mit eigenem Namen,
// eigener Farbe und eigenen Social-Accounts. Videos und Ideen haengen an
// einem Kanal, damit sich zwei Betriebe nicht vermischen.
//
// Solange es keinen oder einen Kanal gibt, bleibt das hier klein: ein Satz
// und ein Knopf. Erst ab zwei Kanälen faengt die App ueberhaupt an, farbig
// zu trennen und zu filtern.

import { FARBEN, FARB_NAMEN, naechsteFarbe, type ChannelEntwurf } from '../lib/channels'

export default function ChannelEditor({
  entwuerfe,
  onChange,
}: {
  entwuerfe: ChannelEntwurf[]
  onChange: (next: ChannelEntwurf[]) => void
}) {
  function setze(i: number, patch: Partial<ChannelEntwurf>) {
    onChange(entwuerfe.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  }

  function raus(i: number) {
    const e = entwuerfe[i]
    if (e.id && !confirm(`Kanal „${e.name}" entfernen? Die Videos bleiben erhalten — sie verlieren nur ihre Farbe und Zuordnung.`)) return
    onChange(entwuerfe.filter((_, j) => j !== i))
  }

  function dazu() {
    onChange([...entwuerfe, { id: null, name: '', color: naechsteFarbe(entwuerfe.map((e) => e.color)) }])
  }

  // Gleiche Namen laesst die Datenbank nicht zu -- lieber gleich hier zeigen.
  const zaehler = new Map<string, number>()
  for (const e of entwuerfe) {
    const n = e.name.trim().toLowerCase()
    if (!n) continue
    zaehler.set(n, (zaehler.get(n) ?? 0) + 1)
  }

  return (
    <div className="kanal-editor">
      <label>
        Kanäle{' '}
        <span className="muted">(nur nötig, wenn ein Kunde zwei Betriebe hat)</span>
      </label>

      {entwuerfe.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
          Ein Betrieb, ein Auftritt — nichts zu trennen. Hat dieser Kunde zwei
          Betriebe mit je eigenen Accounts, leg hier für jeden einen Kanal an.
        </p>
      ) : (
        <div className="kanal-liste">
          {entwuerfe.map((e, i) => {
            const doppelt = (zaehler.get(e.name.trim().toLowerCase()) ?? 0) > 1
            return (
              <div className={`kanal-zeile ${doppelt ? 'doppelt' : ''}`} key={i}>
                <input
                  className="kanal-name"
                  value={e.name}
                  onChange={(ev) => setze(i, { name: ev.target.value })}
                  placeholder="Name des Betriebs"
                  aria-label="Name des Kanals"
                />
                <div className="kanal-farben" role="group" aria-label="Farbe">
                  {FARBEN.map((f) => (
                    <button
                      type="button"
                      key={f}
                      className={`kanal-farbe ${e.color === f ? 'on' : ''}`}
                      style={{ background: f }}
                      onClick={() => setze(i, { color: f })}
                      aria-label={FARB_NAMEN[f] ?? f}
                      aria-pressed={e.color === f}
                      title={FARB_NAMEN[f] ?? f}
                    />
                  ))}
                </div>
                <button type="button" className="acc-weg" onClick={() => raus(i)} aria-label={`Kanal ${e.name || '(ohne Namen)'} entfernen`}>
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="acc-dazu">
        <button type="button" className="btn btn-sm btn-ghost" onClick={dazu}>＋ Kanal</button>
      </div>

      {[...zaehler.values()].some((n) => n > 1) && (
        <p className="acc-warn">Zwei Kanäle heißen gleich — das geht nicht.</p>
      )}

      {entwuerfe.length === 1 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Mit einem einzigen Kanal bleibt alles wie bisher. Farben und Filter
          erscheinen erst ab zwei.
        </p>
      )}
    </div>
  )
}
