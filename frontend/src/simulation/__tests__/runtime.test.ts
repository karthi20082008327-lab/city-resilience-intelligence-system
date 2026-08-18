import { describe, it, expect } from 'vitest'
import {
  SimulationRuntime,
  SIM_TICK,
  SIM_TICK_RATE,
  MAX_TICKS_PER_FRAME,
  lerpAngle,
  interpolateVehicles,
  interpolatePedestrians,
  type VehicleRenderState,
  type PedRenderState,
} from '../runtime'
import { nodeKey } from '../roadNetwork'
import { DETAIL_LEVELS } from '../types'

function makeRuntime(opts: Partial<ConstructorParameters<typeof SimulationRuntime>[0]> = {}) {
  return new SimulationRuntime({ vehicleSeed: 1337, pedestrianSeed: 1337, ...opts })
}

function spawnFleet(rt: SimulationRuntime, target = 40) {
  let guard = 0
  while (rt.vehicles.getActiveVehicles().length < target && guard++ < 500) {
    if (!rt.vehicles.spawnVehicle()) break
  }
}

describe('simulation runtime — fixed tick rate', () => {
  it('advances the simulation in exact SIM_TICK slices', () => {
    const rt = makeRuntime()
    expect(rt.simTime).toBe(0)

    rt.advance(0) // no wall time -> no tick
    expect(rt.simTime).toBe(0)

    rt.advance(SIM_TICK) // exactly one tick
    expect(rt.simTime).toBeCloseTo(SIM_TICK, 9)

    // 2 full ticks plus a 1/3 leftover.
    rt.advance(SIM_TICK * 2 + SIM_TICK / 3)
    expect(rt.simTime).toBeCloseTo(SIM_TICK * 3, 9)
    expect(rt.getAlpha()).toBeCloseTo(1 / 3, 5)

    // The leftover accumulates into the next tick.
    rt.advance((SIM_TICK * 2) / 3)
    expect(rt.simTime).toBeCloseTo(SIM_TICK * 4, 9)
    expect(rt.getAlpha()).toBeCloseTo(0, 5)
  })

  it('caps a giant frame delta so the simulation cannot spiral out of control', () => {
    const rt = makeRuntime()
    rt.advance(10) // clamped to 0.25s -> at most MAX_TICKS_PER_FRAME ticks
    expect(rt.simTime).toBeCloseTo(SIM_TICK * MAX_TICKS_PER_FRAME, 9)
    expect(rt.getAlpha()).toBeGreaterThanOrEqual(0)
    expect(rt.getAlpha()).toBeLessThan(1)

    // A subsequent normal frame continues from the fresh accumulator.
    rt.advance(SIM_TICK)
    expect(rt.simTime).toBeCloseTo(SIM_TICK * (MAX_TICKS_PER_FRAME + 1), 9)
  })

  it('is deterministic for the same seed and vehicle set', () => {
    const a = makeRuntime()
    const b = makeRuntime()
    spawnFleet(a)
    spawnFleet(b)
    for (let i = 0; i < 600; i++) {
      a.advance(SIM_TICK)
      b.advance(SIM_TICK)
    }
    const va = a.getVehicles()
    const vb = b.getVehicles()
    expect(va.length).toBe(vb.length)
    for (let i = 0; i < va.length; i++) {
      expect(va[i].id).toBe(vb[i].id)
      expect(va[i].x).toBeCloseTo(vb[i].x, 6)
      expect(va[i].z).toBeCloseTo(vb[i].z, 6)
      expect(va[i].heading).toBeCloseTo(vb[i].heading, 6)
      expect(va[i].totalDistance).toBeCloseTo(vb[i].totalDistance, 6)
    }
    const pa = a.getPedestrians()
    const pb = b.getPedestrians()
    expect(pa.length).toBe(pb.length)
    for (let i = 0; i < pa.length; i++) {
      expect(pa[i].x).toBeCloseTo(pb[i].x, 6)
      expect(pa[i].z).toBeCloseTo(pb[i].z, 6)
      expect(pa[i].yaw).toBeCloseTo(pb[i].yaw, 6)
      expect(pa[i].phase).toBeCloseTo(pb[i].phase, 6)
    }
  })
})

