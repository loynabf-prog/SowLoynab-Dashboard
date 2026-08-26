import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import VoiceButton from './VoiceButton'
import NudgeCenter from './NudgeCenter'
import MailIndicator from './MailIndicator'
import CommandPalette from './CommandPalette'
import QuickAdd from './QuickAdd'
import UpdatePrompt from './UpdatePrompt'

// Primär = Tagesgeschäft (immer sichtbar)
const PRIMARY = [
  { to: '/', label: 'Heute', icon: '☀️', end: true },
  { to: '/kunden', label: 'Kunden', icon: '👥' },
  { to: '/kalender', label: 'Kalender', icon: '🗓' },
]

// Sekundär = getrennte Welten hinter „Mehr"
const MORE_GROUPS = [
  { title: 'Kommunikation', items: [{ to: '/postfach', label: 'Postfach', icon: '✉️' }] },
  { title: 'Vertrieb', items: [{ to: '/leads', label: 'Leads-Pipeline', icon: '🎯' }, { to: '/aufgaben', label: 'Aufgaben', icon: '✓' }] },
  { title: 'Buchhaltung', items: [{ to: '/rechnungen', label: 'Rechnungen', icon: '🧾' }, { to: '/finanzen', label: 'Finanzen', icon: '💶' }] },
  { title: 'Analyse', items: [{ to: '/analyse', label: 'Gesamt-Analyse', icon: '📊' }, { to: '/leistung', label: 'Leistung', icon: '📈' }] },
  { title: 'Inhalte', items: [{ to: '/inspirationen', label: 'Inspirationen', icon: '🔖' }] },
  { title: 'Verwaltung', items: [{ to: '/team', label: 'Team', icon: '🧑‍🤝‍🧑' }, { to: '/einstellungen', label: 'Einstellungen', icon: '⚙️' }, { to: '/papierkorb', label: 'Papierkorb', icon: '🗑' }] },
]
const SECONDARY_PATHS = MORE_GROUPS.flatMap((g) => g.items.map((i) => i.to))

function readTheme(): 'light' | 'dark' {
  try { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  // Ohne manuelle Wahl der iPhone-Einstellung (hell/dunkel) live folgen
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      try { if (localStorage.getItem('sl-theme')) return } catch { /* ignore */ }
      const next = mq.matches ? 'dark' : 'light'
      setTheme(next)
      document.documentElement.setAttribute('data-theme', next)
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('sl-theme', next) } catch { /* ignore */ }
  }
  const animKey = location.pathname.startsWith('/client/') ? 'client' : location.pathname
  const inSecondary = SECONDARY_PATHS.includes(location.pathname)

  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand-mark">
          <span className="brand-dot" />
          Sow&nbsp;&amp;&nbsp;Loynab
        </Link>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm quick-add-btn" onClick={() => window.dispatchEvent(new Event('open-quickadd'))} title="Schnell erfassen (⌘I)">
          <span>＋</span><span className="quick-add-label">Neu</span>
        </button>
        <button className="search-trigger" onClick={() => window.dispatchEvent(new Event('open-search'))} title="Suchen (⌘K)">
          <span>🔍</span><span className="search-trigger-label">Suchen</span><kbd className="search-trigger-kbd">⌘K</kbd>
        </button>
        <button className="theme-toggle" onClick={toggleTheme} title="Hell / Dunkel umschalten">{theme === 'dark' ? '☀️' : '🌙'}</button>
        <MailIndicator />
        <NudgeCenter />
        {user?.email && <span className="muted user-email">{user.email}</span>}
        <button className="btn btn-sm btn-ghost hide-mobile" onClick={() => signOut()}>Abmelden</button>
      </header>

      {/* Desktop-Navigation: primär + Mehr */}
      <nav className="app-nav">
        <div className="app-nav-inner">
          {PRIMARY.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
          <button className={`nav-link nav-more ${inSecondary || moreOpen ? 'active' : ''}`} onClick={() => setMoreOpen((o) => !o)}>
            Mehr ▾
          </button>
        </div>
      </nav>

      <main className="app-main">
        <div className="page" key={animKey}>{children}</div>
      </main>

      {/* Mobile: Bottom-Tab-Bar */}
      <MobileTabBar inSecondary={inSecondary} moreOpen={moreOpen} onMore={() => setMoreOpen((o) => !o)} />

      {moreOpen && <MoreMenu onClose={() => setMoreOpen(false)} onSignOut={() => signOut()} />}

      <VoiceButton />
      <CommandPalette />
      <QuickAdd />
      <UpdatePrompt />
    </>
  )
}

function MobileTabBar({ inSecondary, moreOpen, onMore }: { inSecondary: boolean; moreOpen: boolean; onMore: () => void }) {
  return (
    <nav className="tabbar">
      {PRIMARY.slice(0, 2).map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>
          <span className="tab-ic">{item.icon}</span><span className="tab-lb">{item.label}</span>
        </NavLink>
      ))}
      <button className="tab tab-add" onClick={() => window.dispatchEvent(new Event('open-quickadd'))} aria-label="Neu">
        <span className="tab-add-btn">＋</span>
      </button>
      <NavLink to="/kalender" className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>
        <span className="tab-ic">🗓</span><span className="tab-lb">Kalender</span>
      </NavLink>
      <button className={`tab ${inSecondary || moreOpen ? 'on' : ''}`} onClick={onMore} aria-label="Mehr">
        <span className="tab-ic">☰</span><span className="tab-lb">Mehr</span>
      </button>
    </nav>
  )
}

function MoreMenu({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const navigate = useNavigate()
  function go(to: string) { onClose(); navigate(to) }
  return createPortal(
    <div className="more-backdrop" onClick={onClose}>
      <div className="more-panel" onClick={(e) => e.stopPropagation()}>
        <div className="more-grip" />
        {MORE_GROUPS.map((g) => (
          <div className="more-group" key={g.title}>
            <div className="more-title">{g.title}</div>
            <div className="more-items">
              {g.items.map((i) => (
                <button key={i.to} className="more-item" onClick={() => go(i.to)}>
                  <span className="more-ic">{i.icon}</span>{i.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button className="more-item more-signout hide-desktop" onClick={() => { onClose(); onSignOut() }}>
          <span className="more-ic">↩︎</span>Abmelden
        </button>
      </div>
    </div>,
    document.body,
  )
}
