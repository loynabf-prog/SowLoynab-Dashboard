import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) {
      setError(
        error.toLowerCase().includes('invalid')
          ? 'E-Mail oder Passwort falsch.'
          : error,
      )
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card stack" onSubmit={onSubmit}>
        <div className="brand-mark">
          <span className="brand-dot" />
          Sow&nbsp;&amp;&nbsp;Loynab
        </div>
        <div>
          <h1>Team-Login</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Internes Dashboard — nur fuer das Team.
          </p>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div>
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="pw">Passwort</label>
          <input
            id="pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Melde an …' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
