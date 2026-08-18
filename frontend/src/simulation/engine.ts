import { findRoute, validateRoute } from './pathfinding'
import { mulberry32, type RoadNetwork } from './roadNetwork'
import type {
  RoadNode,
  RoadEdge,
  CollisionCandidate,
  SimStepResult,
  TurnCurve,
  TurnType,
  Vehicle,
  VehicleDebugInfo,
} from './types'
import { DETAIL_LEVELS } from './types'

/**
 * Deterministic, delta-time based traffic simulation engine.
 *
 * Every vehicle owns a start/destination node pair and a pre-computed route.
 * Movement is kinematic and smooth:
 *   - `speed` accelerates/brakes toward `targetSpeed` every tick, with extra
 *     braking applied before intersections and the destination.
 *   - `progressOnEdge += speed * dt`, so behaviour is FPS independent.
 *   - `heading` is interpolated along the path (no instant direction snaps).
 *
 * The engine integrates physics on a fixed internal substep, so the same wall
 * time always produces the same simulation state regardless of frame rate
 * (see the FPS-consistency test).
 *
 * Safeguards:
 *  - route validation before assignment
 *  - blocked edges are handled AT the next intersection (reroute from the
 *    CURRENT node, never from the start, never mid-road)
 *  - immediate U-turns are forbidden on reroutes unless the network requires one
 *  - loop / stall detection (node revisits + travelled distance) with bounded
 *    reroute attempts; vehicles that cannot reach their destination are marked
 *    'unreachable'
 *  - arriving vehicles are stopped, marked 'arrived', then removed — a vehicle
 *    never restarts its own route
 *  - NaN/Infinity positions and negative time are clamped away
 */

export interface EngineOptions {
  seed?: number
  speedRange?: [number, number]
  arrivalHoldSeconds?: number
  unreachableHoldSeconds?: number
  maxReroutes?: number
}

const DEFAULT_OPTIONS: Required<Omit<EngineOptions, 'seed' | 'speedRange'>> = {
  arrivalHoldSeconds: 1,
  unreachableHoldSeconds: 2.5,
  maxReroutes: 4,
}

/** Fixed internal physics step (seconds). */
const SUBSTEP = 1 / 120
const MAX_SUBSTEPS_PER_STEP = 64

/** Deceleration while braking (world units / s²). */
const BRAKE_DECELERATION = 6.5
/** Speed cap for traversing a corner / turn curve (world units / s). */
const CORNER_SPEED = 3.0
/** Max heading rotation rate used to smooth turns (rad / s). */
const HEADING_TURN_RATE = 7
/** Look-ahead distance used to sample the path heading (world units). */
const HEADING_SAMPLE = 0.8

/* Car-following / collision avoidance (IDM-style) ------------------------ */
/** Car body length used for gap calculations (world units). */
const VEHICLE_LENGTH = 4
/** How far ahead a vehicle senses traffic (world units). */
const SENSING_RADIUS = 22
/** Spatial-hash cell size for neighbour lookups (world units). */
const GRID_CELL_SIZE = 7
/** Half-extent of the spatial grid (must cover the whole network). */
const GRID_EXTENT = 70
/** Lateral tolerance for another vehicle to count as "on the same path". */
const LATERAL_TOLERANCE = 2.0
/** Minimum gap at standstill (world units). */
const BASE_GAP = 2.0
/* Intersection signals ---------------------------------------------------
 * Every intersection is signalized: the N/S (vertical, "road-x") and E/W
 * (horizontal, "road-z") approaches get a GREEN then a YELLOW phase and
 * alternate, so perpendicular traffic never shares a green. The clock is
 * deterministic and FPS-consistent (based on the internal substep counter).
 *
 * Each intersection is STAGGERED with its own phase offset derived from its
 * grid position. Keeping every intersection on one shared clock made all
 * perpendicular discharge waves collide simultaneously: every exit lane filled
 * at once, every entry gate held, and the network deadlocked (all vehicles
 * stopped forever). Offsetting each intersection breaks those coinciding
 * waves so a discharge can drain before the next arrives. Adjacent
 * intersections always land in different offset bands (the hash steps by an
 * odd amount for a one-cell move), so neighbouring nodes never share a phase.
 * A vehicle's approach to a signal follows the real-world rule:
 *   RED    → slow down and stop at the stop line
 *   YELLOW → stop if a comfortable stop is still possible, otherwise proceed
 *   GREEN  → proceed when the intersection is clear
 */
const LIGHT_GREEN_TICKS = 600 // 5 s of green per direction
const LIGHT_YELLOW_TICKS = 120 // 1 s of yellow before the switch
const LIGHT_FULL_CYCLE = 2 * (LIGHT_GREEN_TICKS + LIGHT_YELLOW_TICKS)
/** Number of distinct phase-offset bands used to stagger intersections. */
const SIGNAL_PHASE_BANDS = 4
/** Offset (in substep ticks) between adjacent phase bands. */
const SIGNAL_PHASE_STEP = LIGHT_FULL_CYCLE / SIGNAL_PHASE_BANDS
/** Range (m) at which an upcoming signal starts to affect a vehicle. */
const SIGNAL_RANGE = 22
/**
 * Braking envelope stop margin (m): the signal / entry-gate limits stop the
 * vehicle this far before the stop line. Without the margin a vehicle braking
 * on red or at a blocked gate would come to rest exactly on the line and
 * trigger the node transition (starting the turn) despite the red light.
 */
const STOP_MARGIN = 0.35

/* Intersection entry ------------------------------------------------------
 * A vehicle holds at the stop line (instead of entering blindly) when:
 *   - the lane it would exit onto is congested (never block the box), or
 *   - another vehicle is inside the crossing on a conflicting path, or
 *   - it is turning left and oncoming through-traffic is too close.
 */
/** Range (m) at which the entry gate starts to constrain the speed. */
const TURN_PREVIEW_DIST = 16
/** Stopped vehicle distance (m) on the exit lane that blocks entry.
 *  The box (radius BOX_RADIUS ≈ 6 m) must be clear for an entering vehicle
 *  to proceed without blocking perpendicular traffic.  A vehicle queued at
 *  the next intersection's stop line sits ≈ 6.5 m into the exit lane; at
 *  this shorter threshold it no longer triggers a pre-emptive gate hold
 *  (the entering car can still clear the box), breaking the circular
 *  deadlock that formed with the old 9 m value. */
const EXIT_BLOCK_DIST = 6
/** Radius around the intersection centre used for the occupancy check. */
const BOX_RADIUS = 6
/** Spatial search radius for the occupancy check (larger than BOX_RADIUS). */
const BOX_SEARCH_RADIUS = 7.5
/** Lateral distance to our path that counts as an occupied conflict (m). */
const CONFLICT_LATERAL = 2.6
/** Heading tolerance (rad) for "moving in the same direction as us". */
const SAME_HEADING_TOL = 0.44
/** Time headway used to compute the safe following distance (s). */
const TIME_HEADWAY = 0.9
/** Comfortable acceleration (m/s²). */
const IDM_ACCEL = 3.0
/** Comfortable deceleration used by the IDM interaction term (m/s²). */
const IDM_COMFORT_DECEL = 4.5
/** Free-flow exponent of the IDM model. */
const IDM_EXPONENT = 4
/** Below this gap a vehicle brakes at maximum deceleration (world units). */
const EMERGENCY_DIST = 2.2
/** Maximum deceleration during emergency braking (m/s²). */
const MAX_EMERGENCY_DECEL = 12
/** Center distance below which two vehicles count as collided (world units). */
const COLLISION_THRESHOLD = 1.8
/** Ticks before a collided pair may be reported as a new collision again. */
const COLLISION_COOLDOWN_TICKS = 600
/** Seconds an involved (collided) vehicle stays on scene before removal. */
const INVOLVED_HOLD_SECONDS = 2
/** Minimum spacing enforced when spawning vehicles on the same edge. */
const MIN_SPAWN_GAP = 6

/* Lane changes --------------------------------------------------------------
 * Only relevant on multi-lane roads (network `lanes > 1`). A vehicle changes
 * lanes mid-edge when the target lane is clear; the lateral offset is applied
 * smoothly over the change distance. Lanes never change through an
 * intersection — the vehicle either completes the change before the stop line
 * or aborts it and turns from its current lane.
 */
/** Length of a full lane-change manoeuvre along the road (m). */
const LANE_CHANGE_LENGTH = 8
/** Don't start a lane change closer than this to the next stop line (m). */
const LANE_CHANGE_MIN_REMAINING = 4
/** Clearance window in the target lane (m) behind / ahead of the merge point. */
const LANE_CHANGE_CLEAR_REAR = 5
const LANE_CHANGE_CLEAR_FRONT = 16
/** Probability that a vehicle attempts a change when an opportunity arises. */
const LANE_CHANGE_PROB = 0.5

export class SimulationEngine {
  readonly network: RoadNetwork
  readonly vehicles: Map<string, Vehicle> = new Map()
  readonly blockedEdges: Set<string> = new Set()

