import * as THREE from 'three'

/**
 * Shared layout constants for the CRIS 3D city simulation.
 * The city is a 2x2 block grid with roads running along X and Z.
 */

export const ROAD_HALF_WIDTH = 5 // 4 lanes (2 each direction) => 10 wide
export const LANE_OFFSET = 2.2 // lane center distance from road centerline
export const SIDEWALK_WIDTH = 2.2
export const ROAD_Y = 0.02
export const CITY_HALF = 64

// Road centerlines
export const ROADS_X = [-40, -20, 0, 20, 40] // vertical roads (run along Z)
export const ROADS_Z = [-40, -20, 0, 20, 40] // horizontal roads (run along X)

export interface BlockDef {
  x0: number
  x1: number
  z0: number
  z1: number
  cx: number
  cz: number
}

// Blocks between road pairs
export function getBlocks(): BlockDef[] {
  const blocks: BlockDef[] = []
  for (let i = 0; i < ROADS_X.length - 1; i++) {
    for (let j = 0; j < ROADS_Z.length - 1; j++) {
      const x0 = ROADS_X[i]
      const x1 = ROADS_X[i + 1]
      const z0 = ROADS_Z[j]
      const z1 = ROADS_Z[j + 1]
      blocks.push({ x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 })
    }
  }
  return blocks
}

export const BLOCKS = getBlocks()

/* ---------------------------------------------------------------------------
 * Lane circuits (vehicle paths).
 * Right-hand traffic. A circuit loops around a block or around the city,
 * keeping each car in the correct lane with right turns at intersections.
 * ------------------------------------------------------------------------- */

function roundedRectCorners(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  r: number,
  samples = 5,
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const corners: [number, number][] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ]
  for (let c = 0; c < corners.length; c++) {
    const [cx, cz] = corners[c]
    const [px, pz] = corners[(c + 3) % 4]
    const [nx, nz] = corners[(c + 1) % 4]
    const vIn = new THREE.Vector2(px - cx, pz - cz).normalize()
    const vOut = new THREE.Vector2(nx - cx, nz - cz).normalize()
    const pIn = new THREE.Vector2(cx + vIn.x * r, cz + vIn.y * r)
    const pOut = new THREE.Vector2(cx + vOut.x * r, cz + vOut.y * r)
    pts.push(new THREE.Vector3(pIn.x, 0, pIn.y))
    for (let s = 1; s <= samples; s++) {
      const t = s / (samples + 1)
      const px2 = pIn.x + (pOut.x - pIn.x) * t
      const pz2 = pIn.y + (pOut.y - pIn.y) * t
      pts.push(new THREE.Vector3(px2, 0, pz2))
    }
  }
  return pts
}

/**
 * Clockwise loop around a block using right-hand lanes.
 * With X=east, Z=south, the block's inner lanes form the rectangle:
 *   north lane z0+lane, east lane x1-lane, south lane z1-lane, west lane x0+lane
 */
export function blockCircuit(block: BlockDef): THREE.Vector3[] {
  const { x0, x1, z0, z1 } = block
  const lane = LANE_OFFSET
  return roundedRectCorners(x0 + lane, z0 + lane, x1 - lane, z1 - lane, 3.2, 5)
}

/** Large perimeter circuit around the whole city (clockwise, inner lanes). */
export function perimeterCircuit(): THREE.Vector3[] {
  const lane = LANE_OFFSET
  const minX = -CITY_HALF + lane
  const maxX = CITY_HALF - lane
  const minZ = -CITY_HALF + lane
  const maxZ = CITY_HALF - lane
  return roundedRectCorners(minX, minZ, maxX, maxZ, 4, 5)
}

/** All vehicle circuits. */
export function getCircuits(): THREE.Vector3[][] {
  const circuits: THREE.Vector3[][] = []
  BLOCKS.forEach((b) => circuits.push(blockCircuit(b)))
  circuits.push(perimeterCircuit())
  return circuits
}

export const CIRCUITS = getCircuits()

/* ---------------------------------------------------------------------------
 * Pedestrian sidewalk paths.
 * Sidewalks run parallel to each road, offset just outside the road.
 * ------------------------------------------------------------------------- */

export interface SidewalkPath {
  points: THREE.Vector3[]
  center: THREE.Vector3
}

export function getSidewalks(): SidewalkPath[] {
  const paths: SidewalkPath[] = []
  const off = ROAD_HALF_WIDTH + SIDEWALK_WIDTH * 0.6
  // Horizontal road sidewalks (along X)
  for (const z of ROADS_Z) {
    for (const side of [-1, 1]) {
      const zz = z + side * off
      paths.push({
        points: [
          new THREE.Vector3(-CITY_HALF, 0.02, zz),
          new THREE.Vector3(CITY_HALF, 0.02, zz),
        ],
        center: new THREE.Vector3(0, 0.02, zz),
      })
    }
  }
  // Vertical road sidewalks (along Z)
  for (const x of ROADS_X) {
    for (const side of [-1, 1]) {
      const xx = x + side * off
      paths.push({
        points: [
          new THREE.Vector3(xx, 0.02, -CITY_HALF),
          new THREE.Vector3(xx, 0.02, CITY_HALF),
        ],
        center: new THREE.Vector3(xx, 0.02, 0),
      })
    }
  }
  return paths
}

export const SIDEWALKS = getSidewalks()

/** Random height/colorized building footprint generator within a block. */
export function generateBuildings(block: BlockDef, rng: () => number): Array<{
  x: number
  z: number
  w: number
  d: number
  h: number
  color: string
}> {
  const inset = ROAD_HALF_WIDTH + SIDEWALK_WIDTH + 1.2
  const minX = block.x0 + inset
  const maxX = block.x1 - inset
  const minZ = block.z0 + inset
  const maxZ = block.z1 - inset
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  const buildings: Array<{ x: number; z: number; w: number; d: number; h: number; color: string }> = []

  // 3-6 buildings per block in a loose grid
  const cols = spanX > 12 ? 2 : 1
  const rows = spanZ > 12 ? 2 : 1
  const palette = ['#94a3b8', '#cbd5e1', '#64748b', '#7c8a9a', '#a8b3c2', '#8a94a6']
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.25) continue
      const w = (spanX / cols) * (0.5 + rng() * 0.4)
      const d = (spanZ / rows) * (0.5 + rng() * 0.4)
      const h = 5 + rng() * 22
      const x = minX + (spanX / cols) * (c + 0.5) + (rng() - 0.5) * 1.5
      const z = minZ + (spanZ / rows) * (r + 0.5) + (rng() - 0.5) * 1.5
      buildings.push({
        x,
        z,
        w: Math.max(w, 4),
        d: Math.max(d, 4),
        h,
        color: palette[Math.floor(rng() * palette.length)],
      })
    }
  }
  return buildings
}
