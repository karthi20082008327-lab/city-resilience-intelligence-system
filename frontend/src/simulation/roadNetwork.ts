import type { RoadEdge, RoadNode, TurnCurve, TurnType } from './types'

/**
 * Directed road graph for the CRIS 3D city.
 *
 * The city is a rectangular grid of roads (ROADS_X run vertically / along Z,
 * ROADS_Z run horizontally / along X). Intersections become nodes. Each road
 * segment between adjacent intersections becomes two directed **lane edges**
 * (one per driving direction). Lanes are straight segments offset to the
 * RIGHT side of the direction of travel (right-hand traffic), so opposing
 * traffic never shares a lane:
 *
 *   - eastbound  → south side (z + lane)
 *   - westbound  → north side (z - lane)
 *   - northbound → east side (x + lane)
 *   - southbound → west side (x - lane)
 *
 * An edge runs from the "commit point" just past its origin intersection to
 * the stop line just before its destination intersection. The connection
 * across an intersection is not part of the edge — it is a **turn curve**
 * (see `buildTurnCurve`), a smooth Bézier from the approach stop line to the
 * departure lane start whose shape depends on the manoeuvre (left / right /
 * straight). This keeps vehicles on their own lane instead of funnelling them
 * through the node centre.
 */

export interface GridNetworkOptions {
  xs?: number[]
  zs?: number[]
  laneOffset?: number
  /**
   * Number of lanes per driving direction (default 1). With `lanes` lanes the
   * lane centres are placed at `laneOffset · (2·li + 1) / lanes` for lane
   * index li (innermost = 0), so `lanes: 1` reproduces the classic single-lane
   * layout exactly and `lanes: 2` places lanes at ½ and ³⁄₂ of `laneOffset`.
   */
  lanes?: number
  /**
   * Distance from an intersection centre to the stop line / commit point.
   * Every lane is the straight section between the two stop lines of its
   * endpoints, so it must be smaller than half the smallest grid spacing.
   */
  stopLineDist?: number
}

export function nodeKey(x: number, z: number): string {
  return `${x},${z}`
}

export function edgeKey(from: string, to: string): string {
  return `${from}->${to}`
}

function segmentLength(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  return Math.sqrt(dx * dx + dz * dz)
}

/** Right-side normal of a heading: for (dx, dz) it is (-dz, dx). */
export function rightNormal(dx: number, dz: number): { x: number; z: number } {
  return { x: -dz, z: dx }
}

/** Number of parametric samples used to discretise a turn curve. */
const TURN_SAMPLES = 16
/** Comfortable lateral acceleration used to limit corner speed (m/s²). */
const TURN_LATERAL_ACCEL = 3.2

function wrapToPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

export class RoadNetwork {
  readonly nodes: Map<string, RoadNode> = new Map()
  readonly edges: Map<string, RoadEdge> = new Map()
  /** node id -> edge ids leaving that node */
  readonly outgoing: Map<string, string[]> = new Map()

  private readonly laneOffset: number
  private readonly lanesPerDirection: number
  private readonly stopLineDist: number
  /** inEdge.id -> outEdge.id -> cached turn curve. */
  private readonly turnCache = new Map<string, TurnCurve>()

