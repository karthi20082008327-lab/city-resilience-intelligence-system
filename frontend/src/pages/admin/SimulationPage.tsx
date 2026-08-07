import { motion } from 'framer-motion'

export default function SimulationPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-[calc(100vh-120px)] flex flex-col bg-white rounded-2xl border border-slate-100 overflow-hidden"
    >
      <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Urban Digital Twin Simulation</h1>
          <p className="text-[11px] text-slate-500">
            Trigger incidents in the 3D city — they are reported to the admin dashboard in real time.
          </p>
        </div>
      </div>
      <div className="flex-1 relative min-h-0">
        <iframe
          src="/simul/index.html"
          title="UCRIP Simulation"
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    </motion.div>
  )
}
