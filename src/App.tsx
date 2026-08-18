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
import Layout from './components/Layout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="center" style={{ height: '100vh' }}>
        <span className="muted">Lade …</span>
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
      <Route
        path="/login"
        element={loading ? null : session ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/uebersicht" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
      <Route path="/client/:id" element={<ProtectedRoute><ClientPage /></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
      <Route path="/aufgaben" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/kalender" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
      <Route path="/finanzen" element={<ProtectedRoute><Finances /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
