import { RoadNetwork } from './roadNetwork'
import { SimulationEngine } from './engine'
import {
  PedestrianEngine,
  PEDESTRIAN_COUNT,
  type PedStateName,
  type PedVehicleSensor,
} from './pedestrianEngine'
import { buildPedestrianWorld } from './pedestrianWorld'
import type { LaneChange, TurnType } from './types'
import { DETAIL_LEVELS, type SimDetailLevel } from './types'
import { ROADS_X, ROADS_Z, LANE_OFFSET } from '../components/simulation/constants'

/**
 * Fixed-timestep simulation runtime.
 *
 * The runtime decouples the SIMULATION update from the RENDER update:
 *
 *  - Both the vehicle engine and the pedestrian engine are advanced in exact
 *    `SIM_TICK` slices (fixed tick rate), never in render-frame deltas. A
 *    given wall-clock duration therefore always produces the same simulation
 *    state, regardless of the monitor's refresh rate, dropped frames or tab
 *    visibility.
 *  - The renderer reads INTERPOLATED snapshots (`getVehicles` /
 *    `getPedestrians`): the two most recent tick states are blended by the
 *    fraction of the current tick interval that has elapsed, so motion looks
 *    smooth even though the sim itself only advances at the tick rate.
 *  - Lifecycle events (arrivals / removals / reroutes / collisions) are
 *    buffered and drained once per frame (`drainEvents`), so the visual layer
 *    manages its mesh pool against real sim events instead of guessing.
 *  - The pedestrian traffic sensor reads the VEHICLE ENGINE's state at tick
 *    boundaries — the same source of truth that moves the cars — instead of
 *    reading rendered positions. Pedestrians therefore decide to wait/cross
 *    based on exactly what the simulation will do next, not on interpolated
 *    visuals.
 *
 * Pure and deterministic: nothing in here depends on the wall clock except
 * `advance()`'s argument, and both engines are driven by seeded PRNGs.
 */

/** Simulation ticks per second (independent of the render frame rate). */
export const SIM_TICK_RATE = 30
/** Duration of one simulation tick in seconds. */
export const SIM_TICK = 1 / SIM_TICK_RATE

/**
 * Hard cap on ticks advanced per `advance()` call. After a long stall (e.g. a
 * backgrounded tab) the simulation fast-forwards at most this many ticks, so
 * a 30-second tab switch never spirals the sim out of control.
 */
export const MAX_TICKS_PER_FRAME = 8
/** Input clamp: anything longer counts as a dropped-frame spike. */
const MAX_FRAME_DT = 1.0

/* Pedestrian traffic-sensor geometry (mirrors the old render-side sensor). */
const ROAD_DANGER = 8
const ROAD_MARGIN = 1.4
const ETA_THRESHOLD = 3.5

export interface RuntimeOptions {
  /** Road grid X coordinates (vertical roads). */
  xs?: number[]
  /** Road grid Z coordinates (horizontal roads). */
  zs?: number[]
  laneOffset?: number
  lanes?: number
  vehicleSeed?: number
  speedRange?: [number, number]
  pedestrianCount?: number
  pedestrianSeed?: number
}

/** Per-vehicle view the visual layer needs to drive one car rig. */
export interface VehicleRenderState {
  id: string
  x: number
  z: number
  heading: number
  speed: number
  acceleration: number
  braking: number
  /** Monotonic visual distance (never reset by engine reroutes). */
  totalDistance: number
  targetSpeed: number
  turnType: TurnType | null
  laneChange: LaneChange | null
  /** Simulation detail level (renderer LOD input). */
  detail: SimDetailLevel
}

/** Per-pedestrian view the visual layer needs to drive one humanoid rig. */
export interface PedRenderState {
  index: number
  x: number
  z: number
  yaw: number
  /** Walk-cycle phase in radians. */
  phase: number
  state: PedStateName
  speed: number
  baseSpeed: number
  /** Simulation detail level (renderer LOD input). */
  detail: SimDetailLevel
}

