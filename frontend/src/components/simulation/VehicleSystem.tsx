import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore, type SimulationState } from '../../stores/simulationStore'
import { clearCarRegistry, registerCar, type CarHandle } from './carRegistry'
import { buildCarRig, CAR_BODY_COLORS, resetRig, setRigLod, type CarRig, type CarVariantKind } from './carModel'
import { updateCarVisuals } from './carAnimator'
import { DETAIL_LEVELS } from '../../simulation/types'
import type { SimulationRuntime } from '../../simulation/runtime'

/**
 * Engine-driven traffic for the CRIS 3D city.
 *
 * This component is a pure visual layer over the shared {@link SimulationRuntime}:
 * the runtime advances the SimulationEngine at a fixed tick rate and produces
 * interpolated vehicle snapshots (`runtime.getVehicles()`). This component
 * mirrors those snapshots onto pooled car rigs (see carModel / carAnimator)
 * and manages the rig pool against the runtime's drained lifecycle events. It
 * never invents movement of its own — except for the explicit "accident
 * override" control, which is handed out by AccidentSimulation.
 *
 * Wheel rolling is driven by the distance the vehicle actually advanced each
 * frame (`Δdistance / tyre radius`), front wheels steer by the curvature the
 * vehicle traced, and brake / turn / headlights react to engine state.
 */

const TARGET_CARS = (() => {
  // `?cars=N` overrides the fleet size (distance LOD keeps it cheap).
  const v = new URLSearchParams(window.location.search).get('cars')
  const n = v === null ? NaN : parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : 50
})()
const EVENT_BLOCK_RADIUS = 11

/** Variant + size pattern so the fleet looks varied but models stay shared. */
const VARIANT_CYCLE: CarVariantKind[] = [
  'sedan',
  'hatchback',
  'suv',
  'sedan',
  'sedan',
  'hatchback',
  'suv',
  'sedan',
]
const SCALE_CYCLE = [1.0, 1.03, 0.97, 1.0, 0.96, 1.04, 0.99, 1.02]

function acquireRig(index: number): CarRig {
  const variant = VARIANT_CYCLE[index % VARIANT_CYCLE.length]
  const color = CAR_BODY_COLORS[index % CAR_BODY_COLORS.length]
  const scale = SCALE_CYCLE[index % SCALE_CYCLE.length]
  return buildCarRig({ variant, color, scale })
}

