import { ROADS_X, ROADS_Z, ROAD_HALF_WIDTH, SIDEWALK_WIDTH } from '../components/simulation/constants'

/**
 * Pedestrian walkway graph for the CRIS 3D city.
 *
 * Pedestrians are kept out of the road surface and out of building blocks by
 * constraining them to this graph. It is built from the same road/sidewalk
 * layout constants used by the visual city, so NPCs always walk on the
 * rendered sidewalks and cross the roads only at intersections:
 *
 *   - **sidewalk** edges run along a sidewalk centreline between
 *     consecutive intersections;
 *   - **corner** edges trace the four corners of each intersection, so a
 *     pedestrian can turn the corner without stepping into the road;
 *   - **crosswalk** edges run straight across a road from one sidewalk
 *     centreline to the opposite one (N↔S across a horizontal road,
 *     W↔E across a vertical road).
 *
 * All coordinates are world metres and the graph is tiny (~200 nodes), so
 * Dijkstra pathfinding is trivially cheap for every NPC.
 */

/** Sidewalk centreline offset from a road centreline. */
export const SIDEWALK_OFFSET = ROAD_HALF_WIDTH + SIDEWALK_WIDTH * 0.6

export type PedNodeKind = 'corner' | 'sidewalk'
export type PedEdgeKind = 'sidewalk' | 'corner' | 'crosswalk'

export interface PedNode {
  id: string
  kind: PedNodeKind
  x: number
  z: number
}

export interface PedEdge {
  id: string
  kind: PedEdgeKind
  a: string
  b: string
  /** world-space length in metres */
  len: number
}

export interface PedWorld {
  nodes: Map<string, PedNode>
  edges: PedEdge[]
  /** adjacency: nodeId -> edge indices */
  adj: Map<string, number[]>
}

function nodeId(x: number, z: number): string {
  return `${Math.round(x * 100)}_${Math.round(z * 100)}`
}

function edgeId(a: string, b: string): string {
  return `${a}|${b}`
}

/**
 * Build the walkway graph for the current city layout.
 * Deterministic: the graph depends only on the road/sidewalk constants.
 */
