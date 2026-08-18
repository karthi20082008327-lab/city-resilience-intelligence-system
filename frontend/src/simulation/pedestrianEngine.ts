import { type PedWorld, findPath, edgeBetween, type PedEdge, allNodeIds } from './pedestrianWorld'
import { DETAIL_LEVELS, PED_UPDATE_INTERVAL, type SimDetailLevel } from './types'

/**
 * Pedestrian behaviour engine.
 *
 * Pure and deterministic: every NPC is driven by a seeded PRNG (no
 * Math.random) and by the walkway graph, so runs with the same seed produce
 * identical behaviour — which keeps debugging tractable while still giving
 * each NPC varied speeds, destinations and paths.
 *
 * State machine:
 *   IDLE     — standing still before starting a new walk (or paused)
 *   WALKING  — moving along a sidewalk/corner edge
 *   WAITING  — at the curb of a crosswalk, looking for a gap in traffic
 *   CROSSING — inside the crosswalk, crossing the road
 *   AVOIDING — stopped because of an approaching vehicle or a crowd ahead
 *   TURNING  — stopped at a node, rotating to face the next edge
 *   ARRIVED  — reached the destination; resting before the next trip
 */

export type PedStateName = 'IDLE' | 'WALKING' | 'WAITING' | 'CROSSING' | 'AVOIDING' | 'TURNING' | 'ARRIVED'

/** Traffic sensor provided by the visual layer (vehicles near a crosswalk). */
export interface PedVehicleSensor {
  /** True when the segment (x0,z0)->(x1,z1) is safe to enter / keep walking. */
  roadClear: (x0: number, z0: number, x1: number, z1: number) => boolean
}

/** No vehicles anywhere — used for pure-walking tests. */
export const EMPTY_TRAFFIC: PedVehicleSensor = { roadClear: () => true }

/** Default crowd size used by the visual layer. */
export const PEDESTRIAN_COUNT = 24

/** Per-NPC read-only view for the renderer. */
export interface PedVisual {
  index: number
  state: PedStateName
  x: number
  z: number
  yaw: number
  /** walk cycle phase in radians */
  phase: number
  /** effective speed this frame (0 when stopped) */
  speed: number
  /** preferred walking speed */
  baseSpeed: number
  /** Simulation detail level (renderer picks LOD from this). */
  detail: SimDetailLevel
}

export interface PedEngineOpts {
  count: number
  masterSeed?: number
}

/** Walking cadence: phase advances one full stride-cycle per stride length. */
const STEP_LENGTH = 0.7
/** Lateral offset to the right of the walking direction on sidewalks. */
const SIDEWALK_BIAS = 0.22
/** Distance at which a pedestrian ahead starts to slow us down. */
const FOLLOW_DIST = 1.4
/** Angle change (rad) above which we stop and turn at a node. */
const TURN_THRESHOLD = 0.35
/** Personal space: pedestrians are pushed apart when closer than this. */
const SEPARATION_DIST = 0.55
/** Max per-frame separation nudge (prevents explosions in a dense crowd). */
const SEPARATION_PUSH = 0.25
/** Probability a new trip is deliberately routed across a crosswalk. */
const CROSSWALK_TRIP_CHANCE = 0.4

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function yawFromDir(dx: number, dz: number): number {
  return Math.atan2(dx, dz)
}

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

/** Keep right: perpendicular pointing to the right of direction (dx,dz). */
function rightOf(dx: number, dz: number): { x: number; z: number } {
  const len = Math.hypot(dx, dz) || 1
  return { x: dz / len, z: -dx / len }
}

interface SimNPC {
  index: number
  rng: () => number
  baseSpeed: number
  x: number
  z: number
  yaw: number
  targetYaw: number
  state: PedStateName
  path: string[]
  /** index of the current edge within path (path[i] -> path[i+1]) */
  edgeIdx: number
  /** 0..1 along the current edge */
  t: number
  phase: number
  idleTime: number
  turnTime: number
  waitTime: number
  destNode: string
  /** edge index to switch to once the current turn finishes (-1 = none) */
  pendingEdge: number
  /** actual speed used in the last step (for the walk cycle intensity) */
  lastSpeed: number
  /** Simulation detail level (see SimDetailLevel); drives AI tick frequency. */
  detail: SimDetailLevel
  /** Ticks between full AI updates (1 = every tick). */
  interval: number
}

