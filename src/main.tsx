import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { TeamProvider } from './context/TeamContext'
import { IdentityProvider } from './context/IdentityContext'
import { CategoryProvider } from './context/CategoryContext'
import { ToastProvider } from './context/ToastContext'
import ErrorBoundary from './components/ErrorBoundary'
import { registerSW } from './lib/swUpdate'
import './index.css'
import './app.css'

// Service Worker registrieren (Handy-Push, Offline & Auto-Update-Hinweis)
window.addEventListener('load', () => registerSW())

// basename = Vite BASE_URL ohne abschliessenden Slash (fuer GitHub-Pages-Unterpfad).
// Bei Root-Hosting ("/") ergibt das "/" und aendert nichts.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <ErrorBoundary>
      <AuthProvider>
        <TeamProvider>
          <IdentityProvider>
            <CategoryProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </CategoryProvider>
          </IdentityProvider>
        </TeamProvider>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)