  constructor(opts: GridNetworkOptions = {}) {
    const xs = opts.xs ?? [-20, 0, 20]
    const zs = opts.zs ?? [-20, 0, 20]
    this.laneOffset = opts.laneOffset ?? 2.2
    this.lanesPerDirection = opts.lanes ?? 1
    this.stopLineDist = opts.stopLineDist ?? 4.5

    // Intersections = nodes
    for (const x of xs) {
      for (const z of zs) {
        const id = nodeKey(x, z)
        this.nodes.set(id, { id, x, z })
        this.outgoing.set(id, [])
      }
    }

    // Horizontal roads (constant z, running along X)
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i]
      const x1 = xs[i + 1]
      for (const z of zs) {
        // eastbound: right side is south (z + lane)
        this.addDirectedEdge(nodeKey(x0, z), nodeKey(x1, z))
        // westbound: right side is north (z - lane)
        this.addDirectedEdge(nodeKey(x1, z), nodeKey(x0, z))
      }
    }

    // Vertical roads (constant x, running along Z)
    for (let j = 0; j < zs.length - 1; j++) {
      const z0 = zs[j]
      const z1 = zs[j + 1]
      for (const x of xs) {
        // southbound: right side is west (x - lane)
        this.addDirectedEdge(nodeKey(x, z0), nodeKey(x, z1))
        // northbound: right side is east (x + lane)
        this.addDirectedEdge(nodeKey(x, z1), nodeKey(x, z0))
      }
    }
  }

  private addDirectedEdge(from: string, to: string): void {
    const fromNode = this.nodes.get(from)!
    const toNode = this.nodes.get(to)!

    // Unit direction of travel and right-side lane offset (right-hand traffic).
    const dx = toNode.x - fromNode.x
    const dz = toNode.z - fromNode.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-9) throw new Error(`degenerate edge ${from}->${to}`)
    const ndx = dx / len
    const ndz = dz / len
    const right = rightNormal(ndx, ndz)

    // Stable road id and signed lane offset (positive = south for horizontal
    // roads, east for vertical roads, so northbound is + and southbound is -).
    const horizontal = fromNode.z === toNode.z
    const road = horizontal ? `road-z${fromNode.z}` : `road-x${fromNode.x}`
    const directionSign = horizontal
      ? dz === 0 && toNode.x > fromNode.x
        ? 1
        : -1
      : dx === 0 && toNode.z < fromNode.z
        ? 1
        : -1

    // One parallel lane edge per lane index (lane 0 = innermost). Lane ids keep
    // the classic `from->to` form for lane 0 and suffix additional lanes, so
    // existing single-lane code keeps working unchanged. The edge points sit on
    // the RIGHT side of travel (right-hand traffic); the `laneOffset` field is
    // the signed offset (positive = south for horizontal roads, east for
    // vertical roads).
    for (let li = 0; li < this.lanesPerDirection; li++) {
      const lanePos = this.lanePosition(li)
      const offX = right.x * lanePos
      const offZ = right.z * lanePos

      // Lane centre line: from the commit point (just past `from`) to the stop
      // line (just before `to`), offset to the right of travel.
      const startX = fromNode.x + ndx * this.stopLineDist + offX
      const startZ = fromNode.z + ndz * this.stopLineDist + offZ
      const endX = toNode.x - ndx * this.stopLineDist + offX
      const endZ = toNode.z - ndz * this.stopLineDist + offZ

      const pts: Array<[number, number]> = [
        [startX, startZ],
        [endX, endZ],
      ]
      const cum = [0, segmentLength(startX, startZ, endX, endZ)]
      const id = li === 0 ? edgeKey(from, to) : `${edgeKey(from, to)}#L${li}`

      const edge: RoadEdge = {
        id,
        from,
        to,
        road,
        laneOffset: directionSign * lanePos,
        laneIndex: li,
        pts,
        cum,
        length: cum[cum.length - 1],
      }
      this.edges.set(id, edge)
      this.outgoing.get(from)?.push(id)
    }
  }

  /**
   * Distance of lane centre `li` from the road centreline (right-hand side),
   * using the classic single-lane offset as the baseline: with `lanes` lanes
   * the centres sit at `laneOffset · (2·li + 1) / lanes`.
   */
  private lanePosition(li: number): number {
    return (this.laneOffset * (2 * li + 1)) / this.lanesPerDirection
  }

  /** Distance between adjacent lane centres (world units). */
  get laneSpacing(): number {
    return this.lanesPerDirection <= 1
      ? 0
      : (2 * this.laneOffset) / this.lanesPerDirection
  }

  getNode(id: string): RoadNode | undefined {
    return this.nodes.get(id)
  }

  /**
   * Common spacing between adjacent roads on the grid (used e.g. to derive a
   * per-intersection signal-phase offset). Falls back to 20 when the grid has
   * fewer than two distinct coordinates.
   */
  gridStep(): number {
    const xs = Array.from(new Set(Array.from(this.nodes.values()).map((n) => n.x))).sort(
      (a, b) => a - b
    )
    return xs.length > 1 ? xs[1] - xs[0] : 20
  }

  getEdge(id: string): RoadEdge | undefined {
    return this.edges.get(id)
  }

  edgeBetween(from: string, to: string, laneIndex = 0): RoadEdge | undefined {
    if (laneIndex === 0) return this.edges.get(edgeKey(from, to))
    return this.edges.get(`${edgeKey(from, to)}#L${laneIndex}`)
  }

  /** Every lane edge between two adjacent nodes (lane 0 … lanes-1). */
  laneEdges(from: string, to: string): RoadEdge[] {
    const out: RoadEdge[] = []
    for (let li = 0; li < this.lanesPerDirection; li++) {
      const e = this.edgeBetween(from, to, li)
      if (e) out.push(e)
    }
    return out
  }

  /** Number of lanes between two adjacent nodes (0 when not adjacent). */
  laneCount(from: string, to: string): number {
    return this.laneEdges(from, to).length
  }

  /** The lane edge `delta` lanes over from `edge` on the same road segment. */
  adjacentLane(edge: RoadEdge, delta: number): RoadEdge | undefined {
    const target = edge.laneIndex + delta
    if (target < 0 || target >= this.lanesPerDirection) return undefined
    return this.edgeBetween(edge.from, edge.to, target)
  }

  outgoingEdges(nodeId: string): RoadEdge[] {
    const ids = this.outgoing.get(nodeId) ?? []
    const out: RoadEdge[] = []
    for (const id of ids) {
      const e = this.edges.get(id)
      if (e) out.push(e)
    }
    return out
  }

  neighborNodes(nodeId: string): string[] {
    return this.outgoingEdges(nodeId).map((e) => e.to)
  }

  allNodeIds(): string[] {
    return Array.from(this.nodes.keys())
  }

  allEdgeIds(): string[] {
    return Array.from(this.edges.keys())
  }

  get nodeCount(): number {
    return this.nodes.size
  }

  get edgeCount(): number {
    return this.edges.size
  }

  /** Unit vector of travel direction of an edge (from its endpoints). */
  edgeDirection(edge: RoadEdge): { x: number; z: number } {
    const [ax, az] = edge.pts[0]
    const [bx, bz] = edge.pts[edge.pts.length - 1]
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    if (len < 1e-12) return { x: 0, z: 0 }
    return { x: dx / len, z: dz / len }
  }

  /** World position of the start (commit point) of an edge. */
  edgeStartPoint(edge: RoadEdge): { x: number; z: number } {
    const [x, z] = edge.pts[0]
    return { x, z }
  }

  /** World position of the end (stop line) of an edge. */
  edgeEndPoint(edge: RoadEdge): { x: number; z: number } {
    const pts = edge.pts
    const [x, z] = pts[pts.length - 1]
    return { x, z }
  }

  /** Position (x, z) at distance `d` along an edge. */
  pointOnEdge(edge: RoadEdge, d: number): { x: number; z: number } {
    const clamped = Math.min(Math.max(d, 0), edge.length)
    let i = 0
    for (let k = 0; k < edge.cum.length - 1; k++) {
      if (clamped >= edge.cum[k] && clamped <= edge.cum[k + 1]) {
        i = k
        break
      }
    }
    const segLen = edge.cum[i + 1] - edge.cum[i]
    const t = segLen > 0 ? (clamped - edge.cum[i]) / segLen : 0
    const [ax, az] = edge.pts[i]
    const [bx, bz] = edge.pts[i + 1]
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t }
  }

  /** Midpoint of an edge (used to decide which roads an event blocks). */
  edgeMidpoint(edge: RoadEdge): { x: number; z: number } {
    return this.pointOnEdge(edge, edge.length / 2)
  }

  /**
   * The turn curve a vehicle follows when driving from `inEdge` (ending at an
   * intersection) onto `outEdge` (leaving it). Deterministic and cached per
   * (in, out) pair; two vehicles on the same turn share the same object, which
   * lets the engine detect same-curve followers by reference.
   */
  buildTurnCurve(inEdge: RoadEdge, outEdge: RoadEdge): TurnCurve {
    const key = `${inEdge.id}>${outEdge.id}`
    const cached = this.turnCache.get(key)
    if (cached) return cached

    const curve = this.computeTurnCurve(inEdge, outEdge)
    this.turnCache.set(key, curve)
    return curve
  }

  private computeTurnCurve(inEdge: RoadEdge, outEdge: RoadEdge): TurnCurve {
    const inDir = this.edgeDirection(inEdge)
    const outDir = this.edgeDirection(outEdge)
    const cross = inDir.x * outDir.z - inDir.z * outDir.x
    const dot = inDir.x * outDir.x + inDir.z * outDir.z

    let type: TurnType
    if (Math.abs(cross) < 0.2) {
      type = dot < -0.9 ? 'uturn' : 'straight'
    } else {
      type = cross > 0 ? 'right' : 'left'
    }

    const p0 = this.edgeEndPoint(inEdge)
    const p2 = this.edgeStartPoint(outEdge)

    // Control point: intersection of the two lane centre lines (the inside
    // corner). For parallel lanes (straight / u-turn) use the midpoint.
    const p1 = this.laneLineIntersection(p0, inDir, p2, outDir) ?? {
      x: (p0.x + p2.x) / 2,
      z: (p0.z + p2.z) / 2,
    }

    // Sample the quadratic Bézier B(t) = (1-t)²P0 + 2(1-t)t P1 + t²P2.
    const samples = new Array<TurnCurve['samples'][number]>(TURN_SAMPLES + 1)
    let maxCurv = 0
    let prev: { x: number; z: number } | null = null
    let arc = 0
    for (let i = 0; i <= TURN_SAMPLES; i++) {
      const t = i / TURN_SAMPLES
      const mt = 1 - t
      const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x
      const z = mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z
      const d1x = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
      const d1z = 2 * mt * (p1.z - p0.z) + 2 * t * (p2.z - p1.z)
      const d2x = 2 * (p0.x - 2 * p1.x + p2.x)
      const d2z = 2 * (p0.z - 2 * p1.z + p2.z)
      const h = Math.atan2(d1x, d1z)
      const speedSq = d1x * d1x + d1z * d1z
      if (speedSq > 1e-9) {
        const curv = Math.abs(d1x * d2z - d1z * d2x) / Math.pow(speedSq, 1.5)
        if (curv > maxCurv) maxCurv = curv
      }
      if (prev) arc += Math.hypot(x - prev.x, z - prev.z)
      samples[i] = { t, arc, x, z, h }
      prev = { x, z }
    }

    const length = arc
    const maxSpeed =
      type === 'straight'
        ? Number.POSITIVE_INFINITY
        : maxCurv > 1e-9
          ? Math.sqrt(TURN_LATERAL_ACCEL / maxCurv)
          : Number.POSITIVE_INFINITY

    const curve: TurnCurve = {
      type,
      p0x: p0.x,
      p0z: p0.z,
      p1x: p1.x,
      p1z: p1.z,
      p2x: p2.x,
      p2z: p2.z,
      length,
      maxSpeed,
      samples,
    }
    return curve
  }

  private laneLineIntersection(
    p0: { x: number; z: number },
    a: { x: number; z: number },
    p2: { x: number; z: number },
    b: { x: number; z: number },
  ): { x: number; z: number } | null {
    // Solve p0 + s*a = p2 + t*b  <=>  s*a - t*b = p2 - p0
    const wx = p2.x - p0.x
    const wz = p2.z - p0.z
    const det = a.x * -b.z - -b.x * a.z
    if (Math.abs(det) < 1e-9) return null
    const s = (wx * -b.z - -b.x * wz) / det
    return { x: p0.x + s * a.x, z: p0.z + s * a.z }
  }

  /** Position (x, z) and tangent heading at arc distance `s` along a curve. */
  turnPoint(curve: TurnCurve, s: number): { x: number; z: number; h: number } {
    const samples = curve.samples
    const clamped = Math.min(Math.max(s, 0), curve.length)
    let i = 0
    for (let k = 0; k < samples.length - 1; k++) {
      if (clamped >= samples[k].arc && clamped <= samples[k + 1].arc) {
        i = k
        break
      }
    }
    if (clamped >= curve.length - 1e-9) i = samples.length - 2
    const a = samples[i]
    const b = samples[i + 1]
    const seg = b.arc - a.arc
    const f = seg > 0 ? (clamped - a.arc) / seg : 0
    return {
      x: a.x + (b.x - a.x) * f,
      z: a.z + (b.z - a.z) * f,
      h: a.h + wrapToPi(b.h - a.h) * f,
    }
  }

  /** Length of the shortest (by distance) route of the given node list. */
  routeLength(route: string[]): number {
    let total = 0
    for (let i = 0; i < route.length - 1; i++) {
      const e = this.edgeBetween(route[i], route[i + 1])
      if (e) total += e.length
    }
    return total
  }
}

/** Deterministic PRNG (mulberry32) so simulations are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}