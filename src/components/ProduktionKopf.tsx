// Kopf fuer Produktion und Medien: ein Titel, darunter die Reiter des
// Bereichs (BereichReiter, aus lib/bereiche.ts).

import BereichReiter from './BereichReiter'

export default function ProduktionKopf(_props: { unter?: string }) {
  return (
    <>
      <h1 className="h-gruss">Produktion</h1>
      <BereichReiter />
    </>
  )
}
