import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, Radar, Activity, Brain, ArrowRight, Globe2, ShieldCheck, Zap } from 'lucide-react'
import { CrisLogo } from '../components/CrisLogo'

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  }),
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 pointer-events-none">
        {/* floating circles */}
        <motion.div
          className="absolute top-20 left-[10%] w-3 h-3 rounded-full bg-blue-200/40"
          animate={{ y: [0, -30, 0], x: [0, 15, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-40 right-[15%] w-2 h-2 rounded-full bg-purple-200/50"
          animate={{ y: [0, -20, 0], x: [0, -10, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
        <motion.div
          className="absolute top-60 left-[25%] w-4 h-4 rounded-full bg-blue-100/30"
          animate={{ y: [0, -40, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute bottom-40 right-[20%] w-3 h-3 rounded-full bg-pink-200/30"
          animate={{ y: [0, -25, 0], x: [0, 10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        />
        <motion.div
          className="absolute top-32 left-[60%] w-2 h-2 rounded-full bg-indigo-200/40"
          animate={{ y: [0, -35, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />

        {/* subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

        {/* radial gradient blobs */}
        <motion.div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1], rotate: [0, 10, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)' }}
          animate={{ scale: [1.15, 1, 1.15], rotate: [0, -10, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-20 py-6">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-3"
        >
          <motion.div
            whileHover={{ rotate: 10, scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <CrisLogo className="w-11 h-11" />
          </motion.div>
          <div>
            <span className="text-xl font-bold tracking-wider text-slate-800">CRIS</span>
            <div className="text-[10px] text-slate-400 tracking-[0.25em] uppercase">Intelligence Platform</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="hidden md:flex items-center gap-1 p-1.5 rounded-2xl bg-white/70 border border-slate-200/80 backdrop-blur-xl"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/report')}
            className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all"
          >
            Citizen Portal
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/admin/login')}
            className="px-4 py-2 rounded-xl text-sm bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20"
          >
            Command Center
          </motion.button>
        </motion.div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center px-6 lg:px-20 pt-8 lg:pt-14">
        <div className="text-center max-w-5xl mx-auto">
          {/* Status badge */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-blue-50/80 border border-blue-200/50 mb-8"
          >
            <motion.span
              className="relative flex h-2 w-2"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </motion.span>
            <span className="text-blue-600 text-sm font-medium tracking-wide">
              City Protection System — Online
            </span>
          </motion.div>

          {/* Main heading */}
          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-[1.1] tracking-tight"
          >
            <motion.span
              className="text-slate-800 block"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              City Resilience
            </motion.span>
            <motion.span
              className="gradient-text block mt-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              Intelligence System
            </motion.span>
          </motion.h1>

          {/* Description */}
          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            A unified command system that fuses AI-driven detection, real-time 3D simulation,
            and multi-department coordination into a single protective shield for modern cities.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          >
            <motion.button
              whileHover={{ scale: 1.03, y: -3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/report')}
              className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-2xl shadow-xl shadow-blue-600/25 hover:shadow-2xl hover:shadow-blue-600/35 transition-all duration-300"
            >
              <motion.div
                animate={{ rotate: [0, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Users className="w-5 h-5" />
              </motion.div>
              Report Incident
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03, y: -3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/admin/login')}
              className="group flex items-center gap-3 px-8 py-4 rounded-2xl text-slate-700 font-semibold border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all duration-300"
            >
              <ShieldCheck className="w-5 h-5" />
              Command Center
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </motion.button>
          </motion.div>
        </div>

        {/* Feature cards with staggered animation */}
        <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl w-full mb-16">
          {[
            {
              icon: Radar,
              title: 'Live Detection',
              desc: 'AI-powered CCTV and sensor analysis for real-time threat identification',
              border: 'hover:border-blue-300',
              iconBg: 'bg-blue-50 text-blue-600',
              delay: 0,
            },
            {
              icon: Activity,
              title: 'Real-Time 3D City',
              desc: 'Full digital twin of the urban grid with live simulation',
              border: 'hover:border-indigo-300',
              iconBg: 'bg-indigo-50 text-indigo-600',
              delay: 0.1,
            },
            {
              icon: Brain,
              title: 'AI Risk Prediction',
              desc: 'Cascading failure forecasting and preventive alerts',
              border: 'hover:border-purple-300',
              iconBg: 'bg-purple-50 text-purple-600',
              delay: 0.2,
            },
            {
              icon: Zap,
              title: 'Auto Response',
              desc: 'Instant multi-department routing and coordination',
              border: 'hover:border-amber-300',
              iconBg: 'bg-amber-50 text-amber-600',
              delay: 0.3,
            },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={4 + i}
              initial="hidden"
              animate="visible"
              variants={scaleIn}
              whileHover={{ y: -8, scale: 1.02, transition: { duration: 0.3 } }}
              className={`uc-card p-6 ${feature.border} transition-all duration-300`}
            >
              <motion.div
                className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center mb-4`}
                whileHover={{ rotate: 10, scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <feature.icon className="w-5 h-5" />
              </motion.div>
              <h3 className="text-slate-800 font-semibold mb-2 text-base">{feature.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Stats with count-up animation */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-6xl w-full mb-20"
        >
          {[
            { icon: ShieldCheck, value: '6', label: 'Active Departments', color: 'bg-blue-50 text-blue-600' },
            { icon: Globe2, value: '24/7', label: 'City Monitoring', color: 'bg-indigo-50 text-indigo-600' },
            { icon: Activity, value: '100%', label: 'Coverage', color: 'bg-purple-50 text-purple-600' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 + i * 0.15, duration: 0.6 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-4"
            >
              <motion.div
                className={`w-11 h-11 rounded-xl ${stat.color} flex items-center justify-center`}
                whileHover={{ rotate: 10 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <stat.icon className="w-5 h-5" />
              </motion.div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="relative z-10 text-center py-8 text-slate-400 text-xs tracking-wider border-t border-slate-100"
      >
        CITY RESILIENCE INTELLIGENCE SYSTEM — PROTECTING URBAN COMMUNITIES
      </motion.footer>
    </div>
  )
}
