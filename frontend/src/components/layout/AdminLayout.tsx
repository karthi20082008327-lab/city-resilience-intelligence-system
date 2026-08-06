import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Map, Cloud, AlertTriangle, Cctv, Brain,
  Building2, Users, BarChart3, Settings, Menu, X,
  Bell, LogOut, ChevronDown, Activity, FlaskConical
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { UcripLogo } from '../UcripLogo'

const navItems = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/map', label: 'Live Map', icon: Map },
  { path: '/admin/weather', label: 'Weather', icon: Cloud },
  { path: '/admin/incidents', label: 'Incidents', icon: AlertTriangle },
  { path: '/admin/cctv', label: 'CCTV Feed', icon: Cctv },
  { path: '/admin/ai-prediction', label: 'AI Prediction', icon: Brain },
  { path: '/admin/simulation', label: 'Simulation', icon: FlaskConical },
  { path: '/admin/departments', label: 'Departments', icon: Building2 },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
]

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="text-xs font-mono text-white/40 tracking-wider">
      {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      {' '}
      <span className="text-white/80 font-semibold">
        {time.toLocaleTimeString('en-US', { hour12: false })}
      </span>
    </div>
  )
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    setProfileOpen(false)
    logout()
    navigate('/admin/login')
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-[#030712] flex overflow-hidden">
      {/* Ambient Background Gradient */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-600/[0.03] rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/[0.03] rounded-full blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-cyan-600/[0.02] rounded-full blur-[160px]" />
      </div>

      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 260 : 72 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="hidden lg:flex flex-col uc-glass-strong h-screen sticky top-0 z-30 rounded-r-2xl overflow-hidden"
        style={{ boxShadow: '4px 0 24px rgba(0,0,0,0.3)' }}
      >
        {/* Logo Area */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/[0.06] flex-shrink-0">
          <UcripLogo className="w-9 h-9" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="text-base font-bold tracking-wide whitespace-nowrap overflow-hidden"
              >
                <span className="uc-gradient-text">UCRIP</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path === '/admin/dashboard' && location.pathname === '/admin')
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-blue-400 bg-blue-500/[0.08]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <item.icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200 ${
                  isActive ? 'text-blue-400' : 'text-white/40 group-hover:text-white/60'
                }`} />
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="whitespace-nowrap overflow-hidden text-sm"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            )
          })}
        </nav>

        {/* Sidebar Toggle */}
        <div className="px-2.5 py-3 border-t border-white/[0.06] flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/[0.03] transition-all duration-200"
          >
            <motion.div
              animate={{ rotate: sidebarOpen ? 0 : 180 }}
              transition={{ duration: 0.2 }}
            >
              <Menu className="w-[18px] h-[18px]" />
            </motion.div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs whitespace-nowrap"
                >
                  Collapse
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 w-[280px] h-screen uc-glass-strong z-50 lg:hidden rounded-r-2xl overflow-hidden"
              style={{ boxShadow: '4px 0 24px rgba(0,0,0,0.5)' }}
            >
              {/* Mobile Logo */}
              <div className="flex items-center justify-between px-4 h-16 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <UcripLogo className="w-9 h-9" />
                  <span className="text-base font-bold tracking-wide">
                    <span className="uc-gradient-text">UCRIP</span>
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile Navigation */}
              <nav className="px-2.5 py-3 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'text-blue-400 bg-blue-500/[0.08]'
                          : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03]'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
                      )}
                      <item.icon className={`w-[18px] h-[18px] ${
                        isActive ? 'text-blue-400' : 'text-white/40'
                      }`} />
                      <span className="text-sm">{item.label}</span>
                    </NavLink>
                  )
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen relative z-10">
        {/* Top Bar */}
        <header className="uc-glass h-14 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20 border-b border-white/[0.06]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <LiveClock />
          </div>

          <div className="flex items-center gap-2">
            {/* System Status */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs text-emerald-400 font-medium tracking-wide">System Online</span>
            </div>

            {/* Notification Bell */}
            <button className="relative w-9 h-9 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-all duration-200">
              <Bell className="w-[18px] h-[18px]" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[#030712]" />
            </button>

            {/* User Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/[0.04] transition-all duration-200"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold shadow-lg shadow-blue-500/20">
                  {user?.full_name?.charAt(0) || 'A'}
                </div>
                <span className="hidden md:block text-sm text-white/70 max-w-[100px] truncate">
                  {user?.full_name || 'Admin'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-12 w-60 uc-glass-strong rounded-2xl p-1.5 z-50 shadow-2xl shadow-black/40"
                  >
                    <div className="px-3 py-2.5 border-b border-white/[0.06] mb-1">
                      <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
                      <p className="text-xs text-white/30 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/[0.08] transition-colors duration-200"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
