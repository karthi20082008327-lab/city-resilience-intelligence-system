import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import CitizenPortal from './pages/citizen/CitizenPortal'
import MobileDetectPage from './pages/mobile/MobileDetectPage'
import AdminLayout from './components/layout/AdminLayout'
import DashboardPage from './pages/admin/DashboardPage'
import MapPage from './pages/admin/MapPage'
import WeatherPage from './pages/admin/WeatherPage'
import IncidentsPage from './pages/admin/IncidentsPage'
import UsersPage from './pages/admin/UsersPage'
import DepartmentsPage from './pages/admin/DepartmentsPage'
import AnalyticsPage from './pages/admin/AnalyticsPage'
import SettingsPage from './pages/admin/SettingsPage'
import CCTVPage from './pages/admin/CCTVPage'
import AIPredictionPage from './pages/admin/AIPredictionPage'
import SimulationPage from './pages/admin/SimulationPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/report" element={<CitizenPortal />} />
      <Route path="/simul" element={<SimulationPage />} />
      <Route path="/detect" element={<MobileDetectPage />} />
      <Route path="/cctv" element={<MobileDetectPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <AdminLayout />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="cctv" element={<CCTVPage />} />
        <Route path="ai-prediction" element={<AIPredictionPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="simulation" element={<SimulationPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