describe('simulation runtime — interpolation', () => {
  it('blends vehicle state between the previous and current ticks', () => {
    const prev = new Map<string, VehicleRenderState>([
      [
        'v1',
        {
          id: 'v1',
          x: 0,
          z: 0,
          heading: 0,
          speed: 6,
          acceleration: 0,
          braking: 0,
          totalDistance: 0,
          targetSpeed: 6,
          turnType: null,
          laneChange: null,
          detail: DETAIL_LEVELS.FULL,
        },
      ],
    ])
    const curr = new Map<string, VehicleRenderState>([
      [
        'v1',
        {
          ...prev.get('v1')!,
          x: 10,
          z: 0,
          heading: Math.PI / 2,
          speed: 8,
          totalDistance: 2,
          turnType: 'left',
        },
      ],
    ])
    const mid = interpolateVehicles(prev, curr, 0.5)[0]
    expect(mid.x).toBeCloseTo(5)
    expect(mid.z).toBeCloseTo(0)
    expect(mid.heading).toBeCloseTo(Math.PI / 4)
    expect(mid.speed).toBeCloseTo(7)
    expect(mid.totalDistance).toBeCloseTo(1)
    // Discrete fields come from the current tick.
    expect(mid.turnType).toBe('left')
  })

  it('renders freshly spawned vehicles directly without a previous snapshot', () => {
    const prev = new Map<string, VehicleRenderState>()
    const curr = new Map<string, VehicleRenderState>([
      [
        'v9',
        {
          id: 'v9',
          x: 3,
          z: 4,
          heading: 1,
          speed: 5,
          acceleration: 0,
          braking: 0,
          totalDistance: 0,
          targetSpeed: 5,
          turnType: null,
          laneChange: null,
          detail: DETAIL_LEVELS.FULL,
        },
      ],
    ])
    expect(interpolateVehicles(prev, curr, 0.5)[0].x).toBe(3)
  })

  it('interpolates angles along the shortest arc (wrap-around)', () => {
    // Just below π wrapping to just above -π should lerp back through π, not
    // all the way around the long way.
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 6)
    expect(lerpAngle(0, Math.PI, 0.5)).toBeCloseTo(Math.PI / 2)
  })

  it('blends pedestrian state including phase wrap-around', () => {
    const prev = new Map<number, PedRenderState>([
      [
        0,
        {
          index: 0,
          x: 0,
          z: 0,
          yaw: 0,
          phase: 0,
          state: 'WALKING',
          speed: 1,
          baseSpeed: 1,
          detail: DETAIL_LEVELS.FULL,
        },
      ],
    ])
    const curr = new Map<number, PedRenderState>([
      [
        0,
        {
          ...prev.get(0)!,
          x: 1,
          z: 1,
          yaw: Math.PI,
          phase: Math.PI * 2, // wraps to 0 via shortest arc
          speed: 0.5,
          state: 'CROSSING',
        },
      ],
    ])
    const mid = interpolatePedestrians(prev, curr, 0.25)[0]
    expect(mid.x).toBeCloseTo(0.25)
    expect(mid.z).toBeCloseTo(0.25)
    expect(mid.yaw).toBeCloseTo(Math.PI / 4)
    expect(mid.phase).toBeCloseTo(0)
    expect(mid.speed).toBeCloseTo(0.875)
    expect(mid.state).toBe('CROSSING')
  })
})

describe('simulation runtime — event drain', () => {
  it('buffers lifecycle events and drains them exactly once', () => {
    const rt = makeRuntime()
    expect(rt.drainEvents()).toEqual([])

    // Short hop so the vehicle arrives (and is later removed) quickly.
    const v = rt.vehicles.spawnAt(nodeKey(-20, -20), nodeKey(-20, 0), { speed: 9 })
    expect(v).toBeTruthy()

    let arrived = false
    let removed = false
    for (let i = 0; i < 2400 && !removed; i++) {
      rt.advance(SIM_TICK)
      for (const ev of rt.drainEvents()) {
        if (ev.kind === 'vehicle-arrived' && ev.vehicleId === v!.id) arrived = true
        if (ev.kind === 'vehicle-removed' && ev.vehicleId === v!.id) removed = true
      }
    }
    expect(arrived).toBe(true)
    expect(removed).toBe(true)
    expect(rt.vehicles.getVehicle(v!.id)).toBeUndefined()
    // Drain is empty after the frame that consumed everything.
    expect(rt.drainEvents()).toEqual([])
  })
})