/** A sim event the visual layer must react to once per frame. */
export type RuntimeEvent =
  | { kind: 'vehicle-arrived'; vehicleId: string }
  | { kind: 'vehicle-removed'; vehicleId: string }
  | { kind: 'vehicle-rerouted'; vehicleId: string }
  | { kind: 'collision'; vehicleId: string; otherId: string }

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Angular interpolation along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return a + diff * t
}

/** Blend the previous and current vehicle snapshots into a render list. */
export function interpolateVehicles(
  prev: ReadonlyMap<string, VehicleRenderState>,
  curr: ReadonlyMap<string, VehicleRenderState>,
  alpha: number
): VehicleRenderState[] {
  const out: VehicleRenderState[] = []
  for (const [id, cur] of curr) {
    const pv = prev.get(id)
    if (!pv) {
      out.push(cur)
      continue
    }
    out.push({
      ...cur,
      x: lerp(pv.x, cur.x, alpha),
      z: lerp(pv.z, cur.z, alpha),
      heading: lerpAngle(pv.heading, cur.heading, alpha),
      speed: lerp(pv.speed, cur.speed, alpha),
      totalDistance: lerp(pv.totalDistance, cur.totalDistance, alpha),
    })
  }
  return out
}

/** Blend the previous and current pedestrian snapshots into a render list. */
export function interpolatePedestrians(
  prev: ReadonlyMap<number, PedRenderState>,
  curr: ReadonlyMap<number, PedRenderState>,
  alpha: number
): PedRenderState[] {
  const out: PedRenderState[] = []
  for (const [index, cur] of curr) {
    const pv = prev.get(index)
    if (!pv) {
      out.push(cur)
      continue
    }
    out.push({
      ...cur,
      x: lerp(pv.x, cur.x, alpha),
      z: lerp(pv.z, cur.z, alpha),
      yaw: lerpAngle(pv.yaw, cur.yaw, alpha),
      phase: lerpAngle(pv.phase, cur.phase, alpha),
      speed: lerp(pv.speed, cur.speed, alpha),
    })
  }
  return out
}

export class SimulationRuntime {
  readonly vehicles: SimulationEngine
  readonly pedestrians: PedestrianEngine

  /** Simulation time in seconds (fixed ticks only). */
  simTime = 0

  private accumulator = 0
  private alpha = 0

  private prevV = new Map<string, VehicleRenderState>()
  private currV = new Map<string, VehicleRenderState>()
  private prevP = new Map<number, PedRenderState>()
  private currP = new Map<number, PedRenderState>()

  /** Monotonic per-vehicle visual distance, immune to engine reroute resets. */
  private visualDist = new Map<string, number>()

  private pendingEvents: RuntimeEvent[] = []

  /** Current view focus (camera position); drives per-entity detail levels. */
  private viewX = 0
  private viewZ = 0
  private viewActive = false

  constructor(options: RuntimeOptions = {}) {
    const xs = options.xs ?? ROADS_X
    const zs = options.zs ?? ROADS_Z
    this.vehicles = new SimulationEngine(
      new RoadNetwork({
        xs,
        zs,
        laneOffset: options.laneOffset ?? LANE_OFFSET,
        lanes: options.lanes,
      }),
      { seed: options.vehicleSeed ?? 20260813, speedRange: options.speedRange ?? [5, 9] }
    )
    this.pedestrians = new PedestrianEngine(buildPedestrianWorld(), {
      count: options.pedestrianCount ?? PEDESTRIAN_COUNT,
      masterSeed: options.pedestrianSeed ?? 20260816,
    })
  }

  /** Fraction of the current tick interval elapsed (0 = just ticked, →1 = next tick). */
  getAlpha(): number {
    return this.alpha
  }

