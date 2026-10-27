// Die Frage "Welcher Betrieb?" beim Posten (Logik: lib/betriebWahl.ts).
// Einmal im Layout eingehaengt, damit jede Seite dieselbe Frage zeigt.

import { useEffect, useState } from 'react'
import Modal from './Modal'
import { setBetriebFrage } from '../lib/betriebWahl'
import type { Channel } from '../lib/channels'

interface Offen { kanaele: Channel[]; antworten: (id: string | undefined) => void }

export default function BetriebWahl() {
  const [offen, setOffen] = useState<Offen | null>(null)

  useEffect(() => {
    setBetriebFrage((kanaele) => new Promise<string | undefined>((resolve) => {
      setOffen({ kanaele, antworten: (id) => { setOffen(null); resolve(id) } }) // eslint-disable-line react-hooks/exhaustive-deps
    }))
    return () => setBetriebFrage(null)
  }, [])

  if (!offen) return null
  return (
    <Modal title="Wo wurde gepostet?" onClose={() => offen.antworten(undefined)}>
      <p className="bw-hinweis">Dann holen wir Link und Zahlen direkt vom richtigen Account.</p>
      <div className="bw-liste">
        {offen.kanaele.map((k) => (
          <button key={k.id} type="button" className="bw-knopf" onClick={() => offen.antworten(k.id)}>
            <span className="bw-punkt" style={{ background: k.color }} />
            {k.name}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => offen.antworten(undefined)}>Abbrechen</button>
      </div>
    </Modal>
  )
}