describe('simulation runtime — pedestrian traffic sensor', () => {
  it('uses the vehicle engine as the source of truth for crosswalks', () => {
    const rt = makeRuntime({ pedestrianCount: 24 })
    spawnFleet(rt, 60)

    // With a busy fleet, pedestrians queue at crosswalks.
    let sawWaiting = false
    for (let i = 0; i < 90 * SIM_TICK_RATE; i++) {
      rt.advance(SIM_TICK)
      for (const p of rt.getPedestrians()) {
        if (p.state === 'WAITING') sawWaiting = true
      }
    }
    expect(sawWaiting).toBe(true)

    // Clear the roads: the same engine-backed sensor now reports everything
    // clear, so queued pedestrians start crossing.
    rt.vehicles.reset()
    let sawCrossing = false
    for (let i = 0; i < 40 * SIM_TICK_RATE; i++) {
      rt.advance(SIM_TICK)
      if (rt.getPedestrians().some((p) => p.state === 'CROSSING')) {
        sawCrossing = true
        break
      }
    }
    expect(sawCrossing).toBe(true)
  })

  it('freezes suspended vehicles so pedestrians react to real moving cars only', () => {
    const rt = makeRuntime()
    spawnFleet(rt, 20)
    // Suspend every vehicle: from the sensor's point of view the roads empty
    // out (suspended cars are parked, not approaching crosswalks).
    for (const v of rt.vehicles.getActiveVehicles()) rt.vehicles.suspend(v.id)

    let sawCrossing = false
    for (let i = 0; i < 60 * SIM_TICK_RATE; i++) {
      rt.advance(SIM_TICK)
      if (rt.getPedestrians().some((p) => p.state === 'CROSSING')) {
        sawCrossing = true
        break
      }
    }
    expect(sawCrossing).toBe(true)
  })
})

describe('simulation runtime — reset', () => {
  it('resets both engines and all interpolation buffers', () => {
    const rt = makeRuntime()
    spawnFleet(rt, 20)
    for (let i = 0; i < 120; i++) rt.advance(SIM_TICK)
    expect(rt.vehicles.getActiveVehicles().length).toBeGreaterThan(0)
    expect(rt.getPedestrians().length).toBeGreaterThan(0)

    rt.reset()
    expect(rt.simTime).toBe(0)
    expect(rt.getAlpha()).toBe(0)
    expect(rt.vehicles.getActiveVehicles()).toHaveLength(0)
    expect(rt.getPedestrians().every((p) => p.state === 'IDLE')).toBe(true)
    expect(rt.drainEvents()).toEqual([])
  })
})

describe('simulation runtime — distance detail levels', () => {
  it('assigns detail bands by distance from the view focus', () => {
    const rt = makeRuntime({ vehicleSeed: 5, pedestrianSeed: 5 })
    spawnFleet(rt, 40)
    rt.setViewCenter(0, 0)
    for (let i = 0; i < 30; i++) rt.advance(SIM_TICK)
    const vc = rt.getViewCenter()
    expect(vc.x).toBe(0)
    const vs = rt.vehicles.getActiveVehicles()
    expect(vs.length).toBeGreaterThan(0)
    const near = vs.filter((v) => Math.hypot(v.x - vc.x, v.z - vc.z) < 25)
    const far = vs.filter((v) => Math.hypot(v.x - vc.x, v.z - vc.z) > 100)
    for (const v of near) expect(v.detail).toBe(DETAIL_LEVELS.FULL)
    for (const v of far) expect(v.detail).toBe(DETAIL_LEVELS.MINIMAL)
  })

  it('keeps everything at FULL detail without a view focus', () => {
    const rt = makeRuntime({ vehicleSeed: 5, pedestrianSeed: 5 })
    spawnFleet(rt, 40)
    for (let i = 0; i < 20; i++) rt.advance(SIM_TICK)
    for (const v of rt.vehicles.getActiveVehicles()) expect(v.detail).toBe(DETAIL_LEVELS.FULL)
    for (const p of rt.pedestrians.getVisuals()) expect(p.detail).toBe(DETAIL_LEVELS.FULL)
  })

  it('steps a large pedestrian crowd through the full runtime', () => {
    const rt = makeRuntime({ vehicleSeed: 8, pedestrianSeed: 8, pedestrianCount: 150 })
    rt.setViewCenter(0, 0)
    for (let i = 0; i < 200; i++) rt.advance(SIM_TICK)
    const peds = rt.getPedestrians()
    expect(peds.length).toBe(150)
    for (const p of peds) expect(Number.isFinite(p.x)).toBe(true)
    const details = new Set(peds.map((p) => p.detail))
    expect(details.size).toBeGreaterThan(1) // several detail bands active
  })
})