  private rng: () => number
  private seed: number
  private nextId = 0
  private speedRange: [number, number]
  private opts: Required<Omit<EngineOptions, 'seed' | 'speedRange'>>
  private suspended: Set<string> = new Set()
  private accumulator = 0
  /** Spatial hash of the vehicles, rebuilt every substep. */
  private grid: Map<number, string[]> = new Map()
  /** Tick counter for collision cooldowns / diagnostics. */
  private tickCount = 0
  /** Pair-key -> tick until which a collided pair is "on cooldown". */
  private collidedPairs = new Map<string, number>()
  /**
   * `vehicleId|edgeId` keys whose lane-change opportunity was already
   * considered, so a vehicle tries at most once per edge.
   */
  private laneAttempted = new Set<string>()

  constructor(network: RoadNetwork, options: EngineOptions = {}) {
    this.network = network
    this.seed = options.seed ?? 1337
    this.rng = mulberry32(this.seed)
    this.speedRange = options.speedRange ?? [5, 9]
    this.opts = { ...DEFAULT_OPTIONS, ...options }
  }

  setSeed(seed: number): void {
    this.seed = seed
    this.rng = mulberry32(seed)
  }

  getActiveVehicles(): Vehicle[] {
    const out: Vehicle[] = []
    for (const v of this.vehicles.values()) {
      if (v.status !== 'removed') out.push(v)
    }
    return out
  }

  getVehicle(id: string): Vehicle | undefined {
    return this.vehicles.get(id)
  }

  reset(): void {
    this.vehicles.clear()
    this.blockedEdges.clear()
    this.suspended.clear()
    this.accumulator = 0
  }

  /* ------------------------------------------------------------------ *
   * Edge blocking / road closures
   * ------------------------------------------------------------------ */

  blockEdge(id: string): void {
    this.blockedEdges.add(id)
  }

  unblockEdge(id: string): void {
    this.blockedEdges.delete(id)
  }

  clearBlockedEdges(): void {
    this.blockedEdges.clear()
  }

  /**
   * Block every edge whose midpoint lies within `radius` of (x, z).
   * Returns the ids of the edges that were newly blocked.
   *
   * Vehicles are NOT rerouted here — a vehicle only changes route when it
   * actually reaches the intersection where its next edge is blocked, which
   * prevents mid-road jumps and repeated route regeneration.
   */
  blockEdgesNear(x: number, z: number, radius: number): string[] {
    const newlyBlocked: string[] = []
    for (const edge of this.network.edges.values()) {
      if (this.blockedEdges.has(edge.id)) continue
      const m = this.network.edgeMidpoint(edge)
      const dx = m.x - x
      const dz = m.z - z
      if (dx * dx + dz * dz <= radius * radius) {
        this.blockedEdges.add(edge.id)
        newlyBlocked.push(edge.id)
      }
    }
    return newlyBlocked
  }

  unblockEdgesNear(x: number, z: number, radius: number): string[] {
    const unblocked: string[] = []
    for (const edge of this.network.edges.values()) {
      if (!this.blockedEdges.has(edge.id)) continue
      const m = this.network.edgeMidpoint(edge)
      const dx = m.x - x
      const dz = m.z - z
      if (dx * dx + dz * dz <= radius * radius) {
        this.blockedEdges.delete(edge.id)
        unblocked.push(edge.id)
      }
    }
    return unblocked
  }

  /* ------------------------------------------------------------------ *
   * Vehicle lifecycle
   * ------------------------------------------------------------------ */

  /**
   * Spawn a vehicle on a random edge with a random destination, computing a
   * deterministic route. Returns null when the network is unreachable (e.g.
   * everything around is blocked).
   */
  spawnVehicle(overrides: Partial<Vehicle> = {}): Vehicle | null {
    const nodeIds = this.network.allNodeIds()
    if (nodeIds.length < 2) return null

    let route: string[] | null = null
    let firstEdge: ReturnType<RoadNetwork['edgeBetween']> = undefined
    let targetSpeed = 0
    let progress = 0
    // Deterministic retry loop: try a few (start, dest) pairs; when the edge
    // has no room left for a spawned vehicle, pick a different route instead
    // of failing outright (short edges can only fit a single vehicle).
    for (let attempt = 0; attempt < 48; attempt++) {
      const start = nodeIds[Math.floor(this.rng() * nodeIds.length)]
      const destination = nodeIds[Math.floor(this.rng() * nodeIds.length)]
      if (destination === start) continue
      const candidate = findRoute(this.network, start, destination, this.blockedEdges)
      if (!candidate) continue
      const lanePool = this.network.laneEdges(candidate[0], candidate[1])
      if (lanePool.length === 0) continue
      // Spawn on a random lane so multi-lane roads fill evenly.
      const edge = lanePool[Math.floor(this.rng() * lanePool.length)]
      if (!edge) continue

      const speed = this.speedRange[0] + this.rng() * (this.speedRange[1] - this.speedRange[0])
      // Pick a spawn point that never puts the vehicle inside another one on
      // the same edge: sample repeatedly and only spawn when a spot with at
      // least MIN_SPAWN_GAP clearance exists. If this edge has no room, the
      // outer loop retries with another route.
      const spawnMax = Math.max(edge.length * 0.6 - 2, 2)
      for (let pick = 0; pick < 16; pick++) {
        const candidateProgress = 2 + this.rng() * (spawnMax - 2)
        let minGap = Infinity
        for (const other of this.vehicles.values()) {
          if (other.status === 'removed') continue
          if (other.currentEdge === edge.id) {
            minGap = Math.min(minGap, Math.abs(other.progressOnEdge - candidateProgress))
          }
        }
        if (minGap >= MIN_SPAWN_GAP) {
          route = candidate
          firstEdge = edge
          targetSpeed = speed
          progress = candidateProgress
          break
        }
      }
      if (route) break
    }
    if (!route || !firstEdge) return null

    const vehicle = this.buildVehicle({
      route,
      targetSpeed,
      progressOnEdge: progress,
      currentEdge: firstEdge.id,
      currentRoad: firstEdge.road,
      lane: firstEdge.laneOffset,
      ...overrides,
    })
    this.vehicles.set(vehicle.id, vehicle)
    return vehicle
  }

  /**
   * Spawn a vehicle with explicit start/destination nodes (deterministic;
   * used by tests and for predictable scenarios). Returns null when no route
   * exists between the nodes.
   */
  spawnAt(from: string, to: string, opts: { speed?: number; progressOnEdge?: number } = {}): Vehicle | null {
    if (from === to) return null
    if (!this.network.getNode(from) || !this.network.getNode(to)) return null
    const route = findRoute(this.network, from, to, this.blockedEdges)
    if (!route) return null
    const firstEdge = this.network.edgeBetween(route[0], route[1])
    if (!firstEdge) return null

    const targetSpeed =
      opts.speed ?? this.speedRange[0] + this.rng() * (this.speedRange[1] - this.speedRange[0])
    const vehicle = this.buildVehicle({
      route,
      targetSpeed,
      progressOnEdge: opts.progressOnEdge ?? 0,
      speed: opts.speed,
    })
    this.vehicles.set(vehicle.id, vehicle)
    return vehicle
  }

  private buildVehicle(
    input: {
      route: string[]
      targetSpeed: number
      progressOnEdge: number
    } & Partial<Vehicle>
  ): Vehicle {
    const route = input.route
    const spawnEdge =
      (input.currentEdge ? this.network.getEdge(input.currentEdge) : undefined) ??
      this.network.edgeBetween(route[0], route[1])
    const progress = Number.isFinite(input.progressOnEdge) ? input.progressOnEdge : 0
    const startPos = this.network.pointOnEdge(spawnEdge!, progress)
    const aheadPos = this.network.pointOnEdge(
      spawnEdge!,
      Math.min(progress + HEADING_SAMPLE, spawnEdge!.length)
    )
    const startHeading = Math.atan2(aheadPos.x - startPos.x, aheadPos.z - startPos.z)
    const initialSpeed =
      typeof input.speed === 'number' && Number.isFinite(input.speed) && input.speed > 0 ? input.speed : 0

    const vehicle: Vehicle = {
      id: input.id ?? `v${this.nextId++}`,
      startNode: route[0],
      destinationNode: route[route.length - 1],
      currentNode: route[0],
      previousNode: null,
      route,
      routeIndex: 0,
      currentEdge: input.currentEdge ?? spawnEdge?.id ?? null,
      currentRoad: input.currentRoad ?? spawnEdge?.road ?? null,
      lane: input.lane ?? spawnEdge?.laneOffset ?? 0,
      progressOnEdge: progress,
      speed: initialSpeed,
      targetSpeed: input.targetSpeed,
      velocity: {
        x: Math.sin(startHeading) * initialSpeed,
        z: Math.cos(startHeading) * initialSpeed,
      },
      acceleration: 0,
      braking: 0,
      heading: startHeading,
      status: 'spawning',
      phase: 'route_calculated',
      holdTimer: 0,
      x: startPos.x,
      z: startPos.z,
      detail: DETAIL_LEVELS.FULL,
      totalDistance: 0,
      stalledTicks: 0,
      rerouteCount: 0,
      recentNodes: [route[0]],
      turn: null,
      turnDist: 0,
      laneChange: null,
      nextEdgeId: null,
    }
    return vehicle
  }

