// Die Schale der App: Handy-Leiste unten, Seitenleiste am Desktop.
// ---------------------------------------------------------------------------
// Unten fuenf Ziele (Heute, Ofen, Kalender, Monat, Analyse), "Neu" oben im
// Kopf. Alles andere liegt auf der Seite "Mehr"
// (pages/Mehr.tsx), erreichbar ueber das Profilbild oben rechts: sieben
// Bereiche, jede Seite mit einem Satz. Welche Seite wohin gehoert, steht in
// lib/bereiche.ts -- wer einem Mitglied nur bestimmte Bereiche gibt, sieht
// dort auch nur diese.

import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Plus, Search, Sparkles, LayoutGrid } from 'lucide-react'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { HAUPT_PFADE, sichtbareBereiche } from '../lib/bereiche'
import { RAEUME, raumVon } from '../lib/raeume'
import { symbolVon } from '../lib/seitenSymbole'
import AssistentButton from './AssistentButton'
import NudgeCenter from './NudgeCenter'
import ChatButton from './ChatButton'
import CommandPalette from './CommandPalette'
import QuickAdd from './QuickAdd'
import UpdatePrompt from './UpdatePrompt'
import NutzungsMesser from './NutzungsMesser'
import BetriebWahl from './BetriebWahl'

/**
 * Die vier Raeume (Fassie, 01.11.2026): Heute, Kunden, Zahlen, Werkstatt.
 * Unten in der Leiste und links in der Seitenleiste stehen nur die vier;
 * jeder Raum hat oben seine Reiter (lib/raeume.ts).
 */

/** Am Desktop unter den Raeumen: nur das, was wir noch ab und zu brauchen. */
const NEBEN = ['/aufgaben', '/team']

