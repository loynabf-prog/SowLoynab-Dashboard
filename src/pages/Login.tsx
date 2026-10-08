import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Drei Zustände auf einer Karte: anmelden, Link anfordern, neues Passwort
// setzen. Eine eigene Seite je Zustand waere mehr Technik fuer dieselbe
// Handvoll Felder -- und der Zurueckesetzen-Link landet ohnehin hier.
type Ansicht = 'anmelden' | 'vergessen' | 'neu'

export default function Login() {
  const { signIn, passwortVergessen, passwortSetzen, zuruecksetzen } = useAuth()
  const [ansicht, setAnsicht] = useState<Ansicht>('anmelden')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Über den Link aus der Mail hereingekommen: dann gibt es nichts zu
  // entscheiden, dann wird ein neues Passwort gesetzt.
  const zeige: Ansicht = zuruecksetzen ? 'neu' : ansicht

  function wechsel(z: Ansicht) {
    setAnsicht(z)
    setError(null)
    setHinweis(null)
  }

  async function anmelden(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) {
      setError(error.toLowerCase().includes('invalid')
        ? 'E-Mail oder Passwort falsch.'
        : error)
    }
  }

  async function linkAnfordern(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await passwortVergessen(email.trim())
    setBusy(false)
    if (error) {
      // Bewusst nicht verraten, ob es die Adresse gibt -- das waere eine
      // Auskunft an Fremde darueber, wer hier ein Konto hat.
      setError(/rate|limit|too many/i.test(error)
        ? 'Zu viele Versuche. Warte eine Stunde und probier es dann noch einmal.'
        : error)
      return
    }
    setHinweis('Wenn es zu dieser Adresse ein Konto gibt, ist die Mail unterwegs. Schau auch im Spam nach.')
  }

  async function neuesSetzen(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Mindestens 8 Zeichen.'); return }
    if (password !== pw2) { setError('Die beiden Eingaben sind nicht gleich.'); return }
    setBusy(true)
    const { error } = await passwortSetzen(password)
    setBusy(false)
    if (error) { setError(error); return }
    setPassword(''); setPw2('')
    setHinweis('Passwort geändert. Du bist angemeldet.')
  }

  return (
    <div className="login-wrap">
      <form
        className="login-card stack"
        onSubmit={zeige === 'anmelden' ? anmelden : zeige === 'vergessen' ? linkAnfordern : neuesSetzen}
      >
        <div className="brand-mark">
          <span className="brand-dot" />
          Sow&nbsp;&amp;&nbsp;Loynab
        </div>

        <div>
          <h1>
            {zeige === 'anmelden' ? 'Team-Login'
              : zeige === 'vergessen' ? 'Passwort vergessen'
                : 'Neues Passwort'}
          </h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {zeige === 'anmelden' ? 'Internes Dashboard — nur für das Team.'
              : zeige === 'vergessen' ? 'Wir schicken dir einen Link zum Zurücksetzen.'
                : 'Such dir eins aus, das du dir merkst.'}
          </p>
        </div>

        {error && <div className="error-box">{error}</div>}
        {hinweis && <div className="info-box" style={{ fontSize: 13 }}>{hinweis}</div>}

        {zeige !== 'neu' && (
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
        )}

        {zeige === 'anmelden' && (
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
        )}

        {zeige === 'neu' && (
          <>
            <div>
              <label htmlFor="npw">Neues Passwort</label>
              <input
                id="npw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div>
              <label htmlFor="npw2">Noch einmal</label>
              <input
                id="npw2"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
              />
            </div>
          </>
        )}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy
            ? 'Moment …'
            : zeige === 'anmelden' ? 'Anmelden'
              : zeige === 'vergessen' ? 'Link schicken'
                : 'Passwort speichern'}
        </button>

        {zeige === 'anmelden' && (
          <button type="button" className="login-link" onClick={() => wechsel('vergessen')}>
            Passwort vergessen?
          </button>
        )}
        {zeige === 'vergessen' && (
          <button type="button" className="login-link" onClick={() => wechsel('anmelden')}>
            ← Zurück zum Login
          </button>
        )}
      </form>
    </div>
  )
}