  removeVehicle(id: string): void {
    const v = this.vehicles.get(id)
    if (v) {
      v.status = 'removed'
      this.suspended.delete(id)
      this.vehicles.delete(id)
    }
  }

  suspend(id: string): void {
    this.suspended.add(id)
  }

  resume(id: string): void {
    this.suspended.delete(id)
  }

  /** True when the vehicle is frozen in place by the visual layer (accident override / event stop). */
  isSuspended(id: string): boolean {
    return this.suspended.has(id)
  }

  /* ------------------------------------------------------------------ *
   * Simulation step
   * ------------------------------------------------------------------ */

  step(dt: number): SimStepResult {
    const result: SimStepResult = { arrived: [], removed: [], rerouted: [], stalled: [], collisions: [] }
    const safeDt = Number.isFinite(dt) && dt >= 0 ? Math.min(dt, 0.25) : 0
    if (safeDt <= 0) return result

    // Fixed-timestep accumulator: the simulation always advances in SUBSTEP
    // slices, so identical wall-clock time yields identical state at any FPS.
    this.accumulator += safeDt
    let substeps = 0
    while (this.accumulator >= SUBSTEP && substeps < MAX_SUBSTEPS_PER_STEP) {
      this.stepOnce(SUBSTEP, result)
      this.accumulator -= SUBSTEP
      substeps++
    }
    if (substeps >= MAX_SUBSTEPS_PER_STEP) {
      // Dropped input (e.g. a very long frame) — avoid a spiral of death.
      this.accumulator = 0
    }
    return result
  }

  private stepOnce(dt: number, result: SimStepResult): void {
    this.tickCount++
    // Rebuild the spatial hash once per substep; every interaction query
    // (following, stall detection, collision checks) uses it.
    this.buildGrid()

    for (const v of this.vehicles.values()) {
      if (v.status === 'removed' || this.suspended.has(v.id)) continue

      if (v.status === 'arrived' || v.status === 'unreachable' || v.status === 'involved') {
        v.holdTimer -= dt
        if (v.holdTimer <= 0) {
          v.status = 'removed'
          result.removed.push(v)
          this.suspended.delete(v.id)
          this.vehicles.delete(v.id)
        }
        continue
      }

      if (v.status === 'spawning') {
        v.status = 'moving'
        v.phase = 'road'
      }
      if (v.status !== 'moving') continue

      const prevEdge = v.currentEdge
      const prevProgress = v.progressOnEdge
      const prevTurnDist = v.turnDist

      // 1) Accelerate / brake toward the desired speed.
      this.updateSpeed(v, dt)
      // 2) Advance along the route (handles node transitions, turns through
      //    intersections, arrival, blocked-edge reroutes).
      this.advance(v, dt, result)

      const moved =
        v.currentEdge !== prevEdge ||
        v.progressOnEdge - prevProgress > 1e-9 ||
        v.turnDist - prevTurnDist > 1e-9
      v.stalledTicks = moved ? 0 : v.stalledTicks + 1
      v.totalDistance += v.speed * dt

      // 3) Reflect the lifecycle phase after movement.
      this.updatePhase(v)

      // 4) Cycle / stall detection.
      if (v.status === 'moving') {
        const lastVisited = v.recentNodes[v.recentNodes.length - 1]
        if (lastVisited !== v.currentNode) {
          const revisited = v.recentNodes.includes(v.currentNode)
          v.recentNodes.push(v.currentNode)
          if (v.recentNodes.length > 64) v.recentNodes.shift()
          if (revisited) {
            console.warn('[CRIS][SIM] ROUTE CYCLE DETECTED', JSON.stringify(this.vehicleDebug(v)))
            v.stalledTicks = 0
            this.rerouteVehicle(v)
            result.stalled.push(v)
            continue
          }
        }
        if ((v.stalledTicks >= 180 && !this.queuedInTraffic(v)) || this.loopSuspected(v)) {
          console.warn('[CRIS][SIM] VEHICLE STALL/LOOP DETECTED', JSON.stringify(this.vehicleDebug(v)))
          v.stalledTicks = 0
          this.rerouteVehicle(v)
          result.stalled.push(v)
        }
      }
    }

    // 5) Resolve any actual overlaps (safety net) — deduplicated per pair.
    this.handleCollisions(result)
  }

  private loopSuspected(v: Vehicle): boolean {
    if (v.route.length < 2) return false
    const routeLen = this.network.routeLength(v.route)
    // A BFS route is simple and bounded; travelling far more than the route
    // length without arriving means the vehicle is trapped in a cycle.
    return v.totalDistance > Math.max(routeLen * 2.5, 200)
  }

  /**
   * True when the vehicle is currently constrained by traffic, a signal, or
   * the intersection entry gate (a leader ahead, a red light, a congested
   * exit lane, an occupied crossing, or oncoming traffic for a left turn).
   * Such vehicles are queued in traffic — not stalled in a loop — so they are
   * exempt from stall-based rerouting (which would otherwise trigger useless
   * reroute / unreachable churn whenever a jam or a light forms).
   */
  private queuedInTraffic(v: Vehicle): boolean {
    if (v.turn !== null) return true // committed to a crossing — never reroute mid-turn
    if (this.nearestLeader(v) !== null) return true
    const edge = this.network.getEdge(v.currentEdge ?? '')
    if (!edge) return false
    if (this.signalSpeedLimit(v, edge) !== null) return true
    const remaining = Math.max(edge.length - v.progressOnEdge, 0)
    const nextNode = v.route[v.routeIndex + 1]
    const isLast = nextNode === undefined || nextNode === v.destinationNode
    if (!isLast && remaining < TURN_PREVIEW_DIST) {
      const turn = this.upcomingTurn(v, edge)
      if (turn && !this.checkEntry(v, edge, turn)) return true
    }
    return false
  }

  /* ------------------------------------------------------------------ *
   * Spatial hash (efficient neighbour lookup, no O(n²) checks)
   * ------------------------------------------------------------------ */

  /** Rebuild the spatial hash from the current vehicle positions. */
  private buildGrid(): void {
    const grid = new Map<number, string[]>()
    for (const v of this.vehicles.values()) {
      if (v.status === 'removed') continue
      const p = this.vehiclePosition(v)
      const key = this.cellKey(p.x, p.z)
      let bucket = grid.get(key)
      if (!bucket) {
        bucket = []
        grid.set(key, bucket)
      }
      bucket.push(v.id)
    }
    this.grid = grid
  }

  private cellKey(x: number, z: number): number {
    const c = Math.floor((x + GRID_EXTENT) / GRID_CELL_SIZE)
    const r = Math.floor((z + GRID_EXTENT) / GRID_CELL_SIZE)
    return c * 1000 + r
  }

  /** Ids of vehicles inside the cells overlapping a circle of `radius`. */
  private gridCandidates(x: number, z: number, radius: number): string[] {
    if (this.grid.size === 0) return []
    const minC = Math.floor((x - radius + GRID_EXTENT) / GRID_CELL_SIZE)
    const maxC = Math.floor((x + radius + GRID_EXTENT) / GRID_CELL_SIZE)
    const minR = Math.floor((z - radius + GRID_EXTENT) / GRID_CELL_SIZE)
    const maxR = Math.floor((z + radius + GRID_EXTENT) / GRID_CELL_SIZE)
    const out: string[] = []
    for (let c = minC; c <= maxC; c++) {
      for (let r = minR; r <= maxR; r++) {
        const bucket = this.grid.get(c * 1000 + r)
        if (bucket) out.push(...bucket)
      }
    }
    return out
  }

  /** Active (non-removed) vehicles within `radius` of (x, z), via the spatial hash. */
  vehiclesNear(x: number, z: number, radius: number): Vehicle[] {
    const out: Vehicle[] = []
    for (const id of this.gridCandidates(x, z, radius)) {
      const v = this.vehicles.get(id)
      if (v && v.status !== 'removed') out.push(v)
    }
    return out
  }

  /* ------------------------------------------------------------------ *
   * Car-following / collision avoidance (IDM)
   * ------------------------------------------------------------------ */

