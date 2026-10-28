// Die Schale der App: Handy-Leiste unten, Seitenleiste am Desktop.
// ---------------------------------------------------------------------------
// Unten fuenf Ziele (Heute, Ofen, Kalender, Monat, Analyse), "Neu" oben im
// Kopf. Alles andere liegt auf der Seite "Mehr"
// (pages/Mehr.tsx), erreichbar ueber das Profilbild oben rechts: sieben
// Bereiche, jede Seite mit einem Satz. Welche Seite wohin gehoert, steht in
// lib/bereiche.ts -- wer einem Mitglied nur bestimmte Bereiche gibt, sieht
// dort auch nur diese.

import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Sun, CalendarDays, Plus, Search, Sparkles, CalendarRange, LayoutGrid, Flame, BarChart3 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { HAUPT_PFADE, sichtbareBereiche } from '../lib/bereiche'
import { symbolVon } from '../lib/seitenSymbole'
import AssistentButton from './AssistentButton'
import NudgeCenter from './NudgeCenter'
import ChatButton from './ChatButton'
import CommandPalette from './CommandPalette'
import QuickAdd from './QuickAdd'
import UpdatePrompt from './UpdatePrompt'
import NutzungsMesser from './NutzungsMesser'
import BetriebWahl from './BetriebWahl'

interface Ziel { to: string; label: string; icon: LucideIcon; end?: boolean; auch?: string[] }

/**
 * Die fuenf Hauptziele (Fassie, 28.10.2026): so arbeiten wir wirklich --
 * Heute (was muss raus), Ofen (Schnitt), Kalender (Posting), Monat (Kunden,
 * Videoanzahl, alles antippbar), Analyse. Alles andere liegt unter "Mehr".
 */
const HAUPT: Ziel[] = [
  { to: '/', label: 'Heute', icon: Sun, end: true },
  { to: '/ofen', label: 'Ofen', icon: Flame },
  { to: '/plan', label: 'Kalender', icon: CalendarDays, auch: ['/posting'] },
  { to: '/monate', label: 'Monat', icon: CalendarRange, auch: ['/client', '/kunden'] },
  { to: '/analyse', label: 'Analyse', icon: BarChart3, auch: ['/leistung'] },
]

/** Am Desktop unter den Hauptzielen: nur das, was wir noch ab und zu brauchen. */
const NEBEN = ['/kunden', '/lexikon', '/aufgaben']

function aktiv(z: Ziel, pfad: string): boolean {
  if (z.end) return pfad === z.to
  return [z.to, ...(z.auch ?? [])].some((p) => pfad === p || pfad.startsWith(p + '/'))
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const location = useLocation()
  const navigate = useNavigate()

  const ich = memberId ? byId(memberId) : undefined
  const bereiche = sichtbareBereiche(ich?.bereiche)
  // Seitenleiste am Desktop: alles ausser den Hauptzielen, gruppiert nach Bereich.
  const neben = bereiche.flatMap((b) => b.seiten).filter((s) => NEBEN.includes(s.to) && !HAUPT_PFADE.includes(s.to))
  const gruppen = neben.length ? [{ titel: 'Mehr', seiten: neben }] : []
  const breit = location.pathname.startsWith('/client/') || location.pathname === '/kalender' || location.pathname.startsWith('/chat')
  const chat = location.pathname.startsWith('/chat')
  const animKey = location.pathname.startsWith('/client/') ? 'client' : chat ? 'chat' : location.pathname
  const mehr = location.pathname === '/mehr'

  const neu = () => window.dispatchEvent(new Event('open-quickadd'))

  return (
    <div className="n-schale">
      {/* Desktop: Seitenleiste */}
      <aside className="n-seite" aria-label="Navigation">
        <Link to="/" className="n-marke"><i>S&amp;L</i>Sow &amp; Loynab</Link>
        <button className="n-seite-neu" onClick={neu}><Plus size={17} strokeWidth={2.4} />Neu</button>
        {HAUPT.map((z) => (
          <NavLink key={z.to} to={z.to} end={z.end} className={() => `n-seite-link ${aktiv(z, location.pathname) ? 'on' : ''}`}>
            <z.icon strokeWidth={2} />{z.label}
          </NavLink>
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
      <header className="n-kopf">
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
        <div className="page" key={animKey}>{children}</div>
      </main>

      {/* Handy: fuenf gleich breite Spalten; "Neu" sitzt oben im Kopf */}
      <nav className="n-leiste" aria-label="Hauptnavigation">
        {HAUPT.map((z) => <Tab key={z.to} z={z} pfad={location.pathname} />)}
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

function Tab({ z, pfad }: { z: Ziel; pfad: string }) {
  const on = aktiv(z, pfad)
  return (
    <NavLink to={z.to} end={z.end} className={() => `n-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
      <z.icon strokeWidth={on ? 2.3 : 1.9} />
      <span>{z.label}</span>
    </NavLink>
  )
}
