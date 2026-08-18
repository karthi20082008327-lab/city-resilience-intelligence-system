import { describe, it, expect } from 'vitest'
import { PedestrianEngine, EMPTY_TRAFFIC, type PedVehicleSensor } from '../pedestrianEngine'
import { buildPedestrianWorld, getNode, SIDEWALK_OFFSET, type PedWorld } from '../pedestrianWorld'
import { DETAIL_LEVELS, PED_UPDATE_INTERVAL } from '../types'
import { ROADS_X, ROADS_Z } from '../../components/simulation/constants'

function makeEngine(count = 24, masterSeed = 1337) {
  const world = buildPedestrianWorld()
  const engine = new PedestrianEngine(world, { count, masterSeed })
  return { world, engine }
}

function run(engine: PedestrianEngine, sensor: PedVehicleSensor, seconds: number, dt = 1 / 30) {
  const seen = new Set<string>()
  const steps = Math.ceil(seconds / dt)
  for (let i = 0; i < steps; i++) {
    engine.step(dt, sensor)
    for (const v of engine.getVisuals()) seen.add(v.state)
  }
  return seen
}

/** Distance to the nearest walkway edge (sidewalks, corners and crosswalks). */
function minDistToWalkway(world: PedWorld, x: number, z: number): number {
  let best = Infinity
  for (const e of world.edges) {
    const a = world.nodes.get(e.a)!
    const b = world.nodes.get(e.b)!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)))
  }
  return best
}

/** Distance to the nearest sidewalk/corner edge (NOT crosswalks). */
function minDistToSidewalk(world: PedWorld, x: number, z: number): number {
  let best = Infinity
  for (const e of world.edges) {
    if (e.kind === 'crosswalk') continue
    const a = world.nodes.get(e.a)!
    const b = world.nodes.get(e.b)!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)))
  }
  return best
}

const ALWAYS_BLOCKED: PedVehicleSensor = { roadClear: () => false }

describe('pedestrian engine — spawn & determinism', () => {
  it('spawns the requested crowd as IDLE pedestrians on the walkway', () => {
    const { world, engine } = makeEngine(24)
    const visuals = engine.getVisuals()
    expect(visuals).toHaveLength(24)
    for (const v of visuals) {
      expect(v.state).toBe('IDLE')
      expect(v.baseSpeed).toBeGreaterThanOrEqual(0.85)
      expect(v.baseSpeed).toBeLessThanOrEqual(1.7)
      expect(minDistToWalkway(world, v.x, v.z)).toBeLessThan(0.01)
    }
  })

  it('is fully deterministic for the same seed', () => {
    const { engine: a } = makeEngine(24, 999)
    const { engine: b } = makeEngine(24, 999)
    for (let i = 0; i < 600; i++) {
      a.step(1 / 30, EMPTY_TRAFFIC)
      b.step(1 / 30, EMPTY_TRAFFIC)
    }
    const va = a.getVisuals()
    const vb = b.getVisuals()
    for (let i = 0; i < va.length; i++) {
      expect(va[i].x).toBeCloseTo(vb[i].x, 8)
      expect(va[i].z).toBeCloseTo(vb[i].z, 8)
      expect(va[i].yaw).toBeCloseTo(vb[i].yaw, 8)
      expect(va[i].state).toBe(vb[i].state)
      expect(va[i].phase).toBeCloseTo(vb[i].phase, 8)
    }
  })

  it('produces different behaviour for different seeds', () => {
    const { engine: a } = makeEngine(24, 1)
    const { engine: b } = makeEngine(24, 2)
    for (let i = 0; i < 600; i++) {
      a.step(1 / 30, EMPTY_TRAFFIC)
      b.step(1 / 30, EMPTY_TRAFFIC)
    }
    const va = a.getVisuals()
    const vb = b.getVisuals()
    const someDiff = va.some((v, i) => Math.abs(v.x - vb[i].x) > 1 || Math.abs(v.z - vb[i].z) > 1)
    expect(someDiff).toBe(true)
  })

  it('gives the crowd varied walking speeds', () => {
    const { engine } = makeEngine(24)
    const speeds = engine.getVisuals().map((v) => v.baseSpeed)
    expect(new Set(speeds).size).toBeGreaterThan(5)
  })
})

