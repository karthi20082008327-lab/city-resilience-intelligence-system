import { useEffect, useRef } from 'react'
import { useSimulationStore } from '../../stores/simulationStore'

const DEMO_STEPS: Array<{ key: string; action: 'accident' | 'waterLeak' | 'fire' }> = [
  { key: 'accident', action: 'accident' },
  { key: 'waterLeak', action: 'waterLeak' },
  { key: 'fire', action: 'fire' },
]

/**
 * Autonomous hackathon demo: flies the drone around the city, then
 * triggers each disaster in sequence, focusing the camera on each event
 * and returning to overview between them.
 */
export function DemoController() {
  const stepRef = useRef(0)
  const phaseRef = useRef<'overview' | 'focus'>('overview')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const demoActive = useSimulationStore((s) => s.demoActive)

  useEffect(() => {
    const clear = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!demoActive) {
      clear()
      stepRef.current = 0
      phaseRef.current = 'overview'
      return
    }

    const run = () => {
      const sim = useSimulationStore.getState()
      if (!sim.demoActive) return
      if (sim.demoPaused) {
        // wait and re-check
        timerRef.current = setTimeout(run, 300)
        return
      }

      if (phaseRef.current === 'overview') {
        // fly the drone, then trigger the current step
        if (stepRef.current >= DEMO_STEPS.length) {
          sim.resetSimulation()
          sim.setDemoActive(false)
          return
        }
        sim.setCameraMode('drone')
        timerRef.current = setTimeout(() => {
          const step = DEMO_STEPS[stepRef.current]
          if (step.action === 'accident') sim.triggerAccident()
          else if (step.action === 'waterLeak') sim.triggerWaterLeak()
          else sim.triggerFire()
          phaseRef.current = 'focus'
          timerRef.current = setTimeout(run, 800)
        }, 3500)
      } else {
        // focus the event, observe, then return to overview
        const sim2 = useSimulationStore.getState()
        sim2.focusEvent()
        timerRef.current = setTimeout(() => {
          phaseRef.current = 'overview'
          stepRef.current += 1
          sim2.resetSimulation()
          timerRef.current = setTimeout(run, 2500)
        }, 6000)
      }
    }

    timerRef.current = setTimeout(run, 1200)
    return clear
  }, [demoActive])

  return null
}
