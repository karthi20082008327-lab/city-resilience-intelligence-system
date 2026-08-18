import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { reportSimulationIncident } from '../services/simulationReporter'

/**
 * Centralized simulation state for the 3D Urban Digital Twin.
 * All event triggers flow through this store so that a future ESP32 / IoT
 * bridge can feed real sensor events into the same pipeline without touching
 * the visualization layer.
 */

export type SimulationMode = 'normal' | 'accident' | 'waterLeak' | 'fire'
export type CameraMode = 'street' | 'drone'
export type TimeOfDay = 'day' | 'night'
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH'

export interface EventInfo {
  type: SimulationMode | 'none'
  severity: Severity
  title: string
  locationLabel: string
  location: { x: number; y: number; z: number }
  timestamp: string
  detail: Record<string, string>
}

export interface SimulationState {
  mode: SimulationMode
  cameraMode: CameraMode
  underground: boolean
  timeOfDay: TimeOfDay
  demoActive: boolean
  demoPaused: boolean
  event: EventInfo
  /** increment to ask the camera system to focus the current event */
  focusToken: number

  // Actions
  triggerAccident: () => void
  triggerWaterLeak: () => void
  triggerFire: () => void
  resetSimulation: () => void
  setCameraMode: (mode: CameraMode) => void
  toggleUnderground: () => void
  setTimeOfDay: (t: TimeOfDay) => void
  focusEvent: () => void
  setDemoActive: (active: boolean, paused?: boolean) => void
  setDemoPaused: (paused: boolean) => void
}

const now = () => new Date().toLocaleTimeString('en-US', { hour12: false })

const makeEvent = (
  type: EventInfo['type'],
  title: string,
  locationLabel: string,
  location: { x: number; y: number; z: number },
  severity: Severity,
  detail: Record<string, string> = {},
): EventInfo => ({
  type,
  severity,
  title,
  locationLabel,
  location,
  timestamp: now(),
  detail,
})

