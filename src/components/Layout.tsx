import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import VoiceButton from './VoiceButton'
import NudgeCenter from './NudgeCenter'
import CommandPalette from './CommandPalette'

const NAV = [
  { to: '/uebersicht', label: 'Übersicht' },
  { to: '/', label: 'Kunden', end: true },
  { to: '/leads', label: 'Leads' },
  { to: '/aufgaben', label: 'Aufgaben' },
  { to: '/kalender', label: 'Kalender' },
  { to: '/finanzen', label: 'Finanzen' },
  { to: '/team', label: 'Team' },
  { to: '/papierkorb', label: 'Papierkorb' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  // Bei Kunden-Detailseiten den Basispfad als Key nehmen, damit die Animation
  // nur beim Wechsel des Bereichs neu startet.
  const animKey = location.pathname.startsWith('/client/') ? 'client' : location.pathname

  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand-mark">
          <span className="brand-dot" />
          Sow&nbsp;&amp;&nbsp;Loynab
        </Link>
        <div className="spacer" />
        <button
          className="search-trigger"
          onClick={() => window.dispatchEvent(new Event('open-search'))}
          title="Suchen (⌘K)"
        >
          <span>🔍</span>
          <span className="search-trigger-label">Suchen</span>
          <kbd className="search-trigger-kbd">⌘K</kbd>
        </button>
        <NudgeCenter />
        {user?.email && <span className="muted user-email">{user.email}</span>}
        <button className="btn btn-sm btn-ghost" onClick={() => signOut()}>
          Abmelden
        </button>
      </header>

      <nav className="app-nav">
        <div className="app-nav-inner">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="app-main">
        <div className="page" key={animKey}>
          {children}
        </div>
      </main>

      <VoiceButton />
      <CommandPalette />
    </>
  )
}
