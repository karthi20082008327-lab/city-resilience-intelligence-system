import { describe, it, expect } from 'vitest'
import {
  buildPedestrianWorld,
  findPath,
  edgeBetween,
  getNode,
  allNodeIds,
  SIDEWALK_OFFSET,
} from '../pedestrianWorld'
import { ROADS_X, ROADS_Z, ROAD_HALF_WIDTH, CITY_HALF } from '../../components/simulation/constants'

describe('pedestrian walkway graph', () => {
  const world = buildPedestrianWorld()

  it('builds the expected node/edge counts', () => {
    expect(world.nodes.size).toBe(ROADS_X.length * ROADS_Z.length * 8) // 200
    const counts = { sidewalk: 0, corner: 0, crosswalk: 0 }
    for (const e of world.edges) counts[e.kind]++
    // per intersection: 8 corner ring + 2 crosswalks
    expect(counts.corner).toBe(ROADS_X.length * ROADS_Z.length * 8)
    expect(counts.crosswalk).toBe(ROADS_X.length * ROADS_Z.length * 2)
    // sidewalk lines: 4 lines per road (2 sides x 2 orientations), 4 segments each
    expect(counts.sidewalk).toBe(4 * ROADS_X.length * (ROADS_X.length - 1))
  })

  it('is fully connected', () => {
    const ids = allNodeIds(world)
    for (const id of ids) {
      expect(findPath(world, ids[0], id), `path to ${id}`).not.toBeNull()
    }
  })

  it('places all nodes on sidewalks, never inside the road or blocks', () => {
    const inRoad = (x: number, z: number): boolean =>
      ROADS_X.some((rx) => Math.abs(x - rx) < ROAD_HALF_WIDTH) &&
      ROADS_Z.some((rz) => Math.abs(z - rz) < ROAD_HALF_WIDTH)
    for (const node of world.nodes.values()) {
      expect(Math.abs(node.x)).toBeLessThanOrEqual(CITY_HALF)
      expect(Math.abs(node.z)).toBeLessThanOrEqual(CITY_HALF)
      expect(inRoad(node.x, node.z)).toBe(false)
      // Every node sits on a sidewalk line: SIDEWALK_OFFSET from a road
      // centreline in at least one axis (the other may be on the crossing).
      const dx = Math.min(...ROADS_X.map((r) => Math.abs(node.x - r)))
      const dz = Math.min(...ROADS_Z.map((r) => Math.abs(node.z - r)))
      const onXSidewalk = dx > ROAD_HALF_WIDTH && Math.abs(dx - SIDEWALK_OFFSET) < 1e-6
      const onZSidewalk = dz > ROAD_HALF_WIDTH && Math.abs(dz - SIDEWALK_OFFSET) < 1e-6
      expect(onXSidewalk || onZSidewalk, `node ${node.id}`).toBe(true)
    }
  })

  it('keeps non-crosswalk edges out of the road surface', () => {
    const inRoad = (x: number, z: number): boolean =>
      ROADS_X.some((rx) => Math.abs(x - rx) < ROAD_HALF_WIDTH) &&
      ROADS_Z.some((rz) => Math.abs(z - rz) < ROAD_HALF_WIDTH)
    for (const e of world.edges) {
      const a = world.nodes.get(e.a)!
      const b = world.nodes.get(e.b)!
      const mx = (a.x + b.x) / 2
      const mz = (a.z + b.z) / 2
      if (e.kind === 'crosswalk') {
        // A crosswalk must actually cross a road: midpoint inside the asphalt.
        expect(inRoad(mx, mz)).toBe(true)
      } else {
        expect(inRoad(mx, mz)).toBe(false)
      }
    }
  })

  it('creates exactly one crosswalk per road direction at each intersection', () => {
    for (const xi of ROADS_X) {
      for (const zj of ROADS_Z) {
        // Crossing the horizontal road (along Z) at x=xi: N<->S sidewalk nodes.
        const n = getNode(world, xi, zj - SIDEWALK_OFFSET)!
        const s = getNode(world, xi, zj + SIDEWALK_OFFSET)!
        expect(edgeBetween(world, n.id, s.id)?.kind).toBe('crosswalk')
        // Crossing the vertical road (along X) at z=zj: W<->E.
        const w = getNode(world, xi - SIDEWALK_OFFSET, zj)!
        const e = getNode(world, xi + SIDEWALK_OFFSET, zj)!
        expect(edgeBetween(world, w.id, e.id)?.kind).toBe('crosswalk')
      }
    }
  })

  it('routes across town with crosswalks when the destination demands it', () => {
    // From north of road z=-20 to south of road z=-20: the trip MUST cross
    // that road, so any path must use at least one crosswalk.
    const a = getNode(world, -20, -20 - SIDEWALK_OFFSET)!
    const b = getNode(world, 0, -20 + SIDEWALK_OFFSET)!
    const path = findPath(world, a.id, b.id)!
    let crosswalks = 0
    for (let i = 0; i < path.length - 1; i++) {
      if (edgeBetween(world, path[i], path[i + 1])!.kind === 'crosswalk') crosswalks++
    }
    expect(crosswalks).toBeGreaterThanOrEqual(1)
  })

  it('prefers walking around the perimeter when no crossing is needed', () => {
    const a = getNode(world, -40, -40 + SIDEWALK_OFFSET)!
    const b = getNode(world, 40, -40 + SIDEWALK_OFFSET)!
    const path = findPath(world, a.id, b.id)!
    // Same sidewalk line -> pure sidewalk/corner edges, no crosswalks.
    for (let i = 0; i < path.length - 1; i++) {
      expect(edgeBetween(world, path[i], path[i + 1])!.kind).not.toBe('crosswalk')
    }
  })
})
