import { motion } from 'framer-motion'
import { useSimulationStore } from '../../stores/simulationStore'

function Btn({
  onClick,
  active,
  color,
  children,
  className = '',
}: {
  onClick: () => void
  active?: boolean
  color: 'red' | 'blue' | 'amber' | 'emerald' | 'slate' | 'violet' | 'sky'
  children: React.ReactNode
  className?: string
}) {
  const colors: Record<string, string> = {
    red: active
      ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 border-red-500'
      : 'bg-white text-red-600 border-red-200 hover:bg-red-50',
    blue: active
      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 border-blue-500'
      : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50',
    amber: active
      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30 border-amber-500'
      : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50',
    emerald: active
      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 border-emerald-500'
      : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50',
    violet: active
      ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30 border-violet-500'
      : 'bg-white text-violet-600 border-violet-200 hover:bg-violet-50',
    sky: active
      ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30 border-sky-500'
      : 'bg-white text-sky-600 border-sky-200 hover:bg-sky-50',
    slate: active
      ? 'bg-slate-700 text-white shadow-lg shadow-slate-500/30 border-slate-700'
      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
  }
  return (
    <button
      onClick={onClick}
      className={`flex min-w-0 items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-semibold leading-none transition-all duration-200 active:scale-[0.97] ${colors[color]} ${className}`}
    >
      {children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  )
}

export function SimulationControls() {
  const mode = useSimulationStore((s) => s.mode)
  const cameraMode = useSimulationStore((s) => s.cameraMode)
  const underground = useSimulationStore((s) => s.underground)
  const timeOfDay = useSimulationStore((s) => s.timeOfDay)
  const demoActive = useSimulationStore((s) => s.demoActive)
  const demoPaused = useSimulationStore((s) => s.demoPaused)

  const trigger = (fn: () => void) => () => fn()

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto flex flex-col gap-2 w-full"
    >
      <Section title="Disaster Events">
        <Btn color="red" active={mode === 'accident'} onClick={trigger(useSimulationStore.getState().triggerAccident)}>
          🚗 ACCIDENT
        </Btn>
        <Btn color="blue" active={mode === 'waterLeak'} onClick={trigger(useSimulationStore.getState().triggerWaterLeak)}>
          💧 WATER LEAK
        </Btn>
        <Btn color="amber" active={mode === 'fire'} onClick={trigger(useSimulationStore.getState().triggerFire)}>
          🔥 FIRE ACCIDENT
        </Btn>
        <Btn color="slate" onClick={trigger(useSimulationStore.getState().resetSimulation)}>
          🔄 RESET
        </Btn>
      </Section>

      <Section title="Camera">
        <Btn
          color="sky"
          active={cameraMode === 'street'}
          onClick={trigger(() => useSimulationStore.getState().setCameraMode('street'))}
        >
          🎥 STREET VIEW
        </Btn>
        <Btn
          color="sky"
          active={cameraMode === 'drone'}
          onClick={trigger(() => useSimulationStore.getState().setCameraMode('drone'))}
        >
          🚁 DRONE VIEW
        </Btn>
        <Btn color="violet" onClick={trigger(useSimulationStore.getState().focusEvent)}>
          🎯 FOCUS EVENT
        </Btn>
      </Section>

      <Section title="Environment">
        <Btn
          color="emerald"
          active={!underground}
          onClick={trigger(() => {
            if (useSimulationStore.getState().underground) useSimulationStore.getState().toggleUnderground()
          })}
        >
          🌍 NORMAL VIEW
        </Btn>
        <Btn
          color="emerald"
          active={underground}
          onClick={trigger(useSimulationStore.getState().toggleUnderground)}
        >
          🕳️ UNDERGROUND VIEW
        </Btn>
        <Btn
          color="amber"
          active={timeOfDay === 'day'}
          onClick={trigger(() => useSimulationStore.getState().setTimeOfDay('day'))}
        >
          ☀️ DAY
        </Btn>
        <Btn
          color="amber"
          active={timeOfDay === 'night'}
          onClick={trigger(() => useSimulationStore.getState().setTimeOfDay('night'))}
        >
          🌙 NIGHT
        </Btn>
      </Section>

      <Section title="Presentation">
        <Btn
          color="violet"
          active={demoActive}
          onClick={trigger(() => {
            const st = useSimulationStore.getState()
            if (st.demoActive) st.setDemoActive(false)
            else st.setDemoActive(true, false)
          })}
        >
          🎬 {demoActive ? 'STOP DEMO' : 'DEMO MODE'}
        </Btn>
        {demoActive && (
          <Btn color="slate" onClick={trigger(() => useSimulationStore.getState().setDemoPaused(!demoPaused))}>
            {demoPaused ? '▶ RESUME' : '⏸ PAUSE'}
          </Btn>
        )}
      </Section>
    </motion.div>
  )
}
