import { motion } from 'framer-motion'

export default function SimulationPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-[calc(100vh-120px)] flex flex-col bg-[rgba(10,15,26,0.6)] rounded-2xl border border-white/[0.04] overflow-hidden"
    >
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">Urban Digital Twin Simulation</h1>
          <p className="text-[11px] text-white/40">
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