  /**
   * Find the nearest conflicting vehicle in front of `v`.
   *
   * Only local candidates from the spatial hash are inspected, so this is
   * O(neighbours) instead of O(vehicles). Returns the closest gap (m) and the
   * leader's longitudinal speed, or null when the path ahead is clear.
   *
   * - Same-path traffic (lateral distance within LATERAL_TOLERANCE and in
   *   front) is a candidate with gap = distance along heading − car length.
   * - Vehicles immediately beside the nose count too, so side-to-side contact
   *   is avoided (their gap uses the centre distance).
   * - Cross-traffic conflicts inside intersections are prevented by the signal
   *   phases and the entry gate (see checkEntry), so no yielding is needed
   *   here.
   */
  private nearestLeader(v: Vehicle): { gap: number; leaderSpeed: number } | null {
    if (this.vehicles.size < 2) return null
    const pos = this.vehiclePosition(v)
    const fx = Math.sin(v.heading)
    const fz = Math.cos(v.heading)
    let best: { gap: number; leaderSpeed: number } | null = null

    for (const otherId of this.gridCandidates(pos.x, pos.z, SENSING_RADIUS)) {
      const other = this.vehicles.get(otherId)
      if (!other || other.id === v.id || other.status === 'removed') continue
      const op = this.vehiclePosition(other)
      const dx = op.x - pos.x
      const dz = op.z - pos.z
      const dist = Math.hypot(dx, dz)
      if (dist > SENSING_RADIUS || dist < 1e-3) continue
      const proj = dx * fx + dz * fz
      const lat = Math.abs(dx * fz - dz * fx)
      if (lat > LATERAL_TOLERANCE || proj <= -VEHICLE_LENGTH * 0.6) continue

      // Same path (ahead, or immediately beside the nose): use the gap along
      // the direction of travel; for beside vehicles use the centre distance
      // so side-to-side contact is also avoided.
      const gap = proj > 0.5 ? proj - VEHICLE_LENGTH : dist - VEHICLE_LENGTH
      // A vehicle closer than a car length is the most dangerous obstacle —
      // clamp to a tiny gap instead of skipping it, so the emergency brake
      // below always fires for it.
      const gapVal = Math.max(gap, 0.05)
      const leaderSpeed = this.leaderSpeed(other)
      if (!best || gapVal < best.gap) best = { gap: gapVal, leaderSpeed }
    }

    return best
  }

  /** Longitudinal speed of `other` as seen by a follower (0 when stopped). */
  private leaderSpeed(other: Vehicle): number {
    if (this.suspended.has(other.id)) return 0
    if (other.status === 'arrived' || other.status === 'unreachable' || other.status === 'involved') return 0
    return other.speed
  }

  /**
   * Kinematic speed limit of the current edge: cruise target reduced near the
   * destination (down to 0) and, for actual turns, near the next intersection
   * (down to the curvature-limited corner speed). Straight-through traffic
   * keeps its cruise speed — there is no reason to slow down for an
   * intersection you are just driving across.
   */
  private pathSpeedLimit(v: Vehicle, edge: RoadEdge): number {
    const remaining = Math.max(edge.length - v.progressOnEdge, 0)
    const nextNode = v.route[v.routeIndex + 1]
    const isLast = nextNode === undefined || nextNode === v.destinationNode
    if (isLast) {
      return Math.min(v.targetSpeed, Math.sqrt(2 * BRAKE_DECELERATION * remaining))
    }
    const turn = this.upcomingTurn(v, edge)
    if (turn && turn.type === 'straight') {
      return v.targetSpeed
    }
    const cornerV = turn ? Math.min(turn.maxSpeed, CORNER_SPEED) : CORNER_SPEED
    return Math.min(v.targetSpeed, Math.sqrt(cornerV * cornerV + 2 * BRAKE_DECELERATION * remaining))
  }

  /** The turn curve the vehicle will take at its next intersection (or null). */
  private upcomingTurn(v: Vehicle, edge: RoadEdge): TurnCurve | null {
    const nodeIdx = v.routeIndex + 1
    if (nodeIdx >= v.route.length - 1) return null // destination next — no turn
    const nextNode = v.route[nodeIdx]
    const outNode = v.route[nodeIdx + 1]
    if (!nextNode || !outNode) return null
    const outEdge = this.plannedExitEdge(v, edge)
    if (!outEdge) return null
    return this.network.buildTurnCurve(edge, outEdge)
  }

  /**
   * The lane edge a vehicle will depart onto when turning from `fromNode` onto
   * `outNode`, chosen by manoeuvre: right turns take the outer lane, left
   * turns the inner lane, u-turns the middle, and straight-through traffic
   * keeps its current lane. Returns undefined when no lane exists.
   */
  private departureLaneEdge(inEdge: RoadEdge, fromNode: string, outNode: string): RoadEdge | undefined {
    const lanes = this.network.laneEdges(fromNode, outNode)
    if (lanes.length === 0) return undefined
    const baseOut = this.network.edgeBetween(fromNode, outNode)
    const turnType = baseOut ? this.network.buildTurnCurve(inEdge, baseOut).type : 'straight'
    let depLane = inEdge.laneIndex
    if (turnType === 'right') depLane = lanes.length - 1
    else if (turnType === 'left') depLane = 0
    else if (turnType === 'uturn') depLane = Math.floor(lanes.length / 2)
    return lanes[Math.min(Math.max(depLane, 0), lanes.length - 1)] ?? lanes[0]
  }

  /**
   * The lane edge the vehicle will depart onto after crossing its next
   * intersection (the node at `route[routeIndex + 1]`). Must be called with
   * routeIndex pointing at the approach node, i.e. before the route
   * bookkeeping in advance() moves the vehicle onto the intersection node.
   */
  private plannedExitEdge(v: Vehicle, inEdge: RoadEdge): RoadEdge | undefined {
    const nextNode = v.route[v.routeIndex + 1]
    const beyondNode = v.route[v.routeIndex + 2]
    if (!nextNode || !beyondNode) return undefined
    return this.departureLaneEdge(inEdge, nextNode, beyondNode)
  }

  /**
   * Per-intersection phase offset (substep ticks) that staggers this node's
   * signal clock relative to its neighbours. Moving one grid cell changes the
   * hash by an odd amount modulo SIGNAL_PHASE_BANDS, so two orthogonally
   * adjacent intersections always land in different offset bands and never
   * discharge into the same segments at the same time.
   */
  private signalOffset(node: RoadNode): number {
    const step = this.network.gridStep()
    const gx = Math.round(node.x / step)
    const gz = Math.round(node.z / step)
    const band =
      ((((gx * 7 + gz * 11) % SIGNAL_PHASE_BANDS) + SIGNAL_PHASE_BANDS) % SIGNAL_PHASE_BANDS)
    return band * SIGNAL_PHASE_STEP
  }

  /**
   * Current phase of the traffic light at an intersection node for a given
   * approach direction (vertical = road-x roads, horizontal = road-z roads).
   */
  signalPhase(nodeId: string, vertical: boolean): 'red' | 'yellow' | 'green' {
    const t = ((this.tickCount % LIGHT_FULL_CYCLE) + LIGHT_FULL_CYCLE) % LIGHT_FULL_CYCLE
    const node = this.network.getNode(nodeId)
    const nodeOff = node ? this.signalOffset(node) : 0
    const off = nodeOff + (vertical ? 0 : LIGHT_GREEN_TICKS + LIGHT_YELLOW_TICKS)
    const u = (t - off + LIGHT_FULL_CYCLE) % LIGHT_FULL_CYCLE
    if (u < LIGHT_GREEN_TICKS) return 'green'
    if (u < LIGHT_GREEN_TICKS + LIGHT_YELLOW_TICKS) return 'yellow'
    return 'red'
  }

  /** Current phase of the traffic light for the edge's approach direction. */
  private lightPhase(edge: RoadEdge): 'red' | 'yellow' | 'green' {
    const isVertical = edge.road.startsWith('road-x')
    return this.signalPhase(edge.to, isVertical)
  }

  /**
   * Speed limit imposed by the next intersection's signal, or null when the
   * light does not constrain the vehicle. RED returns a braking envelope that
   * brings the vehicle to a stop exactly at the stop line. YELLOW returns the
   * same envelope when a comfortable stop is still possible, otherwise null —
   * a driver already too close to the line proceeds rather than slamming the
   * brakes. GREEN returns null (no constraint).
   */
  private signalSpeedLimit(v: Vehicle, edge: RoadEdge): number | null {
    const nextNode = v.route[v.routeIndex + 1]
    if (!nextNode) return null
    if (nextNode === v.destinationNode) return null // arrival handled separately
    const remaining = Math.max(edge.length - v.progressOnEdge, 0)
    if (remaining > SIGNAL_RANGE) return null
    const phase = this.lightPhase(edge)
    if (phase === 'green') return null
    const stopLimit = Math.sqrt(2 * IDM_COMFORT_DECEL * Math.max(remaining - STOP_MARGIN, 0))
    if (phase === 'yellow') {
      const stopDist = (v.speed * v.speed) / (2 * IDM_COMFORT_DECEL)
      if (remaining > stopDist) return stopLimit
      return null
    }
    return stopLimit
  }

  /**
   * IDM-style acceleration (Intelligent Driver Model).
   *
   *   accel = a · [1 − (v / v0)^δ − (s* / s)²]
   *
   * with the safe following distance
   *
   *   s* = s0 + v·T + v·Δv / (2·√(a·b))
   *
   * where s is the gap to the leader, Δv = v − v_leader the closing speed and
   * v0 the kinematic speed limit of the path. This yields smooth acceleration
   * and deceleration, speed-limit tracking, car following, stopping behind a
   * leader and automatic restarting once the leader clears.
   */
  private idmAcceleration(
    v: Vehicle,
    limit: number,
    leader: { gap: number; leaderSpeed: number } | null
  ): number {
    const a = IDM_ACCEL
    const speed = v.speed
    const v0 = Math.max(limit, 0.001)
    const vRatio = Math.min(speed / v0, 1.5)
    let term = a * (1 - Math.pow(vRatio, IDM_EXPONENT))

    if (leader) {
      const s = Math.max(leader.gap, 0.05)
      const dv = Math.max(speed - leader.leaderSpeed, 0) // closing speed
      const sStar = BASE_GAP + speed * TIME_HEADWAY + (speed * dv) / (2 * Math.sqrt(a * IDM_COMFORT_DECEL))
      // Standard IDM: the interaction term always adds braking on top of the
      // free-flow term (never replaces it) — otherwise a stopped vehicle with a
      // far-away leader would be unable to start moving again.
      term -= a * Math.pow(sStar / s, 2)
    }
    return term
  }

