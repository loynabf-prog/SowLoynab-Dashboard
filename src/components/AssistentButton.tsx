// Der schwebende Knopf, der den Assistenten oeffnet.
// ---------------------------------------------------------------------------
// Ersetzt den frueheren Sprachbefehl-Knopf. Der konnte genau eine Sache pro
// Satz; der Assistent kann mehrere hintereinander. Ein Knopf statt zweier
// Wege, die fast dasselbe tun.

import { useEffect, useState } from 'react'
import AssistentPanel from './AssistentPanel'

export default function AssistentButton() {
  const [offen, setOffen] = useState(false)

  // Dieselbe Tastenkombination wie zuvor, damit niemand umlernen muss.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setOffen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        className="voice-fab"
        onClick={() => setOffen(true)}
        aria-label="Assistent"
        title="Sag, was passieren soll — der Assistent legt es an"
      >
        ✨
      </button>
      {offen && (
        <AssistentPanel
          onClose={() => setOffen(false)}
          // Nach dem Anlegen die Seite neu holen, damit man das Ergebnis
          // sofort sieht, statt es glauben zu muessen.
          onFertig={() => window.dispatchEvent(new CustomEvent('daten-geaendert'))}
        />
      )}
    </>
  )
}