  /**
   * Set the view focus (e.g. the camera position). Entities are simulated at
   * detail levels based on their distance from this point: FULL behaviour
   * near the camera, down to MINIMAL simulation far away. When the focus is
   * never set, everything runs at FULL detail (deterministic tests).
   */
  setViewCenter(x: number, z: number): void {
    this.viewX = x
    this.viewZ = z
    this.viewActive = true
  }

  /** Current view focus set by the visual layer (used for detail bands). */
  getViewCenter(): { x: number; z: number } {
    return { x: this.viewX, z: this.viewZ }
  }

  /** Detail level for a world position, based on distance from the view focus. */
  private detailAt(x: number, z: number): SimDetailLevel {
    if (!this.viewActive) return DETAIL_LEVELS.FULL
    const dx = x - this.viewX
    const dz = z - this.viewZ
    const d2 = dx * dx + dz * dz
    if (d2 < 30 * 30) return DETAIL_LEVELS.FULL
    if (d2 < 55 * 55) return DETAIL_LEVELS.MEDIUM
    if (d2 < 90 * 90) return DETAIL_LEVELS.FAR
    return DETAIL_LEVELS.MINIMAL
  }

  /**
   * Advance the simulation by `realDt` wall-clock seconds. Runs zero or more
   * fixed ticks (each `SIM_TICK` long); leftover time feeds interpolation.
   */
  advance(realDt: number): void {
    const dt = Number.isFinite(realDt) ? Math.min(Math.max(realDt, 0), MAX_FRAME_DT) : 0
    if (dt <= 0) {
      this.alpha = Math.min(Math.max(this.accumulator / SIM_TICK, 0), 1)
      return
    }
    this.accumulator += dt
    let ticks = 0
    while (this.accumulator >= SIM_TICK && ticks < MAX_TICKS_PER_FRAME) {
      this.runTick()
      this.accumulator -= SIM_TICK
      ticks++
    }
    if (ticks >= MAX_TICKS_PER_FRAME) this.accumulator = 0
    this.alpha = Math.min(Math.max(this.accumulator / SIM_TICK, 0), 1)
  }

  /** Run exactly one fixed tick: step both engines, then snapshot the result. */
  private runTick(): void {
    // Rotate snapshots: the current state becomes "previous" for interpolation.
    this.prevV = this.currV
    this.currV = new Map()
    this.prevP = this.currP
    this.currP = new Map()

    this.simTime += SIM_TICK

    // Assign per-entity detail levels from the current view focus, so the
    // engines can degrade behaviour / AI frequency with distance.
    for (const v of this.vehicles.getActiveVehicles()) {
      v.detail = this.detailAt(v.x, v.z)
    }
    if (this.viewActive) {
      this.pedestrians.applyDetailLevels((_i, x, z) => this.detailAt(x, z))
    } else {
      this.pedestrians.applyDetailLevels(() => DETAIL_LEVELS.FULL)
    }

    const result = this.vehicles.step(SIM_TICK)

    for (const v of result.arrived) this.pendingEvents.push({ kind: 'vehicle-arrived', vehicleId: v.id })
    for (const v of result.removed) {
      this.pendingEvents.push({ kind: 'vehicle-removed', vehicleId: v.id })
      this.visualDist.delete(v.id)
    }
    for (const v of result.rerouted) this.pendingEvents.push({ kind: 'vehicle-rerouted', vehicleId: v.id })
    for (const c of result.collisions) {
      this.pendingEvents.push({ kind: 'collision', vehicleId: c.a.id, otherId: c.b.id })
    }

    // Pedestrians react to the vehicle ENGINE state (sim source of truth), not
    // to rendered/interpolated positions.
    this.pedestrians.step(SIM_TICK, this.sensor)

    // Snapshot the post-tick state for rendering / interpolation.
    for (const v of this.vehicles.getActiveVehicles()) {
      // Suspended vehicles (accident override / event stop) are driven by the
      // visual layer, not by the engine: freeze their visual distance too, so
      // resuming later doesn't spin the wheels from stale state.
      let dist = this.visualDist.get(v.id)
      if (!this.vehicles.isSuspended(v.id)) {
        dist = (dist ?? 0) + v.speed * SIM_TICK
        this.visualDist.set(v.id, dist)
      }
      dist = dist ?? 0
      this.currV.set(v.id, {
        id: v.id,
        x: v.x,
        z: v.z,
        heading: v.heading,
        speed: v.speed,
        acceleration: v.acceleration,
        braking: v.braking,
        totalDistance: dist,
        targetSpeed: v.targetSpeed,
        turnType: v.turn?.type ?? null,
        laneChange: v.laneChange,
        detail: v.detail,
      })
    }
    for (const p of this.pedestrians.getVisuals()) {
      this.currP.set(p.index, {
        index: p.index,
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        phase: p.phase,
        state: p.state,
        speed: p.speed,
        baseSpeed: p.baseSpeed,
        detail: p.detail,
      })
    }
  }

