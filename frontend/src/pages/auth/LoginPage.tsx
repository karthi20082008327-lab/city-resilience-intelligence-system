import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Mail, Lock, Eye, EyeOff, ArrowLeft, Building2 } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { authAPI } from '../../services/api'
import { CrisLogo } from '../../components/CrisLogo'

const DEPARTMENTS = [
  { value: 'emergency_department', label: 'Emergency Department', icon: '🚨' },
  { value: 'traffic_department', label: 'Traffic Department', icon: '🚗' },
  { value: 'water_department', label: 'Water Department', icon: '💧' },
  { value: 'electricity_department', label: 'Electricity Department', icon: '⚡' },
  { value: 'disaster_management', label: 'Disaster Management', icon: '🛡️' },
  { value: 'surveillance_department', label: 'Surveillance Department', icon: '📹' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [loginMode, setLoginMode] = useState<'admin' | 'department'>('admin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [department, setDepartment] = useState('')
  const [deptPassword, setDeptPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showDeptPassword, setShowDeptPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await authAPI.login({ email, password, remember_me: rememberMe })
      const { user, access_token, refresh_token } = res.data
      login(user, access_token, refresh_token)
      navigate('/admin/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleDepartmentLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!department) {
      setError('Please select a department')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await authAPI.departmentLogin({ department, password: deptPassword })
      const { user, access_token, refresh_token } = res.data
      login(user, access_token, refresh_token)
      navigate('/admin/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please check your password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute -top-48 -right-48 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-48 -left-48 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)' }}
          animate={{ scale: [1.15, 1, 1.15], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 10, repeat: Infinity, delay: 3 }}
        />
      </div>

      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate('/')}
        className="fixed top-6 left-6 flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors z-20 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </motion.button>

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <div className="uc-card p-8 uc-glow-border">
          {/* Logo */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.15 }}
            className="flex items-center justify-center mx-auto mb-6"
          >
            <CrisLogo className="w-16 h-16" />
          </motion.div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-slate-500 mt-2 text-sm">Sign in to the Command Center</p>
          </div>

          {/* Login Mode Tabs */}
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => { setLoginMode('admin'); setError('') }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                loginMode === 'admin'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
            <button
              type="button"
              onClick={() => { setLoginMode('department'); setError('') }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                loginMode === 'department'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Department
            </button>
          </div>

          {loginMode === 'admin' ? (
            <form onSubmit={handleAdminLogin} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="uc-input pl-10"
                  placeholder="admin@cris.gov"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="uc-input pl-10 pr-10"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center ${
                      rememberMe
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-slate-300 bg-slate-50 group-hover:border-slate-400'
                    }`}
                  >
                    {rememberMe && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-slate-500">Remember me</span>
              </label>
              <button type="button" className="text-sm text-blue-600 hover:text-blue-700 transition-colors">
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <motion.button
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={loading}
              className="w-full uc-btn uc-btn-primary py-3.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Sign In
                </>
              )}
            </motion.button>
          </form>
          ) : (
          <form onSubmit={handleDepartmentLogin} className="space-y-5">
            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Department Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Department</label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="uc-input pl-10 appearance-none"
                  required
                >
                  <option value="">Select your department</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.value} value={dept.value}>
                      {dept.icon} {dept.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Department Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showDeptPassword ? 'text' : 'password'}
                  value={deptPassword}
                  onChange={(e) => setDeptPassword(e.target.value)}
                  className="uc-input pl-10 pr-10"
                  placeholder="Enter department password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowDeptPassword(!showDeptPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showDeptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Department Info */}
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <p className="text-xs text-blue-700">
                <strong>Department Login:</strong> Select your department and enter the password. 
                You will only see incidents assigned to your department.
              </p>
            </div>

            {/* Submit */}
            <motion.button
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={loading || !department}
              className="w-full uc-btn uc-btn-primary py-3.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Building2 className="w-4 h-4" />
                  Sign In as Department
                </>
              )}
            </motion.button>
          </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
