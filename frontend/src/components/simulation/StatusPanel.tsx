import { motion } from 'framer-motion'
import { useSimulationStore, type SimulationMode } from '../../stores/simulationStore'

function Row({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'warn' | 'bad' }) {
  const tones: Record<string, string> = {
    default: 'text-slate-400',
    ok: 'text-emerald-500',
    warn: 'text-amber-500',
    bad: 'text-red-500',
  }
  return (
    <div className="flex items-center justify-between py-1 text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono font-semibold ${tones[tone]}`}>{value}</span>
    </div>
  )
}

const MODE_TONE: Record<SimulationMode, { value: string; tone: 'default' | 'ok' | 'warn' | 'bad' }> = {
  normal: { value: 'ONLINE', tone: 'ok' },
  accident: { value: 'ACTIVE', tone: 'bad' },
  waterLeak: { value: 'ACTIVE', tone: 'warn' },
  fire: { value: 'ACTIVE', tone: 'bad' },
}

export function StatusPanel() {
  const mode = useSimulationStore((s) => s.mode)
  const event = useSimulationStore((s) => s.event)
  const cameraMode = useSimulationStore((s) => s.cameraMode)
  const underground = useSimulationStore((s) => s.underground)
  const timeOfDay = useSimulationStore((s) => s.timeOfDay)

  const active = mode !== 'normal'
  const modeInfo = MODE_TONE[mode]

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className="pointer-events-auto w-full max-w-[260px] rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-xl shadow-lg shadow-slate-900/5"
    >
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">System Status</span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </div>

      {!active ? (
        <div className="px-3 py-3">
          <Row label="City Simulation" value="ONLINE" tone="ok" />
          <Row label="Traffic" value="ACTIVE" tone="ok" />
          <Row label="Pedestrians" value="ACTIVE" tone="ok" />
          <Row label="Water Network" value="NORMAL" tone="ok" />
          <Row label="Buildings" value="NORMAL" tone="ok" />
          <Row label="Emergency System" value="READY" tone="ok" />
          <Row label="Camera" value={cameraMode === 'street' ? 'STREET' : 'DRONE'} />
          <Row label="View" value={underground ? 'UNDERGROUND' : 'SURFACE'} />
          <Row label="Time" value={timeOfDay === 'day' ? 'DAY' : 'NIGHT'} />
        </div>
      ) : (
        <div className="px-3 py-3">
          <div className="mb-2">
            <p className="text-[11px] font-bold text-red-500 tracking-wide">
              {event.title}
            </p>
            <p className="text-[10px] text-slate-400">Timestamp: {event.timestamp}</p>
          </div>
          {Object.entries(event.detail).map(([k, v]) => (
            <Row key={k} label={k} value={v} tone={v === 'ACTIVE' || v === 'REQUIRED' ? 'bad' : 'default'} />
          ))}
          <div className="border-t border-slate-100 mt-2 pt-2">
            <Row label="Event Status" value={modeInfo.value} tone={modeInfo.tone} />
            <Row
              label="Location"
              value={`X:${event.location.x.toFixed(0)} Z:${event.location.z.toFixed(0)}`}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}