export class PedestrianEngine {
  readonly world: PedWorld
  readonly pedestrianCount: number
  readonly masterSeed: number
  private npcs: SimNPC[]
  private nodes: string[]
  /** Global tick counter (used to stagger per-NPC AI updates deterministically). */
  private tickCount = 0
  /** Spatial hash of NPCs, rebuilt once per step. Key: "cx,cz" -> NPC indices. */
  private grid = new Map<string, number[]>()

  constructor(world: PedWorld, opts: PedEngineOpts) {
    this.world = world
    this.pedestrianCount = opts.count
    this.nodes = allNodeIds(world)
    const seed = (this.masterSeed = opts.masterSeed ?? 1337)
    this.npcs = this.spawnCrowd(opts.count, seed)
  }

  /** Set the simulation detail level for one NPC (staggered AI frequency). */
  setDetail(index: number, detail: SimDetailLevel): void {
    const npc = this.npcs[index]
    if (npc.detail !== detail) {
      npc.detail = detail
      npc.interval = PED_UPDATE_INTERVAL[detail]
    }
  }

  /** Assign every NPC's detail level from a view-dependent callback. */
  applyDetailLevels(detailAt: (index: number, x: number, z: number) => SimDetailLevel): void {
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i]
      this.setDetail(i, detailAt(i, n.x, n.z))
    }
  }

  /** NPCs that take part in crowd separation / following (near ones only). */
  private crowded(npc: SimNPC): boolean {
    return npc.detail >= DETAIL_LEVELS.MEDIUM
  }

  /** Deterministic crowd spawn shared by the constructor and reset(). */
  private spawnCrowd(count: number, seed: number): SimNPC[] {
    const npcs: SimNPC[] = []
    for (let i = 0; i < count; i++) {
      const rng = mulberry32((seed * 0x9e3779b1 + i * 0x85ebca6b) >>> 0)
      const baseSpeed = 0.85 + rng() * 0.85 // 0.85..1.7 m/s
      const node = this.nodes[Math.floor(rng() * this.nodes.length)]
      const npc: SimNPC = {
        index: i,
        rng,
        baseSpeed,
        x: this.node(node).x,
        z: this.node(node).z,
        yaw: rng() * Math.PI * 2,
        targetYaw: rng() * Math.PI * 2,
        state: 'IDLE',
        path: [node],
        edgeIdx: 0,
        t: 0,
        phase: rng() * Math.PI * 2,
        idleTime: 0.4 + rng() * 1.6,
        turnTime: 0,
        waitTime: 0,
        destNode: node,
        pendingEdge: -1,
        lastSpeed: 0,
        detail: DETAIL_LEVELS.FULL,
        interval: PED_UPDATE_INTERVAL[DETAIL_LEVELS.FULL],
      }
      npcs.push(npc)
    }
    return npcs
  }

  /** Restart every pedestrian at a fresh deterministic spawn. */
  reset(): void {
    this.npcs = this.spawnCrowd(this.pedestrianCount, this.masterSeed)
  }

  private node(id: string) {
    return this.world.nodes.get(id)!
  }

  private edge(a: string, b: string): PedEdge | undefined {
    return edgeBetween(this.world, a, b)
  }

  step(dt: number, sensor: PedVehicleSensor): void {
    dt = Math.min(Math.max(dt, 0), 0.1)
    this.tickCount++
    // Spatial hash of the (pre-update) positions, used by followFactor and
    // separation so crowd behaviour stays O(n) instead of O(n²).
    this.buildGrid()
    // Snapshot positions so pedestrian avoidance is symmetric and order-independent.
    const positions = this.npcs.map((n) => ({ x: n.x, z: n.z }))
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i]
      npc.lastSpeed = 0
      // Staggered AI: only run the (expensive) state machine every `interval`
      // ticks; on the in-between ticks just advance movement cheaply.
      const due = (this.tickCount + i) % npc.interval === 0
      if (!due) {
        this.cheapTick(npc, dt)
        continue
      }
      const ff = this.crowded(npc) ? this.followFactor(npc, positions) : 1
      switch (npc.state) {
        case 'IDLE':
          npc.idleTime -= dt
          if (npc.idleTime <= 0) this.startNewTrip(npc)
          break
        case 'ARRIVED':
          npc.idleTime -= dt
          if (npc.idleTime <= 0) this.startNewTrip(npc)
          break
        case 'TURNING':
          this.updateTurning(npc, dt)
          break
        case 'WAITING':
          this.updateWaiting(npc, dt, sensor)
          break
        case 'AVOIDING':
          this.updateAvoiding(npc, sensor, ff)
          break
        case 'CROSSING':
          this.updateCrossing(npc, dt, sensor, ff)
          break
        case 'WALKING':
          this.updateWalking(npc, dt, sensor, ff)
          break
      }
    }
    this.separate()
  }

  /** Movement-only tick for NPCs not due for a full AI update. */
  private cheapTick(npc: SimNPC, dt: number): void {
    switch (npc.state) {
      case 'IDLE':
      case 'ARRIVED':
        npc.idleTime -= dt
        break
      case 'TURNING':
        this.updateTurning(npc, dt)
        break
      case 'WAITING':
        npc.waitTime -= dt
        break
      case 'AVOIDING':
        // Stay put; the next due tick resolves the avoidance.
        break
      case 'CROSSING':
      case 'WALKING':
        this.advanceSimple(npc, dt)
        break
    }
  }

  /** Build the spatial hash from current (pre-step) positions. */
  private buildGrid(): void {
    this.grid.clear()
    const cell = FOLLOW_DIST
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i]
      const cx = Math.floor(n.x / cell)
      const cz = Math.floor(n.z / cell)
      const key = `${cx},${cz}`
      let bucket = this.grid.get(key)
      if (!bucket) {
        bucket = []
        this.grid.set(key, bucket)
      }
      bucket.push(i)
    }
  }

  /** Indices of all NPCs that could be within `radius` of (x, z). */
  private neighbors(x: number, z: number, radius: number): number[] {
    const cell = FOLLOW_DIST
    const cx = Math.floor(x / cell)
    const cz = Math.floor(z / cell)
    const span = Math.max(1, Math.ceil(radius / cell))
    const out: number[] = []
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        const bucket = this.grid.get(`${cx + dx},${cz + dz}`)
        if (bucket) {
          for (let k = 0; k < bucket.length; k++) out.push(bucket[k])
        }
      }
    }
    return out
  }

  /**
   * Deterministic spatial separation: when two pedestrians end up inside a
   * comfort radius (crosswalk curbs, corner nodes, idle spots), push them
   * apart along the line joining them so nobody stands on top of anyone else.
   * Several passes resolve clusters of three or more at the same spot.
   * Neighbours come from the spatial hash (O(n) instead of O(n²)), and only
   * MEDIUM/FULL detail NPCs are separated (far ones are handled by the
   * renderer's distant LOD).
   */
  private separate(): void {
    const active: SimNPC[] = []
    for (const n of this.npcs) if (this.crowded(n)) active.push(n)
    if (active.length < 2) return
    const cell = FOLLOW_DIST
    for (let pass = 0; pass < 4; pass++) {
      let moved = false
      for (let i = 0; i < active.length; i++) {
        const a = active[i]
        const cx = Math.floor(a.x / cell)
        const cz = Math.floor(a.z / cell)
        for (let ox = -1; ox <= 1; ox++) {
          for (let oz = -1; oz <= 1; oz++) {
            const bucket = this.grid.get(`${cx + ox},${cz + oz}`)
            if (!bucket) continue
            for (const j of bucket) {
              const b = this.npcs[j]
              if (b === a || !this.crowded(b)) continue
              // Only consider each pair once: process b only when b.index > a.index.
              if (b.index < a.index) continue
              let dx = a.x - b.x
              let dz = a.z - b.z
              let d = Math.hypot(dx, dz)
              if (d >= SEPARATION_DIST) continue
              if (d < 1e-4) {
                // Exactly coincident (e.g. both resting on the same destination
                // node): separate along a deterministic axis.
                dx = ((a.index * 2654435761) % 2 === 0 ? 1 : 0.35) - 0.5
                dz = 1 - Math.abs(dx)
                d = 1
              }
              const push = Math.min((SEPARATION_DIST - d) / 2, SEPARATION_PUSH)
              const ux = dx / d
              const uz = dz / d
              a.x += ux * push
              a.z += uz * push
              b.x -= ux * push
              b.z -= uz * push
              moved = true
            }
          }
        }
      }
      if (!moved) break
    }
  }

  getVisuals(): PedVisual[] {
    return this.npcs.map((n) => ({
      index: n.index,
      state: n.state,
      x: n.x,
      z: n.z,
      yaw: n.yaw,
      phase: n.phase,
      speed: this.currentSpeed(n),
      baseSpeed: n.baseSpeed,
      detail: n.detail,
    }))
  }

  /** How fast the NPC is actually moving this frame (for the walk cycle). */
  private currentSpeed(npc: SimNPC): number {
    switch (npc.state) {
      case 'WALKING':
      case 'CROSSING':
        return npc.lastSpeed
      case 'TURNING':
      case 'WAITING':
      case 'AVOIDING':
      case 'IDLE':
      case 'ARRIVED':
        return 0
    }
  }

  /* ------------------------------------------------------------- behaviour */

  private startNewTrip(npc: SimNPC): void {
    // Current position: the last node of the trip just finished (or the
    // spawn node for the very first trip).
    const from = npc.path[npc.path.length - 1]
    const to = this.pickDestination(npc, from)
    const path = findPath(this.world, from, to)
    if (!path || path.length < 2) {
      npc.idleTime = 0.5 + npc.rng() * 1
      return
    }
    npc.destNode = to
    npc.path = path
    npc.edgeIdx = 0
    npc.t = 0
    const edge = this.edge(path[0], path[1])!
    const dir = this.edgeDir(edge)
    npc.targetYaw = yawFromDir(dir.x, dir.z)
    if (angleDiff(npc.yaw, npc.targetYaw) > TURN_THRESHOLD) {
      // After the turn completes, enterEdge() routes crosswalk-first trips
      // through the wait/cross state machine.
      this.beginTurn(npc, npc.targetYaw)
    } else {
      npc.yaw = npc.targetYaw
      this.enterEdge(npc)
    }
  }

  /** Destination pick: biased so many trips involve crossing a street. */
  private pickDestination(npc: SimNPC, from: string): string {
    const n = this.nodes.length
    for (let attempt = 0; attempt < 8; attempt++) {
      if (npc.rng() < CROSSWALK_TRIP_CHANCE) {
        // Destination on the far side of a random crosswalk, verified to
        // actually require crossing that road (a crosswalk approach node can
        // otherwise be reached from the same side without crossing).
        const ends = this.crosswalkEnds()
        for (let tries = 0; tries < 6; tries++) {
          const far = ends[Math.floor(npc.rng() * ends.length)]
          if (!far || far === from) continue
          const path = findPath(this.world, from, far)
          if (
            path &&
            path.some((id, k) => k > 0 && edgeBetween(this.world, path[k - 1], id)?.kind === 'crosswalk')
          ) {
            return far
          }
        }
        continue
      }
      const to = this.nodes[Math.floor(npc.rng() * n)]
      if (to !== from) return to
    }
    const fallback = this.nodes[Math.floor(npc.rng() * n)]
    return fallback === from ? this.nodes[(this.nodes.indexOf(from) + 1) % n] : fallback
  }

  private crosswalkEnds(): string[] {
    const ends: string[] = []
    for (const id of this.nodes) {
      const node = this.node(id)
      if (node.kind !== 'sidewalk') continue
      for (const ei of this.world.adj.get(id) ?? []) {
        const e = this.world.edges[ei]
        if (e.kind === 'crosswalk') {
          ends.push(e.a === id ? e.b : e.a)
          break
        }
      }
    }
    return ends
  }

  private beginTurn(npc: SimNPC, targetYaw: number, advanceTo?: number): void {
    npc.state = 'TURNING'
    npc.targetYaw = targetYaw
    npc.pendingEdge = advanceTo ?? -1
    npc.turnTime = Math.min(0.7, 0.2 + angleDiff(npc.yaw, targetYaw) * 0.15)
  }

  private updateTurning(npc: SimNPC, dt: number): void {
    npc.turnTime -= dt
    // Ease the yaw toward the target (deterministic, smooth).
    const d = angleDiff(npc.yaw, npc.targetYaw)
    const step = Math.min(d, dt * 5)
    const sign = this.rotationSign(npc.yaw, npc.targetYaw)
    npc.yaw = (npc.yaw + sign * step + Math.PI * 2) % (Math.PI * 2)
    if (npc.turnTime <= 0 || angleDiff(npc.yaw, npc.targetYaw) < 0.02) {
      npc.yaw = npc.targetYaw
      if (npc.pendingEdge >= 0) {
        npc.edgeIdx = npc.pendingEdge
        npc.t = 0
        npc.pendingEdge = -1
      }
      this.enterEdge(npc)
    }
  }

  private rotationSign(a: number, b: number): number {
    let d = (b - a) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    return d >= 0 ? 1 : -1
  }

  private updateWaiting(npc: SimNPC, dt: number, sensor: PedVehicleSensor): void {
    npc.waitTime -= dt
    if (npc.detail < DETAIL_LEVELS.FAR) {
      // VERY FAR: cross without consulting traffic (minimal simulation).
      this.beginCrossing(npc)
      return
    }
    if (npc.waitTime <= 0 && this.crosswalkClear(npc, sensor)) {
      this.beginCrossing(npc)
    }
  }

  private updateAvoiding(npc: SimNPC, sensor: PedVehicleSensor, ff: number): void {
    // Stay put while a crowd is in the way or a vehicle is coming.
    if (ff < 0.5) return
    if (npc.detail >= DETAIL_LEVELS.FAR && !this.crosswalkClear(npc, sensor)) return
    if (this.currentEdge(npc)?.kind === 'crosswalk') {
      // Mid-crosswalk interruption: resume crossing immediately.
      npc.state = 'CROSSING'
    } else {
      this.enterEdge(npc)
    }
  }

  private updateCrossing(npc: SimNPC, dt: number, sensor: PedVehicleSensor, ff: number): void {
    if (npc.detail >= DETAIL_LEVELS.FAR) {
      if (!this.crosswalkClear(npc, sensor) || ff < 0.25) {
        npc.state = 'AVOIDING'
        return
      }
    }
    this.moveAlongEdge(npc, dt, sensor, ff)
  }

  private updateWalking(npc: SimNPC, dt: number, sensor: PedVehicleSensor, ff: number): void {
    if (ff < 0.25) {
      npc.state = 'AVOIDING'
      return
    }
    this.moveAlongEdge(npc, dt, sensor, ff)
  }

  private moveAlongEdge(npc: SimNPC, dt: number, sensor: PedVehicleSensor, ff: number): void {
    const edge = this.currentEdge(npc)!
    const nodeA = this.node(edge.a)
    const nodeB = this.node(edge.b)
    const speed = npc.baseSpeed * ff
    npc.lastSpeed = speed
    const ds = speed * dt
    const remaining = (1 - npc.t) * edge.len
    npc.phase += Math.min(ds, remaining) / STEP_LENGTH
    if (ds >= remaining) {
      npc.x = nodeB.x
      npc.z = nodeB.z
      npc.t = 1
      this.handleNodeReached(npc, sensor)
    } else {
      npc.t += ds / edge.len
      const tx = nodeA.x + (nodeB.x - nodeA.x) * npc.t
      const tz = nodeA.z + (nodeB.z - nodeA.z) * npc.t
      // Lateral offset: keep to the right on sidewalks, centre on crosswalks.
      const bias = edge.kind === 'crosswalk' ? 0 : SIDEWALK_BIAS
      const right = rightOf(nodeB.x - nodeA.x, nodeB.z - nodeA.z)
      npc.x = tx + right.x * bias
      npc.z = tz + right.z * bias
      npc.yaw = this.easeYaw(npc, yawFromDir(nodeB.x - nodeA.x, nodeB.z - nodeA.z), dt)
    }
  }

  /**
   * Cheap movement-only advance for non-AI ticks. Never consults the traffic
   * sensor and never runs the state machine: on reaching a node it continues
   * straight onto a plain sidewalk edge (no sensor needed) or pauses until the
   * next due AI tick handles crosswalk/turn logic.
   */
  private advanceSimple(npc: SimNPC, dt: number): void {
    const edge = this.currentEdge(npc)
    if (!edge) {
      if (npc.state !== 'ARRIVED') npc.state = 'ARRIVED'
      return
    }
    const nodeA = this.node(edge.a)
    const nodeB = this.node(edge.b)
    const speed = npc.baseSpeed
    npc.lastSpeed = speed
    const ds = speed * dt
    const remaining = (1 - npc.t) * edge.len
    npc.phase += Math.min(ds, remaining) / STEP_LENGTH
    if (ds >= remaining) {
      npc.x = nodeB.x
      npc.z = nodeB.z
      npc.t = 1
      const nextIdx = npc.edgeIdx + 1
      if (npc.state === 'CROSSING' || npc.state === 'WALKING') {
        if (nextIdx + 1 >= npc.path.length) {
          npc.state = 'ARRIVED'
          npc.idleTime = 4 + npc.rng() * 8
        } else {
          const nextEdge = this.edge(npc.path[nextIdx], npc.path[nextIdx + 1])!
          if (nextEdge.kind !== 'crosswalk') {
            // Straight through onto a sidewalk edge — safe without a sensor.
            npc.edgeIdx = nextIdx
            npc.t = 0
            const dir = this.edgeDir(nextEdge)
            npc.yaw = yawFromDir(dir.x, dir.z)
          }
          // Crosswalk edge: wait at the curb; the due tick resolves it.
        }
      }
    } else {
      npc.t += ds / edge.len
      const tx = nodeA.x + (nodeB.x - nodeA.x) * npc.t
      const tz = nodeA.z + (nodeB.z - nodeA.z) * npc.t
      const bias = edge.kind === 'crosswalk' ? 0 : SIDEWALK_BIAS
      const right = rightOf(nodeB.x - nodeA.x, nodeB.z - nodeA.z)
      npc.x = tx + right.x * bias
      npc.z = tz + right.z * bias
      npc.yaw = this.easeYaw(npc, yawFromDir(nodeB.x - nodeA.x, nodeB.z - nodeA.z), dt)
    }
  }

  private easeYaw(npc: SimNPC, target: number, dt: number): number {
    const d = angleDiff(npc.yaw, target)
    const step = Math.min(d, dt * 10)
    return npc.yaw + this.rotationSign(npc.yaw, target) * step
  }

  private currentEdge(npc: SimNPC): PedEdge | undefined {
    if (npc.edgeIdx + 1 >= npc.path.length) return undefined
    return this.edge(npc.path[npc.edgeIdx], npc.path[npc.edgeIdx + 1])
  }

  /** Handle the NPC reaching the end node of the current edge. */
  private handleNodeReached(npc: SimNPC, sensor: PedVehicleSensor): void {
    if (npc.edgeIdx + 1 >= npc.path.length - 1) {
      // Destination reached.
      npc.state = 'ARRIVED'
      npc.idleTime = 4 + npc.rng() * 8
      return
    }
    const nextIdx = npc.edgeIdx + 1
    const nextEdge = this.edge(npc.path[nextIdx], npc.path[nextIdx + 1])!
    const dir = this.edgeDir(nextEdge)
    const target = yawFromDir(dir.x, dir.z)
    if (nextEdge.kind === 'crosswalk') {
      if (npc.detail < DETAIL_LEVELS.FAR) {
        // VERY FAR: minimal simulation — face and cross without traffic logic.
        npc.yaw = target
        this.beginCrossing(npc)
        return
      }
      // Face the crosswalk; then wait for a gap in traffic before entering.
      if (angleDiff(npc.yaw, target) > TURN_THRESHOLD) {
        this.beginTurn(npc, target, nextIdx)
        return
      }
      npc.yaw = target
      if (this.crosswalkClear(npc, sensor)) {
        this.beginCrossing(npc)
      } else {
        npc.state = 'WAITING'
        npc.waitTime = 0.3 + npc.rng() * 0.5
      }
      return
    }
    // Ordinary sidewalk/corner edge.
    npc.edgeIdx = nextIdx
    npc.t = 0
    if (angleDiff(npc.yaw, target) > TURN_THRESHOLD) {
      this.beginTurn(npc, target, nextIdx)
    } else {
      npc.yaw = target
      npc.state = 'WALKING'
    }
  }

  private beginCrossing(npc: SimNPC): void {
    // If the NPC is still standing on the sidewalk edge (t=1 at the curb),
    // advance onto the crosswalk edge; if already on it, just start walking.
    const cur = this.currentEdge(npc)
    if (!cur || cur.kind !== 'crosswalk') {
      const nextIdx = npc.edgeIdx + 1
      npc.edgeIdx = nextIdx
      npc.t = 0
    }
    npc.state = 'CROSSING'
  }

  /** Enter the next edge after a turn — used when turning while WAITING. */
  private enterEdge(npc: SimNPC): void {
    const next = this.currentEdge(npc)
    if (!next) {
      npc.state = 'ARRIVED'
      npc.idleTime = 3 + npc.rng() * 5
      return
    }
    if (next.kind === 'crosswalk') {
      npc.state = 'WAITING'
      npc.waitTime = 0.3 + npc.rng() * 0.5
    } else {
      npc.state = 'WALKING'
    }
  }

  /**
   * Is the road the NPC is about to cross / is crossing clear?
   * Checks either the current edge (already on the crosswalk) or the next
   * edge (standing at the curb, edge not yet entered).
   */
  private crosswalkClear(npc: SimNPC, sensor: PedVehicleSensor): boolean {
    let edge = this.currentEdge(npc)
    if (edge && edge.kind === 'crosswalk') {
      // already on (or about to step onto) the crosswalk
    } else if (npc.edgeIdx + 2 < npc.path.length) {
      edge = this.edge(npc.path[npc.edgeIdx + 1], npc.path[npc.edgeIdx + 2])
    } else {
      return true
    }
    if (!edge || edge.kind !== 'crosswalk') return true
    const a = this.node(edge.a)
    const b = this.node(edge.b)
    return sensor.roadClear(a.x, a.z, b.x, b.z)
  }

  private edgeDir(edge: PedEdge): { x: number; z: number } {
    const a = this.node(edge.a)
    const b = this.node(edge.b)
    const len = edge.len || 1
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
  }

  /* ------------------------------------------------------ crowd avoidance */

  /**
   * 0..1 — how much the NPC is allowed to move this frame. Drops toward 0
   * when another pedestrian is directly ahead (same direction: follow at a
   * comfortable gap; head-on at close range: yield and let them pass).
   * Uses the pre-frame position snapshot so the result is order-independent.
   */
  private followFactor(npc: SimNPC, positions: { x: number; z: number }[]): number {
    let ff = 1
    const fwd = { x: Math.sin(npc.yaw), z: Math.cos(npc.yaw) }
    for (const j of this.neighbors(npc.x, npc.z, FOLLOW_DIST)) {
      if (j === npc.index) continue
      const dx = positions[j].x - npc.x
      const dz = positions[j].z - npc.z
      const dist = Math.hypot(dx, dz)
      if (dist > FOLLOW_DIST) continue
      const ahead = dx * fwd.x + dz * fwd.z > 0
      if (!ahead) continue
      const o = this.npcs[j]
      const ofwd = { x: Math.sin(o.yaw), z: Math.cos(o.yaw) }
      const sameDir = fwd.x * ofwd.x + fwd.z * ofwd.z > 0.5
      if (sameDir) {
        ff = Math.min(ff, Math.max(0, (dist - 0.5) / 0.5))
      } else if (dist < 0.75) {
        ff = Math.min(ff, Math.max(0, (dist - 0.3) / 0.45))
      }
    }
    return ff
  }
}