export function buildPedestrianWorld(): PedWorld {
  const nodes = new Map<string, PedNode>()
  const edgeIndex = new Map<string, number>()
  const edges: PedEdge[] = []
  const adj = new Map<string, number[]>()

  const addNode = (x: number, z: number, kind: PedNodeKind): string => {
    const id = nodeId(x, z)
    if (!nodes.has(id)) nodes.set(id, { id, kind, x, z })
    return id
  }

  const addEdge = (aId: string, bId: string, kind: PedEdgeKind): void => {
    const id = edgeId(aId, bId)
    const rev = edgeId(bId, aId)
    if (edgeIndex.has(id) || edgeIndex.has(rev)) return
    const a = nodes.get(aId)!
    const b = nodes.get(bId)!
    const edge: PedEdge = { id, kind, a: aId, b: bId, len: Math.hypot(b.x - a.x, b.z - a.z) }
    const idx = edges.length
    edges.push(edge)
    edgeIndex.set(id, idx)
    edgeIndex.set(rev, idx)
    ;(adj.get(aId) ?? adj.set(aId, []).get(aId)!).push(idx)
    ;(adj.get(bId) ?? adj.set(bId, []).get(bId)!).push(idx)
  }

  // Intersection nodes + perimeter + crosswalk edges.
  for (const xi of ROADS_X) {
    for (const zj of ROADS_Z) {
      const nw = addNode(xi - SIDEWALK_OFFSET, zj - SIDEWALK_OFFSET, 'corner')
      const ne = addNode(xi + SIDEWALK_OFFSET, zj - SIDEWALK_OFFSET, 'corner')
      const sw = addNode(xi - SIDEWALK_OFFSET, zj + SIDEWALK_OFFSET, 'corner')
      const se = addNode(xi + SIDEWALK_OFFSET, zj + SIDEWALK_OFFSET, 'corner')
      const n = addNode(xi, zj - SIDEWALK_OFFSET, 'sidewalk')
      const s = addNode(xi, zj + SIDEWALK_OFFSET, 'sidewalk')
      const w = addNode(xi - SIDEWALK_OFFSET, zj, 'sidewalk')
      const e = addNode(xi + SIDEWALK_OFFSET, zj, 'sidewalk')

      // Corner ring around the intersection.
      addEdge(n, ne, 'corner')
      addEdge(ne, e, 'corner')
      addEdge(e, se, 'corner')
      addEdge(se, s, 'corner')
      addEdge(s, sw, 'corner')
      addEdge(sw, w, 'corner')
      addEdge(w, nw, 'corner')
      addEdge(nw, n, 'corner')

      // Crosswalks across both roads at this intersection.
      addEdge(n, s, 'crosswalk') // across the horizontal road (along Z)
      addEdge(w, e, 'crosswalk') // across the vertical road (along X)
    }
  }

  // Sidewalk lines: connect the sidewalk nodes of adjacent intersections.
  for (const zj of ROADS_Z) {
    for (let i = 0; i < ROADS_X.length - 1; i++) {
      const x0 = ROADS_X[i]
      const x1 = ROADS_X[i + 1]
      // North sidewalk (z = zj - off).
      addEdge(nodeId(x0, zj - SIDEWALK_OFFSET), nodeId(x1, zj - SIDEWALK_OFFSET), 'sidewalk')
      // South sidewalk (z = zj + off).
      addEdge(nodeId(x0, zj + SIDEWALK_OFFSET), nodeId(x1, zj + SIDEWALK_OFFSET), 'sidewalk')
    }
  }
  for (const xi of ROADS_X) {
    for (let j = 0; j < ROADS_Z.length - 1; j++) {
      const z0 = ROADS_Z[j]
      const z1 = ROADS_Z[j + 1]
      // West sidewalk (x = xi - off).
      addEdge(nodeId(xi - SIDEWALK_OFFSET, z0), nodeId(xi - SIDEWALK_OFFSET, z1), 'sidewalk')
      // East sidewalk (x = xi + off).
      addEdge(nodeId(xi + SIDEWALK_OFFSET, z0), nodeId(xi + SIDEWALK_OFFSET, z1), 'sidewalk')
    }
  }

  return { nodes, edges, adj }
}

/** Dijkstra shortest path between two nodes (by length). */
export function findPath(world: PedWorld, from: string, to: string): string[] | null {
  if (from === to) return [from]
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  const visited = new Set<string>()
  const q = new Map<string, number>([[from, 0]])
  dist.set(from, 0)

  while (q.size > 0) {
    // Pick the cheapest unvisited node (graph is tiny; linear scan is fine).
    let cur: string | null = null
    let best = Infinity
    for (const [id, d] of q) {
      if (d < best) {
        best = d
        cur = id
      }
    }
    if (cur === null) break
    q.delete(cur)
    if (cur === to) break
    visited.add(cur)

    for (const ei of world.adj.get(cur) ?? []) {
      const edge = world.edges[ei]
      const next = edge.a === cur ? edge.b : edge.a
      if (visited.has(next)) continue
      const nd = best + edge.len
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd)
        prev.set(next, cur)
        q.set(next, nd)
      }
    }
  }

  if (!dist.has(to)) return null
  const path: string[] = []
  let cur: string | undefined = to
  while (cur !== undefined) {
    path.push(cur)
    cur = prev.get(cur)
  }
  path.reverse()
  return path
}

/** Node lookup by world coordinates (exact match). */
export function getNode(world: PedWorld, x: number, z: number): PedNode | undefined {
  return world.nodes.get(nodeId(x, z))
}

/** Find the (undirected) edge between two adjacent nodes. */
export function edgeBetween(world: PedWorld, a: string, b: string): PedEdge | undefined {
  for (const ei of world.adj.get(a) ?? []) {
    const edge = world.edges[ei]
    if ((edge.a === a && edge.b === b) || (edge.a === b && edge.b === a)) return edge
  }
  return undefined
}

/** All node ids. */
export function allNodeIds(world: PedWorld): string[] {
  return Array.from(world.nodes.keys())
}
