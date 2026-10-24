// Reiter zwischen zusammengehoerigen Seiten (Geld: Monate · Rechnungen ·
// Finanzen, Analyse: Analyse · Leistung, Kunden: Kunden · Leads, Produktion:
// Produktion · Medien). Steht oben auf jeder dieser Seiten, damit man nicht
// ueber "Mehr" zurueck muss. Welche Seiten zusammengehoeren, steht in
// lib/bereiche.ts (Feld `reiter`).

import { NavLink, useLocation } from 'react-router-dom'
import { reiterVon } from '../lib/bereiche'

export default function BereichReiter() {
  const { pathname } = useLocation()
  const seiten = reiterVon(pathname)
  if (seiten.length < 2) return null
  return (
    <nav className="n-segment b-reiter" aria-label="Bereich">
      {seiten.map((s) => (
        <NavLink key={s.to} to={s.to} end={s.end} className={({ isActive }) => (isActive ? 'on' : '')}>{s.label}</NavLink>
      ))}
    </nav>
  )
}