export const useSimulationStore = create<SimulationState>()(
  persist(
    (set, get) => ({
  mode: 'normal',
  cameraMode: 'drone',
  underground: false,
  timeOfDay: 'day',
  demoActive: false,
  demoPaused: false,
  event: {
    type: 'none',
    severity: 'LOW',
    title: 'System Nominal',
    locationLabel: 'City Wide',
    location: { x: 0, y: 0, z: 0 },
    timestamp: now(),
    detail: {},
  },
  focusToken: 0,

  triggerAccident: () => {
    if (get().mode !== 'normal') get().resetSimulation()
    const location = { x: 6, y: 0, z: 6 }
    set({
      mode: 'accident',
      event: makeEvent(
        'accident',
        'ROAD ACCIDENT DETECTED',
        'Road Intersection · Sector 4',
        location,
        'HIGH',
        { Type: 'Road Accident', Status: 'ACTIVE', Severity: 'HIGH', Response: 'REQUIRED' },
      ),
    })
    // Automatically fly the camera to the incident the moment it is triggered.
    set((s) => ({ focusToken: s.focusToken + 1 }))
    reportSimulationIncident({
      category: 'accident',
      title: 'Road Accident Detected (3D Simulation)',
      description: 'Two vehicles collided at the Sector 4 intersection in the 3D city simulation.',
      locationLabel: 'Road Intersection · Sector 4',
      locationKey: 'accident-sector4',
      location: { x: location.x, z: location.z },
      cameraName: 'CAM-01 · Main Junction',
    })
  },

  triggerWaterLeak: () => {
    if (get().mode !== 'normal') get().resetSimulation()
    const location = { x: -14, y: 0, z: -30 }
    set({
      mode: 'waterLeak',
      event: makeEvent(
        'waterLeak',
        'UNDERGROUND WATER LEAK DETECTED',
        'Underground Zone · Main Water Main',
        location,
        'MEDIUM',
        {
          Type: 'Water Pipe Leak',
          Status: 'ACTIVE',
          Location: 'Underground Zone',
          Pressure: 'SIMULATED',
          'Affected Area': 'SIMULATED',
          Response: 'REQUIRED',
        },
      ),
    })
    // Automatically fly the camera to the incident the moment it is triggered.
    set((s) => ({ focusToken: s.focusToken + 1 }))
    reportSimulationIncident({
      category: 'water_leak',
      title: 'Underground Water Leak Detected (3D Simulation)',
      description: 'Water main leak detected in the underground utility zone of the 3D city simulation.',
      locationLabel: 'Underground Zone · Main Water Main',
      locationKey: 'water-watermain',
      location: { x: location.x, z: location.z },
      cameraName: 'CAM-04 · NW Water Main',
    })
  },

  triggerFire: () => {
    if (get().mode !== 'normal') get().resetSimulation()
    const location = { x: 16, y: 0, z: -16 }
    set({
      mode: 'fire',
      event: makeEvent(
        'fire',
        'BUILDING FIRE DETECTED',
        'Building Zone · Tower Block B2',
        location,
        'HIGH',
        {
          Type: 'Building Fire',
          Status: 'ACTIVE',
          Location: 'Building Zone',
          Severity: 'HIGH',
          Response: 'REQUIRED',
        },
      ),
    })
    // Automatically fly the camera to the incident the moment it is triggered.
    set((s) => ({ focusToken: s.focusToken + 1 }))
    reportSimulationIncident({
      category: 'fire',
      title: 'Building Fire Detected (3D Simulation)',
      description: 'Fire detected in a high-rise building in the 3D city simulation.',
      locationLabel: 'Building Zone · Tower B2',
      locationKey: 'fire-towerB2',
      location: { x: location.x, z: location.z },
      cameraName: 'CAM-02 · Tower B2 Fire Zone',
    })
  },

  resetSimulation: () => {
    set({
      mode: 'normal',
      underground: false,
      event: {
        type: 'none',
        severity: 'LOW',
        title: 'System Nominal',
        locationLabel: 'City Wide',
        location: { x: 0, y: 0, z: 0 },
        timestamp: now(),
        detail: {},
      },
    })
  },

  setCameraMode: (mode) => set({ cameraMode: mode }),
  toggleUnderground: () => set((s) => ({ underground: !s.underground })),
  setTimeOfDay: (t) => set({ timeOfDay: t }),
  focusEvent: () => set((s) => ({ focusToken: s.focusToken + 1 })),
  setDemoActive: (active, paused = false) =>
    set({ demoActive: active, demoPaused: paused, cameraMode: active ? 'drone' : get().cameraMode }),
  setDemoPaused: (paused) => set({ demoPaused: paused }),
}),
    {
      name: 'cris-simulation',
      partialize: (state) => ({
        mode: state.mode,
        cameraMode: state.cameraMode,
        underground: state.underground,
        timeOfDay: state.timeOfDay,
        event: state.event,
      }),
    }
  )
)

/* ---------------------------------------------------------------------------
 * Future IoT / ESP32 integration point.
 * Wire real sensor data by calling these functions from a WebSocket handler
 * or an API poller. The simulation reacts exactly like the UI buttons.
 * ------------------------------------------------------------------------- */

export function triggerAccident() {
  useSimulationStore.getState().triggerAccident()
}
export function triggerWaterLeak() {
  useSimulationStore.getState().triggerWaterLeak()
}
export function triggerFire() {
  useSimulationStore.getState().triggerFire()
}
export function resetSimulation() {
  useSimulationStore.getState().resetSimulation()
}

/**
 * Handle an incoming IoT payload.
 * Expected shape (whatever your ESP32/backend sends):
 *   { event: "accident" | "water_leak" | "fire" | "reset", ...meta }
 */
export function handleIoTEvent(payload: Record<string, unknown>) {
  const type = payload?.event ?? payload?.type
  switch (String(type).toLowerCase()) {
    case 'accident':
      triggerAccident()
      break
    case 'water_leak':
    case 'leak':
      triggerWaterLeak()
      break
    case 'fire':
      triggerFire()
      break
    case 'reset':
      resetSimulation()
      break
    default:
      // ignore unknown payloads
      break
  }
}

/** Example: connect to a WebSocket endpoint that pushes IoT events. */
export function connectIoTEventSource(url: string): () => void {
  let ws: WebSocket | null = null
  try {
    ws = new WebSocket(url)
    ws.onmessage = (msg) => {
      try {
        handleIoTEvent(JSON.parse(msg.data))
      } catch {
        /* ignore malformed frames */
      }
    }
  } catch {
    /* ignore connection errors */
  }
  return () => ws?.close()
}
