import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { TeamProvider } from './context/TeamContext'
import { IdentityProvider } from './context/IdentityContext'
import { ToastProvider } from './context/ToastContext'
import './index.css'
import './app.css'

// Service Worker registrieren (fuer Handy-Push & App-Feeling)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// basename = Vite BASE_URL ohne abschliessenden Slash (fuer GitHub-Pages-Unterpfad).
// Bei Root-Hosting ("/") ergibt das "/" und aendert nichts.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <TeamProvider>
          <IdentityProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </IdentityProvider>
        </TeamProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
