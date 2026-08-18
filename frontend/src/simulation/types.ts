/**
 * Pure simulation types for the CRIS city traffic engine.
 *
 * The engine is intentionally free of THREE/React so it can be unit-tested
 * with deterministic inputs and reused by any visual layer.
 */

export type VehicleStatus =
  | 'spawning'
  | 'moving'
  | 'rerouting'
  | 'involved'
  | 'arrived'
  | 'unreachable'
  | 'removed'

/**
 * Simulation detail level, based on the distance from the current view focus.
 *
 *  - FULL    (NEAR):      full vehicle/NPC behaviour.
 *  - MEDIUM  (reduced):   reduced AI complexity (no lane changes, etc.).
 *  - FAR     (simplified): simplified movement (no signals / yields / turns).
 *  - MINIMAL (VERY FAR):  minimal simulation (position following only).
 */
export const DETAIL_LEVELS = {
  MINIMAL: 0,
  FAR: 1,
  MEDIUM: 2,
  FULL: 3,
} as const

export type SimDetailLevel = (typeof DETAIL_LEVELS)[keyof typeof DETAIL_LEVELS]

/** Radius thresholds (world units) for each level, lower bound per level. */
export const DETAIL_LOWER_BOUND: Record<SimDetailLevel, number> = {
  [DETAIL_LEVELS.MINIMAL]: 90,
  [DETAIL_LEVELS.FAR]: 55,
  [DETAIL_LEVELS.MEDIUM]: 30,
  [DETAIL_LEVELS.FULL]: 0,
}

/** Pedestrian AI update interval in ticks per level (full update every N ticks). */
export const PED_UPDATE_INTERVAL: Record<SimDetailLevel, number> = {
  [DETAIL_LEVELS.MINIMAL]: 8,
  [DETAIL_LEVELS.FAR]: 4,
  [DETAIL_LEVELS.MEDIUM]: 2,
  [DETAIL_LEVELS.FULL]: 1,
}

/** Vehicle AI update interval in ticks per level (full update every N ticks). */
export const VEH_UPDATE_INTERVAL: Record<SimDetailLevel, number> = {
  [DETAIL_LEVELS.MINIMAL]: 4,
  [DETAIL_LEVELS.FAR]: 2,
  [DETAIL_LEVELS.MEDIUM]: 1,
  [DETAIL_LEVELS.FULL]: 1,
}

/**
 * Fine-grained lifecycle phase of a vehicle trip.
 *
 * START → ROUTE CALCULATED → ROAD → INTERSECTION → NEXT ROAD →
 * DESTINATION → ARRIVED
 *
 * Short trips may legitimately skip intermediate phases (e.g. a route with a
 * single edge goes straight from `route_calculated` to `destination`).
 */
export type RoutePhase =
  | 'start'
  | 'route_calculated'
  | 'road'
  | 'intersection'
  | 'destination'
  | 'arrived'

/** A road intersection in the grid. */
export interface RoadNode {
  id: string
  x: number
  z: number
}

/**
 * A directed road segment between two adjacent nodes.
 * `pts` is a lane-offset polyline (x, z pairs) used for smooth cornering at
 * intersections; `cum` holds the cumulative length at each point.
 * `road` is the stable (undirected) road the edge belongs to and `laneOffset`
 * is the signed lane offset from the road centreline.
 */
export interface RoadEdge {
  id: string
  from: string
  to: string
  road: string
  laneOffset: number
  /** 0-based lane index within the direction (0 = innermost). */
  laneIndex: number
  pts: Array<[number, number]>
  cum: number[]
  length: number
}

/** 2D vector in the X/Z plane (heading · speed). */
export interface Vec2 {
  x: number
  z: number
}

/** Kind of turn performed at an intersection (driving on the right). */
export type TurnType = 'straight' | 'right' | 'left' | 'uturn'

/**
 * One sampled point of a turn curve: the quadratic Bézier is sampled at a
 * fixed number of parameters and the samples carry their arc length, so a
 * vehicle can advance by distance instead of by parameter (constant speed).
 */
export interface TurnCurveSample {
  /** Bézier parameter (0 at the approach stop line, 1 at the departure). */
  t: number
  /** Arc length from the curve start (world units). */
  arc: number
  x: number
  z: number
  /** Tangent heading in radians. */
  h: number
}

/**
 * Smooth curve a vehicle follows through an intersection: a quadratic Bézier
 * from the approach stop line (P0) to the departure lane start (P2), with the
 * control point (P1) at the intersection of the two lane centre lines. The
 * curve is tangent to both lanes, so a vehicle neither snaps its heading nor
 * cuts across the intersection: right turns hug the corner, left turns sweep
 * across the interior, and straight-through traffic stays in its lane.
 */
