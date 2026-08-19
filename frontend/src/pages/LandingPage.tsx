import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Users, Radar, Activity, Brain, ArrowRight, Globe2, Zap } from 'lucide-react'
import { CrisLogo } from '../components/CrisLogo'

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#0a0f1a] relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        {/* grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#34d399 1px, transparent 1px), linear-gradient(90deg, #34d399 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* radial glows */}
        <motion.div
          className="absolute -top-64 -right-64 w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 60%)' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-64 -left-64 w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 60%)' }}
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
        <motion.div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 60%)' }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-20 py-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3"
        >
          <div className="w-11 h-11 flex items-center justify-center">
            <CrisLogo className="w-11 h-11" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-widest text-white">NEXUS</span>
            <div className="text-[10px] text-slate-500 tracking-[0.3em] uppercase">City Intelligence</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="hidden md:flex items-center gap-1 p-1.5 rounded-2xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-xl"
        >
          <button
            onClick={() => navigate('/report')}
            className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            Citizen Portal
          </button>
          <button
            onClick={() => navigate('/admin/login')}
            className="px-4 py-2 rounded-xl text-sm bg-emerald-500 text-white hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
          >
            Command Center
          </button>
        </motion.div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center px-6 lg:px-20 pt-10 lg:pt-16">
        <div className="text-center max-w-5xl mx-auto">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-300 text-sm font-medium tracking-wide">
              Autonomous City Defense Platform
            </span>
          </motion.div>

          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.08] tracking-tight"
          >
            <span className="text-white">Urban Sentinel</span>
            <br />
            <span className="gradient-text-multi uc-glow-text">Next-Gen Resilience</span>
          </motion.h1>

          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            A unified command system that fuses AI-driven detection, real-time 3D simulation,
            and multi-department coordination into a single protective shield for modern cities.
          </motion.p>

          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/report')}
              className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-2xl shadow-xl shadow-emerald-500/25 hover:shadow-2xl hover:shadow-emerald-500/40 transition-all"
            >
              <Users className="w-5 h-5" />
              Report Incident
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/admin/login')}
              className="group flex items-center gap-3 px-8 py-4 rounded-2xl text-slate-200 font-semibold border border-slate-600/40 bg-slate-800/40 hover:bg-slate-800/70 hover:border-emerald-500/30 backdrop-blur-xl transition-all"
            >
              <ShieldCheck className="w-5 h-5" />
              Command Center
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </motion.button>
          </motion.div>
        </div>

        {/* Feature cards */}
        <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl w-full mb-16">
          {[
            {
              icon: Radar,
              title: 'Live Detection',
              desc: 'AI-powered CCTV and sensor analysis',
              border: 'border-emerald-500/20',
              glow: 'shadow-emerald-500/10',
              iconBg: 'bg-emerald-500/10 text-emerald-400',
            },
            {
              icon: Activity,
              title: 'Real-Time 3D City',
              desc: 'Full digital twin of the urban grid',
              border: 'border-cyan-500/20',
              glow: 'shadow-cyan-500/10',
              iconBg: 'bg-cyan-500/10 text-cyan-400',
            },
            {
              icon: Brain,
              title: 'AI Risk Prediction',
              desc: 'Cascading failure forecasting',
              border: 'border-violet-500/20',
              glow: 'shadow-violet-500/10',
              iconBg: 'bg-violet-500/10 text-violet-400',
            },
            {
              icon: Zap,
              title: 'Auto Response',
              desc: 'Instant multi-department routing',
              border: 'border-amber-500/20',
              glow: 'shadow-amber-500/10',
              iconBg: 'bg-amber-500/10 text-amber-400',
            },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={4 + i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              whileHover={{ y: -8, scale: 1.02 }}
              className={`uc-card p-6 backdrop-blur-xl ${feature.border} shadow-xl ${feature.glow}`}
            >
              <div className={`w-11 h-11 rounded-xl ${feature.iconBg} flex items-center justify-center mb-4`}>
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="text-white font-semibold mb-1.5 text-base">{feature.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Stats band */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl w-full mb-20"
        >
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">6</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">Active Departments</div>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">24/7</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">City Monitoring</div>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">100%</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">Coverage</div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-slate-600 text-xs tracking-wider">
        NEXUS URBAN INTELLIGENCE — BUILDING RESILIENT CITIES
      </footer>
    </div>
  )
}