  /**
   * Update the vehicle's speed for this tick using the IDM model.
   *
   * Zone behaviour (gap = distance to the nearest leader):
   *   FAR      → accelerate smoothly toward the path speed limit
   *   MEDIUM   → ease off the throttle (IDM interaction term grows)
   *   CLOSE    → brake with up to comfortable deceleration
   *   TOO CLOSE→ emergency braking at MAX_EMERGENCY_DECEL
   *
   * While the vehicle is committed to an intersection (`v.turn` set), the limit
   * is the curvature-limited corner speed and no signal / entry-gate logic
   * applies — the crossing was checked before the stop line was crossed.
   */
  private updateSpeed(v: Vehicle, dt: number): void {
    if (v.turn !== null) {
      const curve = v.turn!
      const prevSpeed = v.speed
      // Straight-through traffic keeps its cruise speed in the crossing; only
      // actual turns are limited to the curvature / corner speed.
      const cornerCap = curve.type === 'straight' ? v.targetSpeed : CORNER_SPEED
      const limit = Math.min(v.targetSpeed, curve.maxSpeed, cornerCap)
      const leader = this.nearestLeader(v)
      let accel = this.idmAcceleration(v, limit, leader)
      if (leader && leader.gap < EMERGENCY_DIST) {
        const reqDecel = (v.speed * v.speed) / (2 * Math.max(leader.gap, 0.1))
        accel = Math.min(accel, -Math.min(reqDecel, MAX_EMERGENCY_DECEL))
      }
      v.speed = Math.max(0, Math.min(limit, v.speed + accel * dt))
      v.acceleration = (v.speed - prevSpeed) / dt
      v.braking = v.speed < prevSpeed ? Math.min(prevSpeed - v.speed, MAX_EMERGENCY_DECEL) : 0
      return
    }

    const edge = this.network.getEdge(v.currentEdge ?? '')
    if (!edge) {
      // No valid edge: halt the vehicle; advance() will mark it unreachable.
      v.speed = Math.max(v.speed - MAX_EMERGENCY_DECEL * dt, 0)
      v.acceleration = v.speed > 0 ? -MAX_EMERGENCY_DECEL : 0
      v.braking = v.speed > 0 ? MAX_EMERGENCY_DECEL : 0
      return
    }

    const prevSpeed = v.speed
    const remaining = Math.max(edge.length - v.progressOnEdge, 0)

    // Kinematic limit from the upcoming corner / destination, reduced by the
    // intersection signal (red → stop at the line; yellow → stop when safe).
    // FAR / MINIMAL detail vehicles ignore signals entirely (reduced AI).
    let limit = this.pathSpeedLimit(v, edge)
    const signalLimit = v.detail >= DETAIL_LEVELS.MEDIUM ? this.signalSpeedLimit(v, edge) : null
    if (signalLimit !== null) limit = Math.min(limit, signalLimit)

    // Intersection entry gate: while the light allows proceeding but the
    // crossing is not actually clear (exit congested, box occupied, oncoming
    // traffic for a left turn), hold the vehicle at the stop line. A vehicle
    // still far enough from the line to brake is constrained; only one that is
    // already committed (too fast / too close to stop even at emergency
    // deceleration) proceeds — the crossing was clear when it began braking.
    const nextNode = v.route[v.routeIndex + 1]
    const isLast = nextNode === undefined || nextNode === v.destinationNode
    // Lane-change decision (multi-lane roads only), attempted once per edge and
    // only while free-flowing (a braking or queued vehicle does not change
    // lanes); the change must complete before the next stop line. Only FULL
    // detail vehicles change lanes (reduced AI otherwise).
    if (!isLast && v.detail >= DETAIL_LEVELS.FULL && v.laneChange === null && v.speed >= v.targetSpeed * 0.6) {
      this.maybeChangeLane(v, edge)
    }
    if (!isLast && v.detail >= DETAIL_LEVELS.MEDIUM && remaining < TURN_PREVIEW_DIST) {
      const turn = this.upcomingTurn(v, edge)
      if (turn && !this.checkEntry(v, edge, turn)) {
        const stopDist = (v.speed * v.speed) / (2 * IDM_COMFORT_DECEL)
        if (remaining > stopDist) {
          limit = Math.min(limit, Math.sqrt(2 * IDM_COMFORT_DECEL * Math.max(remaining - STOP_MARGIN, 0)))
        }
      }
    }

    // Nearest conflicting vehicle (spatial-hash lookup; null = path clear).
    const leader = this.nearestLeader(v)

    // IDM acceleration (smooth following / braking / restarting).
    let accel = this.idmAcceleration(v, limit, leader)

    // TOO CLOSE → emergency braking. Decelerate as hard as needed to come to
    // a full stop before the leader (up to MAX_EMERGENCY_DECEL).
    if (leader && leader.gap < EMERGENCY_DIST) {
      const reqDecel = (v.speed * v.speed) / (2 * Math.max(leader.gap, 0.1))
      accel = Math.min(accel, -Math.min(reqDecel, MAX_EMERGENCY_DECEL))
    }

    // Integrate, keeping the kinematic speed limit as a hard cap.
    v.speed = Math.max(0, Math.min(limit, v.speed + accel * dt))
    v.acceleration = (v.speed - prevSpeed) / dt
    v.braking = v.speed < prevSpeed ? Math.min(prevSpeed - v.speed, MAX_EMERGENCY_DECEL) : 0
  }

  /* ------------------------------------------------------------------ *
   * Intersection entry gate
   * ------------------------------------------------------------------ */

  /**
   * Decide whether the vehicle may cross the stop line into the next
   * intersection. All three conditions must hold:
   *
   *  1. Exit availability — the lane we would leave onto must not be
   *     congested near its start (never block the box).
   *  2. Crossing occupancy — no other vehicle is inside the crossing on a
   *     conflicting path (two same-direction followers do not conflict; a
   *     stopped or cross-direction vehicle inside the box does).
   *  3. Safe turning — a left turn yields to oncoming through-traffic.
   *
   * The gate is evaluated throughout the approach (within TURN_PREVIEW_DIST),
   * so a vehicle always brakes gently to a stop exactly at the stop line
   * rather than creeping into the crossing.
   */
  private checkEntry(v: Vehicle, edge: RoadEdge, turn: TurnCurve): boolean {
    const nextNode = v.route[v.routeIndex + 1]
    const beyondNode = v.route[v.routeIndex + 2]
    if (!nextNode || !beyondNode) return true
    const node = this.network.getNode(nextNode)
    if (!node) return false
    if (!this.network.getEdge(v.currentEdge ?? '')) return false

    // 1) Exit availability (box-blocking): never enter a crossing we cannot
    //    leave because the lane we would depart onto is jammed right after
    //    the intersection. The departure lane matches the manoeuvre
    //    (right → outer, left → inner, straight → current lane).
    const exitEdge = this.plannedExitEdge(v, edge)
    if (exitEdge) {
      for (const otherId of this.gridCandidates(node.x, node.z, SENSING_RADIUS)) {
        const other = this.vehicles.get(otherId)
        if (!other || other.id === v.id || other.status === 'removed') continue
        if (other.currentEdge !== exitEdge.id) continue
        if (other.progressOnEdge > EXIT_BLOCK_DIST) continue
        // A suspended vehicle is a stopped obstruction (speed field is stale).
        if (other.speed >= 1 && !this.suspended.has(other.id)) continue
        return false
      }
    }

    // 2) Crossing occupancy: build our path through the intersection (the turn
    //    curve plus a preview of the exit lane) and check for conflicts.
    const path = this.turnPathPreview(turn, exitEdge)
    const exitDir = exitEdge ? this.network.edgeDirection(exitEdge) : null
    const departureH = exitDir ? Math.atan2(exitDir.x, exitDir.z) : 0
    for (const otherId of this.gridCandidates(node.x, node.z, BOX_SEARCH_RADIUS)) {
      const other = this.vehicles.get(otherId)
      if (!other || other.id === v.id || other.status === 'removed') continue
      const op = this.vehiclePosition(other)
      if (Math.hypot(op.x - node.x, op.z - node.z) > BOX_RADIUS) continue

      // A follower on the exact same curve (leading us through the turn) is
      // handled by the IDM following logic, not treated as an obstacle.
      if (other.turn === turn && other.speed > 0.5) continue

      const hit = this.closestOnPath(op, path)
      if (hit && hit.dist < CONFLICT_LATERAL && hit.arc > 1.5) {
        // A fast vehicle already clearing the exit in our direction of travel
        // does not block us either — we simply follow it out.
        const sameDir = this.angleDiff(other.heading, departureH) < SAME_HEADING_TOL
        if (sameDir && other.speed > 1) continue
        return false
      }
    }

    // 3) Safe turning: left turns cross the oncoming lane and must yield to
    //    through-traffic approaching the intersection. A stopped oncoming
    //    vehicle counts too when it is about to move — it shares our green
    //    (opposing approaches run on the same phase). If the oncoming is
    //    itself held by its own gate (e.g. it is also making a left turn), it
    //    is not a threat and the crossing-occupancy rule serializes us.
    if (turn.type === 'left') {
      const oncomingLanes = this.oncomingEdges(v, edge)
      if (oncomingLanes.length > 0) {
        const clearTime = Math.max(turn.length / Math.max(turn.maxSpeed, CORNER_SPEED), 1.5) + 0.8
        for (const otherId of this.gridCandidates(node.x, node.z, SENSING_RADIUS)) {
          const other = this.vehicles.get(otherId)
          if (!other || other.id === v.id || other.status === 'removed') continue
          const oncoming = oncomingLanes.find((o) => other.currentEdge === o.id)
          if (!oncoming) continue
          if (other.speed < 0.5) {
            // Stopped: will it move? A straight-through oncoming shares our
            // green and starts right away — block it. A left / u-turn oncoming
            // waits for its own yield and is not an imminent threat.
            const otherType = this.oncomingTurnType(other, nextNode)
            if (otherType === 'left' || otherType === 'uturn') continue
          }
          const distToNode = oncoming.length - other.progressOnEdge
          const effSpeed = other.speed < 0.5 ? Math.max(other.targetSpeed, 4) : other.speed
          if (distToNode / effSpeed < clearTime) return false
        }
      }
    }

    return true
  }