  /** Interpolated render list of all active vehicles. */
  getVehicles(): VehicleRenderState[] {
    return interpolateVehicles(this.prevV, this.currV, this.alpha)
  }

  /** Interpolated render list of all pedestrians. */
  getPedestrians(): PedRenderState[] {
    return interpolatePedestrians(this.prevP, this.currP, this.alpha)
  }

  /** Events accumulated since the last call (drained once per frame). */
  drainEvents(): RuntimeEvent[] {
    const out = this.pendingEvents
    this.pendingEvents = []
    return out
  }

  /** Reset both engines and every snapshot / buffer. */
  reset(): void {
    this.vehicles.reset()
    this.pedestrians.reset()
    this.simTime = 0
    this.accumulator = 0
    this.alpha = 0
    this.prevV = new Map()
    this.currV = new Map()
    this.prevP = new Map()
    this.currP = new Map()
    this.visualDist.clear()
    this.pendingEvents = []
  }

  /**
   * Pedestrian traffic sensor backed by the vehicle engine. Replicates the
   * crossing-window check: a car threatens a crosswalk when it is near the
   * segment, pointing at it, and close enough in time that it could hit a
   * pedestrian who steps out.
   */
  private sensor: PedVehicleSensor = {
    roadClear: (x0, z0, x1, z1): boolean => {
      const len = Math.hypot(x1 - x0, z1 - z0) || 1
      const ux = (x1 - x0) / len
      const uz = (z1 - z0) / len
      // Only vehicles near the crossing matter — queried from the spatial hash
      // instead of scanning the whole fleet (O(nearby) not O(vehicles)).
      for (const v of this.vehicles.vehiclesNear(x0, z0, ROAD_DANGER + 4)) {
        if (v.status === 'removed') continue
        const px = v.x
        const pz = v.z
        const rx = px - x0
        const rz = pz - z0
        const proj = Math.max(0, Math.min(len, rx * ux + rz * uz))
        const nearX = x0 + ux * proj
        const nearZ = z0 + uz * proj
        const d = Math.hypot(px - nearX, pz - nearZ)
        if (d > ROAD_DANGER + 4) continue // nowhere near this crossing

        const yaw = v.heading
        const fx = Math.sin(yaw)
        const fz = Math.cos(yaw)
        const tx = nearX - px
        const tz = nearZ - pz
        const dist = Math.hypot(tx, tz) || 1e-4
        if (dist < ROAD_MARGIN) return false // car already on / just before the crossing
        // Suspended cars (accident override / event stop) are parked, not
        // approaching: they only block the crossing they physically sit on.
        const speed = this.vehicles.isSuspended(v.id) ? 0 : v.speed
        const toward = (tx * fx + tz * fz) / dist
        const eta = speed > 0.5 ? dist / speed : Infinity
        if (toward > 0.25 && eta < ETA_THRESHOLD) return false // approaching within look-ahead
        // Slow cars heading into the crossing from either direction that are
        // very close may not stop.
        if (dist < ROAD_MARGIN + 2.2 && eta < 6) return false
      }
      return true
    },
  }
}
