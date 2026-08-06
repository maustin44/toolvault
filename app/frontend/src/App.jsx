import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import SearchPage from './pages/SearchPage'
import DashboardPage from './pages/DashboardPage'
import AdminPage from './pages/AdminPage'
import IntegrationsPage from './pages/IntegrationsPage'
import SettingsPage from './pages/SettingsPage'
import PipelineScansPage from './pages/PipelineScansPage'
import ReportPage from './pages/ReportPage'
import { getStoredUser, clearToken, apiFetch } from './services/api'
import './App.css'
import TriagePage from './pages/TriagePage'

function App() {
  const [user, setUser] = useState(getStoredUser())
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [theme, setTheme] = useState(() => {
    return sessionStorage.getItem('toolVaultTheme') || 'light'
  })

  const isLoggedIn = !!user
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    sessionStorage.setItem('toolVaultTheme', theme)
  }, [theme])

  useEffect(() => {
    if (isLoggedIn) {
      apiFetch('/auth/me')
        .then((data) => { setMustChangePassword(data.mustChangePassword || false) })
        .catch(() => {})
    }
  }, [isLoggedIn])

  const handleLogin = (userData) => setUser(userData)
  const handleLogout = () => { clearToken(); setUser(null); setMustChangePassword(false) }
  const handleThemeChange = (newTheme) => setTheme(newTheme)
  const handlePasswordChanged = () => setMustChangePassword(false)

  return (
  <div className="app-layout">

    {/* 🌟 Background Glow Layer */}
    <div className="bg-glow-container">
      <div className="glow glow-1"></div>
      <div className="glow glow-2"></div>
      <div className="glow glow-3"></div>
    </div>

    {isLoggedIn && (
      <Navbar
        user={user}
        onLogout={handleLogout}
        mustChangePassword={mustChangePassword}
      />
    )}

<main className={isLoggedIn ? 'main-content' : 'main-content full-width'}>
  <div className="main-wrapper">
    <Routes>
      <Route path="/login" element={isLoggedIn ? <Navigate to="/dashboard" /> : <LoginPage onLogin={handleLogin} />} />
      <Route path="/dashboard" element={isLoggedIn ? <DashboardPage /> : <Navigate to="/login" />} />
      <Route path="/search" element={isLoggedIn ? <SearchPage /> : <Navigate to="/login" />} />
      <Route path="/settings" element={isLoggedIn ? <SettingsPage onThemeChange={handleThemeChange} currentTheme={theme} onPasswordChanged={handlePasswordChanged} /> : <Navigate to="/login" />} />
      <Route path="/admin" element={isLoggedIn && isAdmin ? <AdminPage /> : <Navigate to={isLoggedIn ? '/dashboard' : '/login'} />} />
      <Route path="/integrations" element={isLoggedIn && isAdmin ? <IntegrationsPage /> : <Navigate to={isLoggedIn ? '/dashboard' : '/login'} />} />
      <Route path="/pipeline" element={isLoggedIn ? <PipelineScansPage /> : <Navigate to="/login" />} />
      <Route path="/report" element={isLoggedIn ? <ReportPage /> : <Navigate to="/login" />} />
      <Route path="/triage" element={isLoggedIn ? <TriagePage /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={isLoggedIn ? '/dashboard' : '/login'} />} />
    </Routes>
  </div>
</main>
  </div>
  )
}

export default App