export default function Layout({ children }: { children: React.ReactNode }) {
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const location = useLocation()
  const navigate = useNavigate()

  const ich = memberId ? byId(memberId) : undefined
  const bereiche = sichtbareBereiche(ich?.bereiche)
  const raum = raumVon(location.pathname)
  // Seitenleiste am Desktop: alles ausser den Hauptzielen, gruppiert nach Bereich.
  const neben = bereiche.flatMap((b) => b.seiten).filter((s) => NEBEN.includes(s.to) && !HAUPT_PFADE.includes(s.to))
  const gruppen = neben.length ? [{ titel: 'Mehr', seiten: neben }] : []
  const breit = location.pathname.startsWith('/client/') || location.pathname === '/kalender' || location.pathname.startsWith('/chat')
  const chat = location.pathname.startsWith('/chat')
  const animKey = location.pathname.startsWith('/client/') ? 'client' : chat ? 'chat' : location.pathname
  const mehr = location.pathname === '/mehr'

  const neu = () => window.dispatchEvent(new Event('open-quickadd'))

  // Kopf auf "Heute" (Handy): startet versteckt, kommt beim Runterziehen
  // oben am Seitenanfang, verschwindet beim Weiterscrollen wieder.
  // Fassie (02.11.2026): "Wir kennen ja die App ... wenn wir es brauchen,
  // ziehen wir es runter."
  const kopfWeg = location.pathname === '/'
  const [kopfOffen, setKopfOffen] = useState(false)
  useEffect(() => { setKopfOffen(false) }, [location.pathname])
  useEffect(() => {
    if (!kopfWeg) return
    let startY: number | null = null
    let letzteY = window.scrollY
    const start = (e: TouchEvent) => { startY = window.scrollY <= 2 ? e.touches[0].clientY : null }
    const zug = (e: TouchEvent) => { if (startY != null && e.touches[0].clientY - startY > 45) { setKopfOffen(true); startY = null } }
    const scroll = () => {
      const y = window.scrollY
      if (y > letzteY + 6 && y > 30) setKopfOffen(false)
      letzteY = y
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchmove', zug, { passive: true })
    window.addEventListener('scroll', scroll, { passive: true })
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', zug)
      window.removeEventListener('scroll', scroll)
    }
  }, [kopfWeg])

  return (
    <div className={`n-schale ${kopfWeg ? 'kopf-weg' : ''}`}>
      {/* Desktop: Seitenleiste */}
      <aside className="n-seite" aria-label="Navigation">
        <Link to="/" className="n-marke"><i>S&amp;L</i>Sow &amp; Loynab</Link>
        <button className="n-seite-neu" onClick={neu}><Plus size={17} strokeWidth={2.4} />Neu</button>
        {RAEUME.map((r) => (
          <div key={r.key} className={`n-seite-raum ${raum?.key === r.key ? 'on' : ''}`}>
            <NavLink to={r.reiter[0].to} end={r.reiter[0].end} className={() => `n-seite-link ${raum?.key === r.key ? 'on' : ''}`}>
              <r.icon strokeWidth={2} />{r.label}
            </NavLink>
            {raum?.key === r.key && r.reiter.length > 1 && (
              <div className="n-seite-unter">
                {r.reiter.map((x) => <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => (isActive ? 'on' : '')}>{x.label}</NavLink>)}
              </div>
            )}
          </div>
        ))}
        {gruppen.map((g) => (
          <div key={g.titel}>
            <div className="n-seite-titel">{g.titel}</div>
            <NavLink to="/mehr" className={({ isActive }) => `n-seite-link ${isActive ? 'on' : ''}`}><LayoutGrid strokeWidth={2} />Alles</NavLink>
            {g.seiten.map((s) => {
              const I = symbolVon(s.to)
              return (
                <NavLink key={s.to} to={s.to} end={s.end} title={s.was} className={({ isActive }) => `n-seite-link ${isActive ? 'on' : ''}`}>
                  <I strokeWidth={2} />{s.label}
                </NavLink>
              )
            })}
          </div>
        ))}
      </aside>

      {/* Kopf: Marke links (Handy), rechts die wenigen Werkzeuge */}
      <header className={`n-kopf ${kopfWeg ? 'versteckt' : ''} ${kopfWeg && kopfOffen ? 'offen' : ''}`}>
        <Link to="/" className="n-marke"><i>S&amp;L</i>Sow &amp; Loynab</Link>
        <span className="n-spacer" />
        <button className="n-kopf-knopf n-kopf-neu" onClick={neu} aria-label="Neu anlegen" title="Neu">
          <Plus size={22} strokeWidth={2.4} />
        </button>
        <button className="n-kopf-knopf" onClick={() => window.dispatchEvent(new Event('open-assistent'))} aria-label="Assistent" title="Assistent (⌘J)">
          <Sparkles size={21} strokeWidth={2} />
        </button>
        <button className="n-kopf-knopf" onClick={() => window.dispatchEvent(new Event('open-search'))} aria-label="Suchen" title="Suchen (⌘K)">
          <Search size={21} strokeWidth={2} />
        </button>
        <ChatButton />
        <NudgeCenter />
        <button
          className={`n-avatar ${mehr ? 'on' : ''}`}
          style={{ background: ich?.color ?? 'var(--text-dim)' }}
          onClick={() => { if (mehr) navigate(-1); else navigate('/mehr') }}
          aria-label="Mehr: alle Bereiche und Profil"
          title="Mehr"
        >
          {mehr ? <LayoutGrid size={18} strokeWidth={2.4} /> : (ich?.name ?? '?').slice(0, 1).toUpperCase()}
        </button>
      </header>

      <main className={`n-inhalt ${breit ? 'breit' : ''} ${chat ? 'chat' : ''}`}>
        {raum && raum.reiter.length > 1 && !location.pathname.startsWith('/client/') && (
          <nav className="n-segment n-raum-reiter" aria-label={raum.label}>
            {raum.reiter.map((x) => <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => (isActive ? 'on' : '')}>{x.label}</NavLink>)}
          </nav>
        )}
        <div className="page" key={animKey}>{children}</div>
      </main>

      {/* Handy: fuenf gleich breite Spalten; "Neu" sitzt oben im Kopf */}
      <nav className="n-leiste" aria-label="Hauptnavigation">
        {RAEUME.map((r) => {
          const on = raum?.key === r.key
          return (
            <NavLink key={r.key} to={r.reiter[0].to} end={r.reiter[0].end} className={() => `n-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
              <r.icon strokeWidth={on ? 2.3 : 1.9} />
              <span>{r.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <AssistentButton />
      <CommandPalette />
      <QuickAdd />
      <UpdatePrompt />
      <NutzungsMesser />
      <BetriebWahl />
    </div>
  )
}