  /**
   * The oncoming (opposite-direction) lanes of the road we are on: every lane
   * edge running from the node straight ahead back to the intersection.
   * Traffic there crosses our path when we turn left.
   */
  private oncomingEdges(v: Vehicle, inEdge: RoadEdge): RoadEdge[] {
    const nodeId = v.route[v.routeIndex + 1]
    const node = nodeId ? this.network.getNode(nodeId) : undefined
    if (!nodeId || !node) return []
    const dir = this.network.edgeDirection(inEdge)
    for (const out of this.network.outgoingEdges(nodeId)) {
      const outDir = this.network.edgeDirection(out)
      if (outDir.x * dir.x + outDir.z * dir.z > 0.9) {
        return this.network.laneEdges(out.to, nodeId)
      }
    }
    return []
  }

  /**
   * The turn type the oncoming vehicle will perform at the given node (based
   * on its current route), or null when it is not routed through the node.
   */
  private oncomingTurnType(other: Vehicle, nodeId: string): TurnType | null {
    const idx = other.route.indexOf(nodeId)
    if (idx <= 0 || idx >= other.route.length - 1) return null
    const inEdge = this.network.edgeBetween(other.route[idx - 1], nodeId)
    const outEdge = this.network.edgeBetween(nodeId, other.route[idx + 1])
    if (!inEdge || !outEdge) return null
    return this.network.buildTurnCurve(inEdge, outEdge).type
  }

  /* ------------------------------------------------------------------ *
   * Lane changes (multi-lane roads)
   * ------------------------------------------------------------------ */

  /**
   * Evaluate whether the vehicle should change lanes on its current edge.
   * At most once per edge; the target lane must be clear within a safety
   * window and the manoeuvre must fit before the next stop line.
   */
  private maybeChangeLane(v: Vehicle, edge: RoadEdge): void {
    if (v.turn !== null || v.laneChange !== null) return
    if (this.network.laneSpacing <= 0) return // single-lane road
    const remaining = edge.length - v.progressOnEdge
    if (v.progressOnEdge < 2 || remaining < LANE_CHANGE_MIN_REMAINING) return
    if (!v.currentEdge) return

    // Once per edge (vehicle + edge pair).
    const attemptKey = `${v.id}|${v.currentEdge}`
    if (this.laneAttempted.has(attemptKey)) return

    // Random target direction and attempt probability.
    const delta = this.rng() < 0.5 ? 1 : -1
    const target = this.network.adjacentLane(edge, delta)
    if (!target) return
    if (this.rng() >= LANE_CHANGE_PROB) return
    if (!this.laneClearForChange(v, target)) return

    const length = Math.min(LANE_CHANGE_LENGTH, remaining - LANE_CHANGE_MIN_REMAINING)
    if (length < 2) return
    v.laneChange = {
      fromLaneIndex: edge.laneIndex,
      toLaneIndex: target.laneIndex,
      startProgress: v.progressOnEdge,
      length,
    }
  }

  /** True when no vehicle occupies the target lane near the merge point. */
  private laneClearForChange(v: Vehicle, target: RoadEdge): boolean {
    const pos = v.progressOnEdge
    for (const other of this.vehicles.values()) {
      if (other.status === 'removed' || other.id === v.id) continue
      if (other.currentEdge !== target.id) continue
      if (other.turn !== null) continue // committed to a crossing — clear soon
      const gap = other.progressOnEdge - pos
      if (gap > -LANE_CHANGE_CLEAR_REAR && gap < LANE_CHANGE_CLEAR_FRONT) return false
    }
    return true
  }

  /**
   * Lateral offset (m) applied to the edge centreline while a lane change is
   * in progress. Uses a smoothstep profile so the lateral acceleration is zero
   * at the start and end of the manoeuvre.
   */
  private laneChangeLateral(v: Vehicle, progress: number): number {
    const lc = v.laneChange
    if (!lc) return 0
    const total = (lc.toLaneIndex - lc.fromLaneIndex) * this.network.laneSpacing
    if (total === 0) return 0
    const f = Math.min(Math.max((progress - lc.startProgress) / lc.length, 0), 1)
    const s = f * f * (3 - 2 * f)
    return total * s
  }

  /** Finish a lane change once the manoeuvre distance has been covered. */
  private completeLaneChange(v: Vehicle, edge: RoadEdge): void {
    const lc = v.laneChange
    if (!lc) return
    if (v.progressOnEdge - lc.startProgress < lc.length) return
    const target = this.network.adjacentLane(edge, lc.toLaneIndex - lc.fromLaneIndex)
    if (target) {
      v.currentEdge = target.id
      v.currentRoad = target.road
      v.lane = target.laneOffset
    }
    v.laneChange = null
  }

  /** The path a vehicle will take: turn curve samples + exit lane preview. */
  private turnPathPreview(
    turn: TurnCurve,
    exitEdge: RoadEdge | undefined
  ): Array<{ x: number; z: number; arc: number }> {
    const path: Array<{ x: number; z: number; arc: number }> = []
    for (const s of turn.samples) path.push({ x: s.x, z: s.z, arc: s.arc })
    if (exitEdge) {
      const base = turn.length
      for (let d = 2; d <= EXIT_BLOCK_DIST + 3; d += 2) {
        const p = this.network.pointOnEdge(exitEdge, d)
        path.push({ x: p.x, z: p.z, arc: base + d })
      }
    }
    return path
  }

