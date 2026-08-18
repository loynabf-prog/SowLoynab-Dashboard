import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/uebersicht', label: 'Übersicht' },
  { to: '/', label: 'Kunden', end: true },
  { to: '/leads', label: 'Leads' },
  { to: '/aufgaben', label: 'Aufgaben' },
  { to: '/kalender', label: 'Kalender' },
  { to: '/finanzen', label: 'Finanzen' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()

  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand-mark">
          <span className="brand-dot" />
          Sow&nbsp;&amp;&nbsp;Loynab
        </Link>
        <div className="spacer" />
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

      <main className="app-main">{children}</main>
    </>
  )
}
