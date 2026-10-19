// Kopf fuer Produktion und Medien: ein Titel, ein Umschalter.
// Medien gehoert zur Produktion -- dort liegt das Material, das man dreht
// und schneidet. Deshalb kein eigener Reiter unten, sondern dieser Schalter.

import { NavLink } from 'react-router-dom'

export default function ProduktionKopf({ unter }: { unter: string }) {
  return (
    <>
      <div className="h-datum">{unter}</div>
      <h1 className="h-gruss">Produktion</h1>
      <nav className="n-segment" aria-label="Produktion">
        <NavLink to="/produktion" className={({ isActive }) => (isActive ? 'on' : '')}>Aufgaben</NavLink>
        <NavLink to="/medien" className={({ isActive }) => (isActive ? 'on' : '')}>Medien</NavLink>
      </nav>
    </>
  )
}
