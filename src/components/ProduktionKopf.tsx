// Kopf fuer Produktion und Medien: ein Titel, darunter die Reiter des
// Bereichs (BereichReiter, aus lib/bereiche.ts).

import BereichReiter from './BereichReiter'

export default function ProduktionKopf({ unter }: { unter: string }) {
  return (
    <>
      <div className="h-datum">{unter}</div>
      <h1 className="h-gruss">Produktion</h1>
      <BereichReiter />
    </>
  )
}
