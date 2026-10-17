import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AssistentButton from './AssistentButton'
import NudgeCenter from './NudgeCenter'
import MailIndicator from './MailIndicator'
import CommandPalette from './CommandPalette'
import QuickAdd from './QuickAdd'
import UpdatePrompt from './UpdatePrompt'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { IMMER, sichtbareBereiche, type Seite } from '../lib/bereiche'

// Navigation kommt aus den Bereichen (lib/bereiche.ts). Wer einem
// Mitglied nur bestimmte Bereiche gibt, sieht auch nur diese.
function useNavigation() {
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const bereiche = sichtbareBereiche(memberId ? byId(memberId)?.bereiche : null)
  const primaer = bereiche.filter((b) => b.primaer).flatMap((b) => b.seiten)
  const gruppen = bereiche.filter((b) => !b.primaer).map((b) => ({ title: b.label, items: b.seiten }))
  const alleSeiten = [...primaer, ...gruppen.flatMap((g) => g.items)]
  // Am Handy: Heute + die drei wichtigsten Seiten in der Leiste, der Rest hinter "Mehr".
  const leiste = alleSeiten.slice(0, 3)
  const handyExtra = [...IMMER.slice(1), ...alleSeiten.slice(3).filter((s) => primaer.includes(s))]
  return { primaer, gruppen, leiste, handyExtra }
}

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
  const nav = useNavigation()
  const animKey = location.pathname.startsWith('/client/') ? 'client' : location.pathname
  const inSecondary = nav.gruppen.some((g) => g.items.some((i) => i.to === location.pathname))

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
          {[IMMER[0], ...nav.primaer, IMMER[1]].map((item) => (
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
      <MobileTabBar leiste={nav.leiste} inSecondary={inSecondary} moreOpen={moreOpen} onMore={() => setMoreOpen((o) => !o)} />

      {moreOpen && <MoreMenu gruppen={nav.gruppen} handyExtra={nav.handyExtra} onClose={() => setMoreOpen(false)} onSignOut={() => signOut()} />}

      <AssistentButton />
      <CommandPalette />
      <QuickAdd />
      <UpdatePrompt />
    </>
  )
}

function MobileTabBar({ leiste, inSecondary, moreOpen, onMore }: { leiste: Seite[]; inSecondary: boolean; moreOpen: boolean; onMore: () => void }) {
  const tab = (item: Seite) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>
      <span className="tab-ic">{item.icon}</span><span className="tab-lb">{item.label}</span>
    </NavLink>
  )
  return (
    <nav className="tabbar">
      {tab(IMMER[0])}
      {leiste.slice(0, 1).map(tab)}
      <button className="tab tab-add" onClick={() => window.dispatchEvent(new Event('open-quickadd'))} aria-label="Neu">
        <span className="tab-add-btn">＋</span>
      </button>
      {leiste.slice(1).map(tab)}
      <button className={`tab ${inSecondary || moreOpen ? 'on' : ''}`} onClick={onMore} aria-label="Mehr">
        <span className="tab-ic">☰</span><span className="tab-lb">Mehr</span>
      </button>
    </nav>
  )
}

function MoreMenu({ gruppen, handyExtra, onClose, onSignOut }: {
  gruppen: { title: string; items: Seite[] }[]
  handyExtra: Seite[]
  onClose: () => void
  onSignOut: () => void
}) {
  const navigate = useNavigate()
  function go(to: string) { onClose(); navigate(to) }
  return createPortal(
    <div className="more-backdrop" onClick={onClose}>
      <div className="more-panel" onClick={(e) => e.stopPropagation()}>
        <div className="more-bar">
          <div className="more-grip" onClick={onClose} />
          <button className="more-close" onClick={onClose} aria-label="Menü schließen">✕</button>
        </div>
        {handyExtra.length > 0 && (
          <div className="more-group hide-desktop">
            <div className="more-title">Schnellzugriff</div>
            <div className="more-items">
              {handyExtra.map((i) => (
                <button key={i.to} className="more-item" onClick={() => go(i.to)}>
                  <span className="more-ic">{i.icon}</span>{i.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {gruppen.map((g) => (
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
