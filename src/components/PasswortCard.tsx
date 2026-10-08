// Passwort ändern, wenn man schon angemeldet ist.
// ---------------------------------------------------------------------------
// Der andere Weg -- über die Mail -- ist für den Fall, dass man gar nicht
// mehr reinkommt. Dieser hier ist für den Normalfall: man ist drin und will
// es einfach wechseln.

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function PasswortCard() {
  const { user, passwortSetzen } = useAuth()
  const { toast } = useToast()
  const [offen, setOffen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function speichern(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (pw.length < 8) { setFehler('Mindestens 8 Zeichen.'); return }
    if (pw !== pw2) { setFehler('Die beiden Eingaben sind nicht gleich.'); return }
    setBusy(true)
    const { error } = await passwortSetzen(pw)
    setBusy(false)
    if (error) { setFehler(error); return }
    setPw(''); setPw2(''); setOffen(false)
    toast('Passwort geändert ✓')
  }

  return (
    <div className="settings-card" style={{ marginTop: 18 }}>
      <div className="section-divider" style={{ borderTop: 'none', paddingTop: 0 }}>Zugang</div>
      <p className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>
        Angemeldet als <strong>{user?.email ?? '—'}</strong>.
        Wer gar nicht mehr reinkommt, nimmt auf der Login-Seite „Passwort vergessen?".
      </p>

      {!offen ? (
        <button className="btn" onClick={() => setOffen(true)}>Passwort ändern</button>
      ) : (
        <form className="stack" onSubmit={speichern}>
          {fehler && <div className="error-box">{fehler}</div>}
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="pwneu">Neues Passwort</label>
              <input id="pwneu" type="password" autoComplete="new-password" minLength={8}
                value={pw} onChange={(e) => setPw(e.target.value)} required />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="pwneu2">Noch einmal</label>
              <input id="pwneu2" type="password" autoComplete="new-password"
                value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setOffen(false); setPw(''); setPw2(''); setFehler(null) }}>
              Abbrechen
            </button>
            <div className="spacer" />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Speichere …' : 'Speichern'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
