import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { authAPI } from '../../services/api'
import { UcripLogo } from '../../components/UcripLogo'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center p-4 relative overflow-hidden">
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
        className="fixed top-6 left-6 flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors z-20 text-sm"
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
            <UcripLogo className="w-16 h-16" />
          </motion.div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-white/40 mt-2 text-sm">Sign in to the Command Center</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="uc-input pl-10"
                  placeholder="admin@ucrip.gov"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
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
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
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
                        : 'border-white/15 bg-white/[0.03] group-hover:border-white/25'
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
                <span className="text-sm text-white/40">Remember me</span>
              </label>
              <button type="button" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
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
        </div>
      </motion.div>
    </div>
  )
}