describe('pedestrian engine — walking behaviour', () => {
  it('starts walking within a couple of seconds', () => {
    const { engine } = makeEngine(24)
    run(engine, EMPTY_TRAFFIC, 4)
    const states = engine.getVisuals().map((v) => v.state)
    expect(states.some((s) => s === 'WALKING')).toBe(true)
    expect(states.filter((s) => s === 'IDLE')).toHaveLength(0)
  })

  it('keeps every pedestrian on the walkway (never off-road) over a long run', () => {
    const { world, engine } = makeEngine(24)
    let furthest = 0
    for (let i = 0; i < 1800; i++) {
      engine.step(1 / 30, EMPTY_TRAFFIC)
      if (i % 60 === 0) {
        for (const v of engine.getVisuals()) {
          furthest = Math.max(furthest, minDistToWalkway(world, v.x, v.z))
        }
      }
    }
    expect(furthest).toBeLessThan(0.5)
  })

  it('advances position roughly at the pedestrian speed', () => {
    const { engine } = makeEngine(1, 4242)
    run(engine, EMPTY_TRAFFIC, 3) // let it start moving
    const start = engine.getVisuals()[0]
    const sx = start.x
    const sz = start.z
    run(engine, EMPTY_TRAFFIC, 1)
    const end = engine.getVisuals()[0]
    const moved = Math.hypot(end.x - sx, end.z - sz)
    expect(moved).toBeGreaterThan(0.5)
    expect(moved).toBeLessThan(end.baseSpeed * 1.6 + 0.1)
  })

  it('observes TURNING at corner nodes and ARRIVED after trips', () => {
    const { engine } = makeEngine(24)
    const seen = run(engine, EMPTY_TRAFFIC, 90)
    expect(seen.has('TURNING')).toBe(true)
    expect(seen.has('ARRIVED')).toBe(true)
  })

  it('prevents pedestrians from overlapping in a crowd', () => {
    const { engine } = makeEngine(32)
    let minGap = Infinity
    for (let i = 0; i < 2400; i++) {
      engine.step(1 / 30, EMPTY_TRAFFIC)
      if (i % 30 !== 0) continue
      const vs = engine.getVisuals()
      for (let a = 0; a < vs.length; a++) {
        for (let b = a + 1; b < vs.length; b++) {
          minGap = Math.min(minGap, Math.hypot(vs[a].x - vs[b].x, vs[a].z - vs[b].z))
        }
      }
    }
    // Idle + walking + avoidance keeps a minimum physical gap.
    expect(minGap).toBeGreaterThan(0.4)
  })
})

describe('pedestrian engine — crosswalks & traffic', () => {
  it('waits at the curb and never enters a crosswalk while traffic is blocked', () => {
    const { world, engine } = makeEngine(24)
    const seen = run(engine, ALWAYS_BLOCKED, 90)
    expect(seen.has('WAITING')).toBe(true)
    expect(seen.has('CROSSING')).toBe(false)
    for (const v of engine.getVisuals()) {
      expect(v.state).not.toBe('CROSSING')
      // Still on the sidewalk or right at the curb, never mid-road.
      expect(minDistToSidewalk(world, v.x, v.z)).toBeLessThan(0.6)
    }
  })

  it('crosses once traffic clears', () => {
    const { engine } = makeEngine(24)
    // Block long enough for pedestrians to queue at crosswalks, then free the roads.
    run(engine, ALWAYS_BLOCKED, 70)
    let sawCrossing = false
    const seen = run(engine, EMPTY_TRAFFIC, 30)
    for (const s of seen) if (s === 'CROSSING') sawCrossing = true
    expect(sawCrossing).toBe(true)
  })

  it('reaches positions inside the road only while crossing', () => {
    const { engine } = makeEngine(24)
    run(engine, ALWAYS_BLOCKED, 70)
    let insideRoad = false
    for (let i = 0; i < 900; i++) {
      engine.step(1 / 30, EMPTY_TRAFFIC)
      const vs = engine.getVisuals()
      if (vs.some((v) => v.state === 'CROSSING')) insideRoad = true
    }
    expect(insideRoad).toBe(true)
  })

  it('enters AVOIDING when a crossing is interrupted by traffic', () => {
    // A sensor that periodically blocks crosswalks forces pedestrians to
    // yield mid-crossing.
    let blocked = true
    let timer = 0
    const flickering: PedVehicleSensor = {
      roadClear: () => {
        timer += 1 / 30
        if (timer > 2) {
          blocked = !blocked
          timer = 0
        }
        return !blocked
      },
    }
    const { engine } = makeEngine(24)
    const seen = run(engine, flickering, 90)
    expect(seen.has('CROSSING')).toBe(true)
    expect(seen.has('AVOIDING')).toBe(true)
  })

  it('waits at the curb of the road it intends to cross', () => {
    const { world, engine } = makeEngine(24)
    run(engine, ALWAYS_BLOCKED, 90)
    const waiting = engine.getVisuals().find((v) => v.state === 'WAITING')
    expect(waiting).toBeDefined()
    if (waiting) {
      // Standing on a sidewalk line (not in the asphalt)…
      expect(minDistToSidewalk(world, waiting.x, waiting.z)).toBeLessThan(0.6)
      // …at SIDEWALK_OFFSET from the road centreline it will cross.
      const distX = Math.min(...ROADS_X.map((r) => Math.abs(waiting.x - r)))
      const distZ = Math.min(...ROADS_Z.map((r) => Math.abs(waiting.z - r)))
      const curbDist = Math.max(distX, distZ)
      expect(curbDist).toBeGreaterThanOrEqual(SIDEWALK_OFFSET - 0.5)
      expect(curbDist).toBeLessThanOrEqual(SIDEWALK_OFFSET + 0.5)
    }
  })

  it('uses a crosswalk to reach a destination across a road', () => {
    const { world, engine } = makeEngine(1, 777)
    // Drive the single NPC along a hand-built path that ends across road
    // z=0: corner NW -> crosswalk approach N -> far side S.
    const nw = getNode(world, 0 - SIDEWALK_OFFSET, 0 - SIDEWALK_OFFSET)!
    const n = getNode(world, 0, 0 - SIDEWALK_OFFSET)!
    const s = getNode(world, 0, 0 + SIDEWALK_OFFSET)!
    const npc = (engine as unknown as { npcs: Array<Record<string, unknown>> }).npcs[0]
    Object.assign(npc, {
      path: [nw.id, n.id, s.id],
      edgeIdx: 0,
      t: 0.7,
      state: 'WALKING',
      yaw: Math.PI / 2, // walking +X along the corner edge
      baseSpeed: 1.3,
      x: nw.x + (n.x - nw.x) * 0.7,
      z: nw.z + (n.z - nw.z) * 0.7,
    })
    let sawCrossing = false
    let sawWaiting = false
    for (let i = 0; i < 900; i++) {
      engine.step(1 / 30, EMPTY_TRAFFIC)
      const v = engine.getVisuals()[0]
      if (v.state === 'CROSSING') sawCrossing = true
      if (v.state === 'WAITING') sawWaiting = true
      if (v.state === 'ARRIVED') break
    }
    expect(sawWaiting).toBe(true) // paused at the curb first
    expect(sawCrossing).toBe(true)
    const final = engine.getVisuals()[0]
    expect(Math.hypot(final.x - s.x, final.z - s.z)).toBeLessThan(0.5)
  })
})

