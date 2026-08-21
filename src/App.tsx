import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Dashboard from './pages/Dashboard'
import ClientPage from './pages/ClientPage'
import Leads from './pages/Leads'
import Tasks from './pages/Tasks'
import Calendar from './pages/Calendar'
import Finances from './pages/Finances'
import Team from './pages/Team'
import Trash from './pages/Trash'
import Approval from './pages/Approval'
import Layout from './components/Layout'
import Spinner from './components/Spinner'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="center" style={{ height: '100vh' }}>
        <Spinner />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  const { session, loading } = useAuth()

  return (
    <Routes>
      <Route path="/freigabe/:token" element={<Approval />} />
      <Route
        path="/login"
        element={loading ? null : session ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
      <Route path="/kunden" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/uebersicht" element={<Navigate to="/" replace />} />
      <Route path="/client/:id" element={<ProtectedRoute><ClientPage /></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
      <Route path="/aufgaben" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/kalender" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
      <Route path="/finanzen" element={<ProtectedRoute><Finances /></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
      <Route path="/papierkorb" element={<ProtectedRoute><Trash /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
