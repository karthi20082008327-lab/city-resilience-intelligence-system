import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { motion } from 'framer-motion'
import { useSimulationStore } from '../../stores/simulationStore'
import { SceneContent } from '../../components/simulation/SimulationScene'
import { SimulationControls } from '../../components/simulation/SimulationControls'
import { StatusPanel } from '../../components/simulation/StatusPanel'
import { DemoController } from '../../components/simulation/DemoController'

export default function CitySimulationPage() {
  const mode = useSimulationStore((s) => s.mode)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-[calc(100vh-110px)] min-h-[560px] w-full relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[#0b1220]"
    >
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 50, near: 0.1, far: 800, position: [0, 62, 58] }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
      <DemoController />

      {/* top-left header */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="rounded-xl bg-slate-900/70 backdrop-blur-md border border-white/10 px-3 py-2">
          <p className="text-sm font-bold text-white tracking-wide">
            Urban Digital Twin <span className="text-sky-400">· CRIS</span>
          </p>
          <p className="text-[10px] text-slate-300 font-mono">
            Live 3D City Simulation · {mode === 'normal' ? 'ALL SYSTEMS NOMINAL' : 'EVENT ACTIVE'}
          </p>
        </div>
      </div>

      {/* compact control dock - bottom right */}
      <div className="absolute bottom-3 right-3 z-10 w-[248px] pointer-events-none">
        <div className="pointer-events-auto rounded-xl bg-slate-900/85 backdrop-blur-xl border border-white/10 shadow-xl shadow-black/30 px-2.5 py-2">
          <SimulationControls />
        </div>
      </div>

      {/* right status panel */}
      <div className="absolute top-3 right-3 z-10 pointer-events-none hidden md:block">
        <StatusPanel />
      </div>

      {/* mobile status strip */}
      <div className="absolute top-3 right-3 z-10 md:hidden pointer-events-none">
        <StatusPanel />
      </div>
    </motion.div>
  )
}
