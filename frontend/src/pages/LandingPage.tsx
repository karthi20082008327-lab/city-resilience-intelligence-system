import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Users, MapPin, Activity, Brain, ArrowRight } from 'lucide-react'
import { UcripLogo } from '../components/UcripLogo'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#030712] relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-48 -right-48 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-48 -left-48 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)' }}
          animate={{ scale: [1.15, 1, 1.15], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 60%)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-16 py-6">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 flex items-center justify-center">
            <UcripLogo className="w-10 h-10" />
          </div>
          <span className="text-xl font-bold uc-gradient-text">UCRIP</span>
        </motion.div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-88px)] px-6">
        <div className="text-center max-w-4xl mx-auto">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/[0.08] border border-blue-500/20 text-blue-400 text-sm mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            AI-Powered Urban Intelligence Platform
          </motion.div>

          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-[1.05]"
          >
            <span className="uc-gradient-text">Smart City</span>
            <br />
            <span className="text-white">Command Center</span>
          </motion.h1>

          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-12 text-balance leading-relaxed"
          >
            AI-powered urban risk prediction and cascading failure analysis. Protecting cities through
            intelligent monitoring and real-time response coordination.
          </motion.p>

          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          >
            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/report')}
              className="w-full sm:w-auto group flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-2xl shadow-lg shadow-blue-500/25 transition-shadow hover:shadow-xl hover:shadow-blue-500/30"
            >
              <Users className="w-5 h-5" />
              Citizen Portal
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/admin/login')}
              className="w-full sm:w-auto group flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-white font-semibold transition-all border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15"
            >
              <Shield className="w-5 h-5" />
              Admin Access
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </motion.button>
          </motion.div>
        </div>

        {/* Feature cards */}
        <motion.div
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl w-full"
        >
          {[
            {
              icon: MapPin,
              title: 'Real-Time Monitoring',
              desc: 'Live incident tracking across all city zones with instant alert propagation',
              gradient: 'from-blue-500 to-cyan-500',
            },
            {
              icon: Brain,
              title: 'AI Risk Prediction',
              desc: 'Machine learning models predict cascading failures before they happen',
              gradient: 'from-purple-500 to-pink-500',
            },
            {
              icon: Activity,
              title: 'City Health Score',
              desc: 'Comprehensive urban health metrics updated in real-time',
              gradient: 'from-emerald-500 to-green-500',
            },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={4 + i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              whileHover={{ y: -6, scale: 1.02 }}
              className="uc-card uc-card-hover p-7 text-center cursor-default"
            >
              <div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mx-auto mb-5 shadow-lg`}
              >
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-white/40 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-white/20 text-sm">
        © 2024 UCRIP — Urban Cascade Risk Intelligence Platform
      </footer>
    </div>
  )
}