export function VehicleSystem({ runtime }: { runtime: SimulationRuntime }) {
  const rootRef = useRef<THREE.Group>(null)
  const poolRef = useRef<CarRig[]>([])
  const activeRef = useRef<Map<string, CarHandle>>(new Map())
  const buildIdxRef = useRef(0)
  const blockRef = useRef<{ mode: string; x: number; z: number } | null>(null)

  const engine = runtime.vehicles

  const acquireMesh = (): CarHandle => {
    const pooled = poolRef.current.pop()
    let rig: CarRig
    let index: number
    if (pooled) {
      rig = pooled
      index = pooled.group.userData.rigIndex as number
    } else {
      index = buildIdxRef.current++
      rig = acquireRig(index)
      rig.group.userData.rigIndex = index
      rootRef.current?.add(rig.group)
    }
    rig.group.visible = true
    rig.group.userData.lastDist = NaN // force animation state re-init
    return { ...rig, vehicleId: '', override: null, stopped: false, speed: 6, targetSpeed: 6, index }
  }

  const releaseMesh = (handle: CarHandle) => {
    resetRig(handle)
    handle.group.visible = false
    handle.override = null
    handle.stopped = false
    handle.group.userData.lastDist = NaN
    poolRef.current.push(handle)
  }

  const syncEventBlocking = (sim: SimulationState) => {
    if (sim.mode === 'normal') {
      if (blockRef.current) {
        engine.unblockEdgesNear(blockRef.current.x, blockRef.current.z, EVENT_BLOCK_RADIUS + 4)
        blockRef.current = null
      }
      return
    }
    const loc = sim.event.location
    const cur = blockRef.current
    if (cur && cur.mode === sim.mode && Math.abs(cur.x - loc.x) < 0.001 && Math.abs(cur.z - loc.z) < 0.001) {
      return
    }
    if (cur) engine.unblockEdgesNear(cur.x, cur.z, EVENT_BLOCK_RADIUS + 4)
    engine.blockEdgesNear(loc.x, loc.z, EVENT_BLOCK_RADIUS)
    blockRef.current = { mode: sim.mode, x: loc.x, z: loc.z }
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    const sim = useSimulationStore.getState()
    const night = sim.timeOfDay === 'night'
    const blinkOn = Math.floor(state.clock.elapsedTime * 5) % 2 === 0
    const eventLoc = sim.event.location

    // 1) Road closures from active events -> vehicles reroute around them.
    //    The runtime picks these up on the next fixed tick.
    syncEventBlocking(sim)

    // 2) Advance the simulation at a fixed tick rate (render-FPS independent).
    runtime.advance(delta)

    // 3) Recycle meshes for vehicles that completed/removed this frame and
    //    keep the fleet topped up from the runtime's real sim events.
    for (const ev of runtime.drainEvents()) {
      if (ev.kind !== 'vehicle-removed') continue
      const handle = activeRef.current.get(ev.vehicleId)
      if (handle) {
        activeRef.current.delete(ev.vehicleId)
        releaseMesh(handle)
      }
      engine.spawnVehicle()
    }
    while (engine.getActiveVehicles().length < TARGET_CARS) {
      if (!engine.spawnVehicle()) break
    }

    // 4) Acquire meshes for newly spawned vehicles.
    for (const v of engine.getActiveVehicles()) {
      if (!activeRef.current.has(v.id)) {
        const handle = acquireMesh()
        handle.vehicleId = v.id
        activeRef.current.set(v.id, handle)
      }
    }

    // 5) Drive meshes from the runtime's interpolated snapshots (or accident override).
    const accidentActive = sim.mode === 'accident'
    for (const rs of runtime.getVehicles()) {
      const handle = activeRef.current.get(rs.id)
      if (!handle) continue

      // Distance LOD: FAR / VERY FAR cars drop to body-only rendering.
      const far = rs.detail < DETAIL_LEVELS.MEDIUM
      if (far !== handle.group.userData.lodFar) {
        setRigLod(handle, far)
        handle.group.userData.lodFar = far
      }

      const crashControl = handle.override
      const nearEvent = crashControl
        ? false
        : accidentActive &&
          handle.group.position.distanceTo(new THREE.Vector3(eventLoc.x, 0, eventLoc.z)) < 16

      if (crashControl) {
        // Crash car: leaves its route and drives to the override point.
        engine.suspend(rs.id)
        const pos = handle.group.position
        const toTarget = new THREE.Vector3().subVectors(crashControl, pos)
        const len = toTarget.length()
        if (len > 0.6) {
          toTarget.normalize()
          handle.speed = THREE.MathUtils.damp(handle.speed, 10, 4, dt)
          pos.addScaledVector(toTarget, handle.speed * dt)
          handle.group.rotation.y = Math.atan2(toTarget.x, toTarget.z)
          handle.stopped = false
        } else {
          handle.speed = THREE.MathUtils.damp(handle.speed, 0, 6, dt)
          handle.stopped = true
        }
        updateCarVisuals(handle, {
          dt,
          night,
          blinkOn,
          speed: handle.speed,
          acceleration: 0,
          braking: 0,
          heading: handle.group.rotation.y,
          totalDistance: 0,
          turnType: null,
          laneChange: null,
          manual: true,
          brakeForce: handle.stopped ? 'on' : 'off',
          lodFar: far,
        })
        continue
      }

      if (nearEvent) {
        // Nearby traffic stops temporarily (engine vehicle suspended in place).
        engine.suspend(rs.id)
        handle.speed = THREE.MathUtils.damp(handle.speed, 0, 6, dt)
        handle.stopped = true
        updateCarVisuals(handle, {
          dt,
          night,
          blinkOn,
          speed: handle.speed,
          acceleration: 0,
          braking: 0,
          heading: handle.group.rotation.y,
          totalDistance: 0,
          turnType: null,
          laneChange: null,
          manual: true,
          brakeForce: 'on',
          lodFar: far,
        })
        continue
      }

      // Normal: resume engine control and mirror the interpolated truth.
      engine.resume(rs.id)
      // Y=0.021 sits the wheels exactly on the asphalt surface.
      handle.group.position.set(rs.x, 0.021, rs.z)
      handle.group.rotation.y = rs.heading
      handle.speed = rs.speed
      handle.targetSpeed = rs.targetSpeed
      handle.stopped = false
      updateCarVisuals(handle, {
        dt,
        night,
        blinkOn,
        speed: rs.speed,
        acceleration: rs.acceleration,
        braking: rs.braking,
        heading: rs.heading,
        totalDistance: rs.totalDistance,
        turnType: rs.turnType,
        laneChange: rs.laneChange,
        manual: false,
        lodFar: far,
      })
    }

    // 6) Refresh the shared registry for the accident system.
    clearCarRegistry()
    for (const handle of activeRef.current.values()) {
      if (handle.group.visible && handle.vehicleId) registerCar(handle)
    }
  })

  return <group ref={rootRef} />
}