  /**
   * Distance of a point to a polyline and the arc coordinate of the closest
   * point. Returns null for an empty path.
   */
  private closestOnPath(
    p: { x: number; z: number },
    path: Array<{ x: number; z: number; arc: number }>
  ): { dist: number; arc: number } | null {
    if (path.length < 2) return null
    let bestDist = Infinity
    let bestArc = Infinity
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]
      const b = path[i + 1]
      const abx = b.x - a.x
      const abz = b.z - a.z
      const segLen = Math.hypot(abx, abz)
      if (segLen < 1e-9) continue
      let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / (segLen * segLen)
      t = Math.max(0, Math.min(1, t))
      const cx = a.x + abx * t
      const cz = a.z + abz * t
      const d = Math.hypot(p.x - cx, p.z - cz)
      if (d < bestDist) {
        bestDist = d
        bestArc = a.arc + segLen * t
      }
    }
    return { dist: bestDist, arc: bestArc }
  }

  /** Smallest signed angle difference (radians) between two headings. */
  private angleDiff(a: number, b: number): number {
    let d = a - b
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    return Math.abs(d)
  }

  /* ------------------------------------------------------------------ *
   * Collision handling (safety net with dedup)
   * ------------------------------------------------------------------ */

  private pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }

  /** Mark a vehicle as involved in a collision: stop it, schedule removal. */
  private markInvolved(v: Vehicle): void {
    if (v.status === 'involved') return
    v.status = 'involved'
    v.speed = 0
    v.targetSpeed = 0
    v.acceleration = 0
    v.braking = 0
    v.velocity = { x: 0, z: 0 }
    v.holdTimer = INVOLVED_HOLD_SECONDS
  }

  /**
   * Resolve actual overlaps — the avoidance model should prevent these, but
   * this is the safety net. Each pair is reported at most once per cooldown
   * window and the vehicles are marked 'involved' (stopped, then removed), so
   * a collision can never generate repeated events, leave vehicles stuck on
   * the road, or spawn duplicate accidents.
   */
  private handleCollisions(result: SimStepResult): void {
    if (this.vehicles.size < 2) return
    const moving: Vehicle[] = []
    for (const v of this.vehicles.values()) {
      if (v.status !== 'moving' && v.status !== 'spawning') continue
      if (this.suspended.has(v.id)) continue
      moving.push(v)
    }
    if (moving.length < 2) return

    const handled = new Set<string>()
    for (const a of moving) {
      const pa = this.vehiclePosition(a)
      for (const otherId of this.gridCandidates(pa.x, pa.z, COLLISION_THRESHOLD)) {
        const b = this.vehicles.get(otherId)
        if (!b || b.id === a.id) continue
        if (b.status !== 'moving' && b.status !== 'spawning') continue
        if (this.suspended.has(b.id)) continue
        const key = this.pairKey(a.id, b.id)
        if (handled.has(key)) continue
        const pb = this.vehiclePosition(b)
        const d = Math.hypot(pa.x - pb.x, pa.z - pb.z)
        if (d > COLLISION_THRESHOLD) continue

        handled.add(key)
        // Dedup: this pair is already on cooldown → never re-report.
        if (this.collidedPairs.has(key)) continue

        this.collidedPairs.set(key, this.tickCount + COLLISION_COOLDOWN_TICKS)
        this.markInvolved(a)
        this.markInvolved(b)
        result.collisions.push({ a, b, ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z, distance: d })
      }
    }

    // Prune expired cooldowns periodically.
    if (this.tickCount % 600 === 0) {
      for (const [key, until] of this.collidedPairs) {
        if (until < this.tickCount) this.collidedPairs.delete(key)
      }
    }
  }

  private advance(v: Vehicle, dt: number, result: SimStepResult): void {
    // Validate the current edge even when the vehicle is stationary, so a
    // corrupted route is never silently "stuck".
    if (!this.network.getEdge(v.currentEdge ?? '') && !v.turn) {
      console.warn('[CRIS][SIM] INVALID EDGE', JSON.stringify(this.vehicleDebug(v)))
      this.markUnreachable(v)
      return
    }

    // A vehicle in the middle of a turn moves along the curve; when it reaches
    // the end it continues onto the next edge with the leftover distance.
    let remaining: number
    if (v.turn) {
      const curve = v.turn!
      v.turnDist += v.speed * dt
      if (v.turnDist < curve.length) {
        this.updateTurnPosition(v, dt)
        return
      }
      remaining = v.turnDist - curve.length
      if (!this.finishTurn(v)) {
        // No valid exit edge (should not happen: the entry gate held the
        // vehicle at the stop line). Defensive fallback.
        this.markUnreachable(v)
        return
      }
    } else {
      remaining = v.speed * dt
    }

    let guard = 0
    while (remaining > 0 && v.status === 'moving' && guard++ < 64) {
      const edge = this.network.getEdge(v.currentEdge ?? '')
      if (!edge) {
        console.warn('[CRIS][SIM] INVALID EDGE', JSON.stringify(this.vehicleDebug(v)))
        this.markUnreachable(v)
        break
      }
      const toEnd = edge.length - v.progressOnEdge
      if (remaining <= toEnd) {
        v.progressOnEdge += remaining
        this.updatePosition(v, edge, dt)
        this.completeLaneChange(v, edge)
        break
      }
      remaining -= toEnd
      v.progressOnEdge = edge.length
      this.updatePosition(v, edge, dt)

      const nextIdx = v.routeIndex + 1
      if (nextIdx >= v.route.length - 1) {
        // Destination node reached: stop the vehicle where it stands.
        v.previousNode = v.currentNode
        v.currentNode = v.route[nextIdx]
        v.routeIndex = nextIdx
        v.status = 'arrived'
        v.phase = 'arrived'
        v.speed = 0
        v.targetSpeed = 0
        v.velocity = { x: 0, z: 0 }
        v.acceleration = 0
        v.braking = 0
        v.holdTimer = this.opts.arrivalHoldSeconds
        result.arrived.push(v)
        break
      }

      // Reached the stop line of an intermediate intersection. Commit to the
      // intersection: advance the node bookkeeping, then either start the turn
      // onto the next edge or — when the next edge is unavailable or blocked —
      // reroute AT the intersection (never mid-road).
      v.previousNode = v.currentNode
      v.currentNode = v.route[nextIdx]
      v.routeIndex = nextIdx

      const outNode = v.route[nextIdx + 1]
      // Resolve any lane change at the stop line: complete it when the
      // manoeuvre distance is already covered, otherwise abort (the vehicle
      // turns from the lane it is actually in — its current edge).
      if (v.laneChange) {
        this.completeLaneChange(v, edge)
        if (v.laneChange) v.laneChange = null
      }
      const approachEdge = this.network.getEdge(v.currentEdge ?? '') ?? edge
      // Departure lane for THIS turn: from the intersection node we just
      // advanced onto, toward the following node on the route.
      let outEdge = outNode ? this.departureLaneEdge(approachEdge, v.currentNode, outNode) : undefined
      if (!outEdge || this.blockedEdges.has(outEdge.id)) {
        this.rerouteVehicle(v)
        if (v.status !== 'moving') break
        const newOutNode = v.route[v.routeIndex + 1]
        outEdge = newOutNode ? this.departureLaneEdge(approachEdge, v.currentNode, newOutNode) : undefined
        if (!outEdge || this.blockedEdges.has(outEdge.id)) {
          this.markUnreachable(v)
          break
        }
      }

      // Traverse the turn curve with the leftover distance.
      const curve = this.network.buildTurnCurve(approachEdge, outEdge)
      v.turn = curve
      v.nextEdgeId = outEdge.id
      v.turnDist = Math.min(remaining, curve.length)
      remaining -= v.turnDist
      this.updateTurnPosition(v, dt)
      if (v.turnDist >= curve.length) {
        if (!this.finishTurn(v)) {
          this.markUnreachable(v)
          break
        }
      }
      // Loop continues onto the next edge with any remaining distance.
    }
  }

  /**
   * Smoothly interpolate the vehicle heading toward the path direction while
   * traversing an edge.
   */
  private updatePosition(v: Vehicle, edge: RoadEdge, dt: number): void {
    const p = this.network.pointOnEdge(edge, v.progressOnEdge)
    const targetHeading = this.pathHeading(edge, v.progressOnEdge)
    // Lateral offset while changing lanes (else 0).
    const lat = this.laneChangeLateral(v, v.progressOnEdge)
    const dir = this.network.edgeDirection(edge)
    v.x = p.x - dir.z * lat
    v.z = p.z + dir.x * lat
    v.heading = this.dampHeading(v.heading, targetHeading, HEADING_TURN_RATE, dt)
    v.velocity = {
      x: Math.sin(v.heading) * v.speed,
      z: Math.cos(v.heading) * v.speed,
    }
  }

  /** Position / heading while traversing a turn curve. */
  private updateTurnPosition(v: Vehicle, dt: number): void {
    const curve = v.turn!
    const p = this.network.turnPoint(curve, v.turnDist)
    v.x = p.x
    v.z = p.z
    v.heading = this.dampHeading(v.heading, p.h, HEADING_TURN_RATE, dt)
    v.velocity = {
      x: Math.sin(v.heading) * v.speed,
      z: Math.cos(v.heading) * v.speed,
    }
  }

  /**
   * Finish the current turn: move the vehicle onto the departure edge.
   * Returns false when the exit edge is missing or blocked (should not happen
   * — the entry gate never lets a vehicle commit to a crossing it cannot
   * leave).
   */
  private finishTurn(v: Vehicle): boolean {
    const outNode = v.route[v.routeIndex + 1]
    const outEdge = v.nextEdgeId ? this.network.getEdge(v.nextEdgeId) : undefined
    const fallback = !outEdge && outNode ? this.network.edgeBetween(v.currentNode, outNode) : undefined
    const landed = outEdge ?? fallback
    if (!landed || this.blockedEdges.has(landed.id)) {
      v.nextEdgeId = null
      return false
    }
    v.currentEdge = landed.id
    v.currentRoad = landed.road
    v.lane = landed.laneOffset
    v.progressOnEdge = 0
    v.turn = null
    v.turnDist = 0
    v.nextEdgeId = null
    v.laneChange = null
    return true
  }

  /** Direction (radians) of the polyline segment at distance `d` along it. */
  private pathHeading(edge: RoadEdge, d: number): number {
    const clamped = Math.min(Math.max(d, 0), edge.length)
    let i = 0
    for (let k = 0; k < edge.cum.length - 1; k++) {
      if (clamped >= edge.cum[k] && clamped <= edge.cum[k + 1]) {
        i = k
        break
      }
    }
    // At the very end of an edge, keep the direction of the final segment
    // instead of degrading to a zero vector.
    if (clamped >= edge.length - 1e-9 && edge.cum.length >= 2) {
      i = edge.cum.length - 2
    }
    const [ax, az] = edge.pts[i]
    const [bx, bz] = edge.pts[i + 1]
    return Math.atan2(bx - ax, bz - az)
  }

  private dampHeading(current: number, target: number, rate: number, dt: number): number {
    let diff = target - current
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    const t = 1 - Math.exp(-rate * dt)
    return current + diff * t
  }

  private updatePhase(v: Vehicle): void {
    if (v.status === 'arrived') {
      v.phase = 'arrived'
      return
    }
    if (v.status !== 'moving') return
    if (v.turn !== null) {
      v.phase = 'intersection'
      return
    }
    const edge = this.network.getEdge(v.currentEdge ?? '')
    if (!edge) return
    const remaining = Math.max(edge.length - v.progressOnEdge, 0)
    const nextNode = v.route[v.routeIndex + 1]
    if (nextNode === v.destinationNode) {
      v.phase = 'destination'
      return
    }
    // Within braking range of the next intersection the vehicle is in its
    // intersection approach phase.
    const threshold = (v.targetSpeed * v.targetSpeed - CORNER_SPEED * CORNER_SPEED) / (2 * BRAKE_DECELERATION)
    v.phase = remaining <= threshold ? 'intersection' : 'road'
  }

  /**
   * Recompute a route from the vehicle's CURRENT node (not its start).
   *
   * - Never goes back to the node the vehicle came from (unless the road
   *   network requires a U-turn).
   * - Preserves progress when the new route starts with the edge the vehicle
   *   is already on, so the vehicle never jumps backwards.
   */
  rerouteVehicle(v: Vehicle): void {
    const from = v.currentNode
    const to = v.destinationNode
    const avoidFirstStep = v.previousNode ?? undefined
    const route = findRoute(this.network, from, to, this.blockedEdges, { avoidFirstStep })
    if (!route || route.length < 2) {
      this.markUnreachable(v)
      return
    }
    const problems = validateRoute(this.network, route, this.blockedEdges)
    if (problems.length > 0) {
      console.warn('[CRIS][SIM] ROUTE VALIDATION FAILED', problems, this.vehicleDebug(v))
      this.markUnreachable(v)
      return
    }
    const firstEdge = this.network.edgeBetween(route[0], route[1])
    if (!firstEdge) {
      this.markUnreachable(v)
      return
    }

    // Bounded reroute churn: every reroute counts, identical forced reroutes
    // count too, so a vehicle can never regenerate routes indefinitely.
    v.rerouteCount += 1
    if (v.rerouteCount > this.opts.maxReroutes) {
      this.markUnreachable(v)
      return
    }

    const atEdgeEnd = (() => {
      if (!v.currentEdge) return false
      const e = this.network.getEdge(v.currentEdge)
      return e ? v.progressOnEdge >= e.length - 1e-6 : false
    })()

    v.route = route
    v.routeIndex = 0
    v.currentNode = from
    v.recentNodes = [from]
    v.totalDistance = 0
    v.stalledTicks = 0
    v.status = 'moving'
    v.phase = 'route_calculated'

    // A reroute while committing to (or inside) a crossing is cancelled: the
    // vehicle returns to the stop line of `from` and merges onto the new route
    // through the normal turn logic. In-progress lane changes are cancelled too
    // (the vehicle may be reassigned to a different lane edge below).
    if (v.turn !== null) {
      v.turn = null
      v.turnDist = 0
    }
    v.laneChange = null
    v.nextEdgeId = null

    // If the new route begins with the edge we are already travelling on,
    // keep our position on it (no backward jump / teleport).
    if (firstEdge.id === v.currentEdge) {
      // progressOnEdge is preserved.
      return
    }
    // Same road segment but a different lane: stay at the same progress — the
    // lanes are parallel and share the same length.
    const oldEdge = this.network.getEdge(v.currentEdge ?? '')
    if (oldEdge && firstEdge.from === oldEdge.from && firstEdge.to === oldEdge.to) {
      v.currentEdge = firstEdge.id
      v.currentRoad = firstEdge.road
      v.lane = firstEdge.laneOffset
      return
    }
    // If the vehicle is at the stop line of `from`, keep the incoming edge:
    // advance() will start the turn onto the new route's first edge from here
    // instead of teleporting the vehicle into its lane.
    if (atEdgeEnd) {
      return
    }
    v.currentEdge = firstEdge.id
    v.progressOnEdge = 0
    v.currentRoad = firstEdge.road
    v.lane = firstEdge.laneOffset
  }

  private markUnreachable(v: Vehicle): void {
    if (v.status === 'unreachable') return
    console.warn('[CRIS][SIM] VEHICLE CANNOT REACH DESTINATION', JSON.stringify(this.vehicleDebug(v)))
    v.status = 'unreachable'
    v.holdTimer = this.opts.unreachableHoldSeconds
    v.laneChange = null
    v.nextEdgeId = null
  }

  /* ------------------------------------------------------------------ *
   * Queries used by the visual layer
   * ------------------------------------------------------------------ */

  /** World position of a vehicle (on its edge, or on its turn curve). */
  vehiclePosition(v: Vehicle): { x: number; z: number } {
    if (v.turn) {
      const p = this.network.turnPoint(v.turn, v.turnDist)
      return { x: p.x, z: p.z }
    }
    if (v.currentEdge) {
      const edge = this.network.getEdge(v.currentEdge)
      if (edge) {
        const p = this.network.pointOnEdge(edge, v.progressOnEdge)
        const lat = this.laneChangeLateral(v, v.progressOnEdge)
        if (lat !== 0) {
          const dir = this.network.edgeDirection(edge)
          p.x -= dir.z * lat
          p.z += dir.x * lat
        }
        return p
      }
    }
    return { x: v.x, z: v.z }
  }

  /** Vehicles within `radius` of a point, nearest first. */
  findVehiclesNear(x: number, z: number, radius: number): Vehicle[] {
    const near: Array<{ vehicle: Vehicle; d: number }> = []
    for (const v of this.vehicles.values()) {
      if (v.status === 'removed' || v.status === 'arrived' || v.status === 'unreachable') continue
      const p = this.vehiclePosition(v)
      const dx = p.x - x
      const dz = p.z - z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d <= radius) near.push({ vehicle: v, d })
    }
    near.sort((a, b) => a.d - b.d)
    return near.map((o) => o.vehicle)
  }

  /** Actual-position based collision detection (accident conditions). */
  detectCollisions(threshold = 2.6): CollisionCandidate[] {
    const moving = this.getActiveVehicles().filter((v) => v.status === 'moving')
    if (moving.length < 2) return []
    this.buildGrid()
    const candidates: CollisionCandidate[] = []
    const seen = new Set<string>()
    for (const a of moving) {
      const pa = this.vehiclePosition(a)
      for (const otherId of this.gridCandidates(pa.x, pa.z, threshold)) {
        const b = this.vehicles.get(otherId)
        if (!b || b.id === a.id || b.status !== 'moving') continue
        const key = this.pairKey(a.id, b.id)
        if (seen.has(key)) continue
        const pb = this.vehiclePosition(b)
        const d = Math.sqrt((pa.x - pb.x) ** 2 + (pa.z - pb.z) ** 2)
        if (d <= threshold) {
          seen.add(key)
          candidates.push({ a, b, ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z, distance: d })
        }
      }
    }
    return candidates
  }

  vehicleDebug(v: Vehicle): VehicleDebugInfo {
    const p = this.vehiclePosition(v)
    return {
      id: v.id,
      current_node: v.currentNode,
      destination_node: v.destinationNode,
      route: v.route,
      route_index: v.routeIndex,
      current_edge: v.currentEdge,
      current_road: v.currentRoad,
      lane: v.lane,
      progress_on_edge: Number(v.progressOnEdge.toFixed(3)),
      speed: Number(v.speed.toFixed(3)),
      target_speed: Number(v.targetSpeed.toFixed(3)),
      velocity_x: Number(v.velocity.x.toFixed(3)),
      velocity_z: Number(v.velocity.z.toFixed(3)),
      acceleration: Number(v.acceleration.toFixed(3)),
      braking: Number(v.braking.toFixed(3)),
      status: v.status,
      phase: v.phase,
      x: Number(p.x.toFixed(3)),
      z: Number(p.z.toFixed(3)),
      heading: Number(v.heading.toFixed(4)),
      stalled_ticks: v.stalledTicks,
      reroute_count: v.rerouteCount,
      turn_type: v.turn ? v.turn.type : null,
      turn_progress: v.turn ? Number(v.turnDist.toFixed(3)) : null,
    }
  }

  /** Temporary diagnostic dump for all active vehicles. */
  debugAll(): VehicleDebugInfo[] {
    return this.getActiveVehicles().map((v) => this.vehicleDebug(v))
  }

  /**
   * Current global signal phases (observability/validation helper). All
   * intersections are synchronized on the same cycle: vertical roads
   * (road-x) and horizontal roads (road-z) alternate green, so this reflects
   * the phase at every intersection at the current tick.
   */
  lightDebug(): {
    tick: number
    nodes: Array<{
      node: string
      vertical: 'red' | 'yellow' | 'green'
      horizontal: 'red' | 'yellow' | 'green'
    }>
  } {
    const nodes: Array<{
      node: string
      vertical: 'red' | 'yellow' | 'green'
      horizontal: 'red' | 'yellow' | 'green'
    }> = []
    for (const node of this.network.nodes.values()) {
      nodes.push({
        node: node.id,
        vertical: this.signalPhase(node.id, true),
        horizontal: this.signalPhase(node.id, false),
      })
    }
    return { tick: this.tickCount, nodes }
  }
}
