import { Component, type ReactNode } from 'react'

interface State { error: Error | null }

// Fängt unerwartete Render-Fehler ab -> statt weißem Bildschirm eine ruhige Meldung.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Für spätere Diagnose in der Konsole
    console.error('Unerwarteter Fehler:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="center" style={{ minHeight: '100vh', padding: 24 }}>
          <div className="login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🛟</div>
            <h1 style={{ marginBottom: 8 }}>Kurz was schiefgelaufen</h1>
            <p className="muted" style={{ marginBottom: 18 }}>
              Kein Grund zur Sorge — deine Daten sind sicher. Lade die Seite einfach neu.
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Neu laden
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
