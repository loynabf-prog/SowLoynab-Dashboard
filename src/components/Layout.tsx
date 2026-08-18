import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
        {user?.email && <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>}
        <button className="btn btn-sm btn-ghost" onClick={() => signOut()}>
          Abmelden
        </button>
      </header>
      <main className="app-main">{children}</main>
    </>
  )
}