export interface TurnCurve {
  type: TurnType
  p0x: number
  p0z: number
  p1x: number
  p1z: number
  p2x: number
  p2z: number
  /** Total arc length of the curve (world units). */
  length: number
  /** Curvature-limited speed for the curve (world units / s; Infinity when straight). */
  maxSpeed: number
  samples: TurnCurveSample[]
}

/**
 * An in-progress lane change along a road edge: the vehicle's lateral position
 * interpolates from `fromLaneIndex` to `toLaneIndex` as it advances
 * `startProgress → startProgress + length` along the edge.
 */
export interface LaneChange {
  fromLaneIndex: number
  toLaneIndex: number
  startProgress: number
  length: number
}

/**
 * A vehicle that travels a deterministic route through the road network.
 *
 * Movement is kinematic and delta-time based: every tick the engine first
 * accelerates/brakes `speed` toward a `targetSpeed` (modified by upcoming
 * corners / the destination), then advances `progressOnEdge` by `speed * dt`.
 */
export interface Vehicle {
  id: string
  startNode: string
  destinationNode: string
  currentNode: string
  previousNode: string | null
  /** Node-id sequence from current position to destination. */
  route: string[]
  /** Index of `currentNode` inside `route`. */
  routeIndex: number
  /** Edge id currently being traversed (null when no valid edge exists). */
  currentEdge: string | null
  /** Stable road id the vehicle is currently driving on (e.g. "road-z-20"). */
  currentRoad: string | null
  /** Signed lane offset of the current edge (e.g. +2.2 / -2.2). */
  lane: number
  /** Distance travelled along `currentEdge` (world units). */
  progressOnEdge: number
  /** Current scalar speed in world units / second. */
  speed: number
  /** Desired cruise speed in world units / second. */
  targetSpeed: number
  /** Instantaneous velocity vector (heading · speed) in world units / second. */
  velocity: Vec2
  /** Longitudinal acceleration applied this tick (m/s², positive/negative). */
  acceleration: number
  /** Active braking force this tick (m/s², 0 when not braking). */
  braking: number
  /** Current heading in radians (smoothly interpolated along the path). */
  heading: number
  status: VehicleStatus
  /** Lifecycle phase (see RoutePhase). */
  phase: RoutePhase
  /** Seconds left before an arrived / unreachable vehicle is removed. */
  holdTimer: number
  /** Last computed world position (kept when no edge exists). */
  x: number
  z: number
  /** Simulation detail level (see SimDetailLevel). Set by the runtime. */
  detail: SimDetailLevel
  /** Total distance travelled since the route was last (re)computed. */
  totalDistance: number
  /** Consecutive ticks where the vehicle failed to advance while moving. */
  stalledTicks: number
  /** Number of times this vehicle has been rerouted. */
  rerouteCount: number
  /**
   * Node ids visited since the route was last (re)computed, newest last.
   * Used to detect unintended cycles (A → B → C → A).
   */
  recentNodes: string[]
  /**
   * Turn curve currently being traversed through an intersection, or null
   * when the vehicle is on a road edge. While `turn` is set, the position is
   * evaluated on the curve (`turnDist` along it) instead of the edge.
   */
  turn: TurnCurve | null
  /** Distance travelled along the current turn curve (world units). */
  turnDist: number
  /**
   * In-progress lane change on the current edge, or null when the vehicle is
   * not switching lanes. While set, the world position is laterally offset
   * from the edge centreline (see LaneChange).
   */
  laneChange: LaneChange | null
  /**
   * Id of the lane edge the current turn curve will land on, or null when the
   * vehicle is not committed to a turn. Used by finishTurn to rejoin the exact
   * departure lane the curve was built for.
   */
  nextEdgeId: string | null
}

/** Result of one engine.step(). */
export interface SimStepResult {
  arrived: Vehicle[]
  removed: Vehicle[]
  rerouted: Vehicle[]
  stalled: Vehicle[]
  /** Newly detected vehicle-to-vehicle collisions (deduplicated per pair). */
  collisions: CollisionCandidate[]
}

/** Collision candidate detected by the engine (actual positions). */
export interface CollisionCandidate {
  a: Vehicle
  b: Vehicle
  ax: number
  az: number
  bx: number
  bz: number
  distance: number
}

/** Debug snapshot of a vehicle (used for logging / diagnostics). */
export interface VehicleDebugInfo {
  id: string
  current_node: string
  destination_node: string
  route: string[]
  route_index: number
  current_edge: string | null
  current_road: string | null
  lane: number
  progress_on_edge: number
  speed: number
  target_speed: number
  velocity_x: number
  velocity_z: number
  acceleration: number
  braking: number
  status: VehicleStatus
  phase: RoutePhase
  x: number
  z: number
  heading: number
  stalled_ticks: number
  reroute_count: number
  /** Turn manoeuvre currently being traversed, or null. */
  turn_type: TurnType | null
  /** Distance travelled along the current turn curve, or null. */
  turn_progress: number | null
}
