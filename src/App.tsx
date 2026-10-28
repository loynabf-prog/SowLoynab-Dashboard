import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Dashboard from './pages/Dashboard'
import ClientPage from './pages/ClientPage'
import Leads from './pages/Leads'
import Tasks from './pages/Tasks'
import Calendar from './pages/Calendar'
import Posting from './pages/Posting'
import Ofen from './pages/Ofen'
import Medien from './pages/Medien'
import Finances from './pages/Finances'
import Monate from './pages/Monate'
import Team from './pages/Team'
import Trash from './pages/Trash'
import Performance from './pages/Performance'
import Analytics from './pages/Analytics'
import Invoices from './pages/Invoices'
import Inspirations from './pages/Inspirations'
import Lexikon from './pages/Lexikon'
import Postfach from './pages/Postfach'
import Settings from './pages/Settings'
import Firma from './pages/Firma'
import Chat from './pages/Chat'
import Mehr from './pages/Mehr'
import PilotSeite from './pages/Pilot'
import Anleitung from './pages/Anleitung'
import PersonalBrand from './pages/PersonalBrand'
import ContractSign from './pages/ContractSign'
import Layout from './components/Layout'
import Spinner from './components/Spinner'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, zuruecksetzen } = useAuth()
  if (loading) {
    return (
      <div className="center" style={{ height: '100vh' }}>
        <Spinner />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  // Wer ueber den Zuruecksetzen-Link kommt, hat zwar eine gueltige Sitzung --
  // soll aber erst ein neues Passwort setzen, bevor die App aufgeht. Sonst
  // steht man in der App und das alte Passwort gilt weiter.
  if (zuruecksetzen) return <Login />
  return <>{children}</>
}

/**
 * Die Schale (Leiste, Kopf, Assistent, Glocke ...) bleibt beim Tab-Wechsel
 * stehen -- vorher wurde sie bei jedem Wechsel neu aufgebaut und hat alles
 * neu geladen. Nur der Inhalt (Outlet) wechselt.
 */
function Schale() {
  return <ProtectedRoute><Layout><Outlet /></Layout></ProtectedRoute>
}

export default function App() {
  const { session, loading, zuruecksetzen } = useAuth()

  return (
    <Routes>
      <Route path="/vertrag/:token" element={<ContractSign />} />
      <Route
        path="/login"
        element={loading ? null : session && !zuruecksetzen ? <Navigate to="/" replace /> : <Login />}
      />
      {/* Backstube: eigene Vollbild-Seite ohne Leiste (Arbeitsmodus) */}
      <Route path="/ofen" element={<ProtectedRoute><Ofen /></ProtectedRoute>} />
      <Route element={<Schale />}>
        <Route path="/" element={<Overview />} />
        <Route path="/kunden" element={<Dashboard />} />
        <Route path="/brand" element={<PersonalBrand />} />
        <Route path="/uebersicht" element={<Navigate to="/" replace />} />
        <Route path="/client/:id" element={<ClientPage />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/aufgaben" element={<Tasks />} />
        <Route path="/plan" element={<Posting />} />
        <Route path="/posting" element={<Navigate to="/plan" replace />} />
        {/* Produktion laeuft seit 28.10.2026 komplett ueber die Backstube */}
        <Route path="/produktion" element={<Navigate to="/ofen" replace />} />
        <Route path="/medien" element={<Medien />} />
        <Route path="/kalender" element={<Calendar />} />
        <Route path="/leistung" element={<Performance />} />
        <Route path="/analyse" element={<Analytics />} />
        <Route path="/finanzen" element={<Finances />} />
        <Route path="/monate" element={<Monate />} />
        <Route path="/rechnungen" element={<Invoices />} />
        <Route path="/inspirationen" element={<Inspirations />} />
        <Route path="/lexikon" element={<Lexikon />} />
        <Route path="/postfach" element={<Postfach />} />
        <Route path="/team" element={<Team />} />
        <Route path="/einstellungen" element={<Settings />} />
        <Route path="/firma" element={<Firma />} />
        <Route path="/papierkorb" element={<Trash />} />
        <Route path="/mehr" element={<Mehr />} />
        <Route path="/pilot" element={<PilotSeite />} />
        <Route path="/anleitung" element={<Anleitung />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:id" element={<Chat />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