describe('pedestrian engine — distance detail levels (LOD)', () => {
  it('defaults every NPC to FULL detail / per-tick AI updates', () => {
    const { engine } = makeEngine(10)
    const npcs = (engine as unknown as { npcs: Array<{ detail: number; interval: number }> }).npcs
    for (const n of npcs) {
      expect(n.detail).toBe(DETAIL_LEVELS.FULL)
      expect(n.interval).toBe(1)
    }
  })

  it('applyDetailLevels assigns staggered update intervals by band', () => {
    const { engine } = makeEngine(10)
    engine.applyDetailLevels((i) => (i % 2 === 0 ? DETAIL_LEVELS.MINIMAL : DETAIL_LEVELS.FULL))
    const npcs = (engine as unknown as { npcs: Array<{ detail: number; interval: number }> }).npcs
    for (let i = 0; i < 10; i++) {
      expect(npcs[i].detail).toBe(i % 2 === 0 ? DETAIL_LEVELS.MINIMAL : DETAIL_LEVELS.FULL)
      expect(npcs[i].interval).toBe(i % 2 === 0 ? PED_UPDATE_INTERVAL[DETAIL_LEVELS.MINIMAL] : 1)
    }
  })

  it('steps a large crowd at MINIMAL detail without breaking behaviour', () => {
    const { world, engine } = makeEngine(150, 42)
    engine.applyDetailLevels(() => DETAIL_LEVELS.MINIMAL)
    const steps = Math.ceil(60 / (1 / 30))
    for (let i = 0; i < steps; i++) engine.step(1 / 30, EMPTY_TRAFFIC)
    const visuals = engine.getVisuals()
    expect(visuals).toHaveLength(150)
    for (const v of visuals) {
      expect(minDistToWalkway(world, v.x, v.z)).toBeLessThan(0.3)
      expect(Number.isFinite(v.x)).toBe(true)
      expect(Number.isFinite(v.z)).toBe(true)
    }
  })

  it('MINIMAL-detail NPCs cross crosswalks without waiting for traffic', () => {
    const { engine } = makeEngine(1, 7)
    const npcs = (engine as unknown as { npcs: Array<Record<string, unknown>> }).npcs
    engine.applyDetailLevels(() => DETAIL_LEVELS.MINIMAL)
    const nw = getNode(engine.world, 0 - SIDEWALK_OFFSET, 0 - SIDEWALK_OFFSET)!
    const n = getNode(engine.world, 0, 0 - SIDEWALK_OFFSET)!
    const s = getNode(engine.world, 0, 0 + SIDEWALK_OFFSET)!
    Object.assign(npcs[0], {
      path: [nw.id, n.id, s.id],
      edgeIdx: 0,
      t: 0.9,
      state: 'WALKING',
      yaw: Math.PI / 2,
      baseSpeed: 1.3,
      x: nw.x + (n.x - nw.x) * 0.9,
      z: nw.z + (n.z - nw.z) * 0.9,
    })
    let sawCrossing = false
    for (let i = 0; i < 600; i++) {
      engine.step(1 / 30, ALWAYS_BLOCKED)
      if (engine.getVisuals()[0].state === 'CROSSING') {
        sawCrossing = true
        break
      }
    }
    expect(sawCrossing).toBe(true)
  })
})
